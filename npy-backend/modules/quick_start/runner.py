import asyncio
import logging
import multiprocessing
import os
import signal
import threading
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import aiohttp
from bs4 import BeautifulSoup

from utils.mongo import mongo_manager
from utils.storage import load_raw_html, save_raw_html
from modules.module_E.brand_analyzer import BrandAnalyzer
from modules.module_E.competitor_analyzer import CompetitorAnalyzer
from modules.module_E.ranking_runner import run_ranking_analysis

logger = logging.getLogger("quick_start")

# ---------------------------------------------------------------------------
# Thread-safe background task registry
# ---------------------------------------------------------------------------
# run_quick_start is executed inside a ThreadPoolExecutor (one asyncio.run()
# per thread).  Multiple threads can concurrently add/discard tasks, so a
# lock is required — CPython's GIL does not guarantee atomicity across the
# dict/set read–modify–write cycle when used with done callbacks.
_background_tasks: set = set()
_background_tasks_lock = threading.Lock()


def _bg_add(task) -> None:
    with _background_tasks_lock:
        _background_tasks.add(task)


def _bg_discard(task) -> None:
    with _background_tasks_lock:
        _background_tasks.discard(task)


# ---------------------------------------------------------------------------
# Thread-local RabbitMQ publisher
# ---------------------------------------------------------------------------
# Each ThreadPoolExecutor thread maintains its own pika BlockingConnection so
# we never share a non-thread-safe connection between threads, and we never
# open a brand-new connection for every single event emission.
_tl_publisher = threading.local()


def _get_thread_publisher():
    """Return the pika EventPublisher for the current thread.
    Creates and connects a new publisher on first access; replaces it after
    any connection failure so the next call gets a fresh one.
    """
    pub = getattr(_tl_publisher, 'instance', None)
    if pub is not None:
        return pub
    from utils.event_publisher import EventPublisher
    pub = EventPublisher()
    pub.connect()
    _tl_publisher.instance = pub
    return pub


class JobCancelledError(Exception):
    """Raised when a job is cancelled mid-execution."""
    pass


def _is_cancelled(job_id: str) -> bool:
    """Check the Redis cancel flag set by Node.js on session delete."""
    try:
        from workers.queue_worker import is_job_cancelled
        return is_job_cancelled(job_id)
    except Exception:
        return False


def _check_cancelled(job_id: str) -> None:
    """Raise JobCancelledError if the job was cancelled."""
    if _is_cancelled(job_id):
        raise JobCancelledError(f"Job {job_id} was cancelled")


def _kill_crawl_proc(proc, manager) -> None:
    """Terminate a crawl subprocess and its manager."""
    if proc is None:
        return
    try:
        if proc.is_alive():
            logger.info(f"[QS] Terminating crawl subprocess (pid={proc.pid})")
            proc.terminate()
            proc.join(timeout=5)
            if proc.is_alive():
                logger.warning(f"[QS] Force-killing crawl subprocess (pid={proc.pid})")
                proc.kill()
                proc.join(timeout=3)
    except Exception as exc:
        logger.warning(f"[QS] Error killing crawl process: {exc}")
    if manager is not None:
        try:
            manager.shutdown()
        except Exception:
            pass


def _publish_event(job_id: str, event_type: str, payload: dict) -> None:
    """Publish a job event to RabbitMQ (best-effort, never raises).

    Reuses the thread-local pika connection so we don't open and close a
    brand-new TCP connection for every event.  On failure the broken
    connection is discarded and one retry is attempted with a fresh one.
    """
    try:
        pub = _get_thread_publisher()
        pub.emit_event(job_id, event_type, payload, retries=2)
    except Exception as first_exc:
        logger.warning(
            f"[QS] Publish {event_type} failed ({first_exc!r}); reconnecting and retrying once"
        )
        # Discard the broken connection so the next call gets a fresh one.
        _tl_publisher.instance = None
        try:
            pub = _get_thread_publisher()
            pub.emit_event(job_id, event_type, payload, retries=2)
        except Exception as retry_exc:
            logger.warning(f"[QS] Failed to publish {event_type} for {job_id} after reconnect: {retry_exc}")


def _mark_completed(job_id: str, session_id: str) -> None:
    """Signal job completion by publishing JOB_COMPLETED to RabbitMQ.

    The Node.js event consumer (job.events.queue.v3) and the Python
    queue_worker event consumer (job.events.queue) both receive this message
    and independently write the COMPLETED status to MongoDB and Redis via
    idempotent conditional updates.  Doing the DB write here as well would
    result in three concurrent writes to the same document with no ordering
    guarantee — the event-driven path is the single source of truth.
    """
    logger.info(f"[QS] Publishing JOB_COMPLETED for job {job_id}")
    _publish_event(job_id, "JOB_COMPLETED", {
        "status": "completed",
        "sessionId": session_id,
        "jobId": job_id,
    })


def _update_crawl_status(job_id: str, status: str) -> None:
    """Write crawl_status into the job_summaries document for this job.

    Possible values: 'running' | 'completed' | 'failed' | 'cancelled'.
    This is intentionally separate from the job status so the UI can show
    'Analysis complete — crawl still in progress' while pages are still
    being indexed in the background.
    Analysis fields (brand, competitor, ranking) live in module_e.
    """
    try:
        now = datetime.utcnow()
        mongo_manager.job_summaries.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "crawl_status": status,
                    "crawlUpdatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        logger.info(f"[QS] crawl_status → {status!r} for job {job_id}")
    except Exception as exc:
        logger.warning(f"[QS] Failed to write crawl_status for {job_id}: {exc}")

    # Broadcast live crawl status via RabbitMQ so the Node.js consumer can
    # push a socket event to the frontend instantly (no polling required).
    _publish_event(job_id, "CRAWL_STATUS_UPDATED", {
        "crawl_status": status,
        "jobId": job_id,
        "updatedAt": datetime.utcnow().isoformat(),
    })

def _infer_brand_name(url: str) -> str:
    """Derive a readable brand name from the URL domain."""
    try:
        parsed = urlparse(url if url.startswith("http") else f"https://{url}")
        domain = parsed.netloc or parsed.path
        parts = domain.replace("www.", "").split(".")
        return parts[0].capitalize() if parts else "Unknown"
    except Exception:
        return "Unknown"


# ---------------------------------------------------------------------------
# sub-task helpers
# ---------------------------------------------------------------------------

async def _fetch_and_store_homepage(job_id: str, url: str) -> str:
    """
    Fetches the homepage HTML and stores it in S3 so every downstream module
    (ranking analysis, entity coverage, etc.) can call load_raw_html(job_id)
    and get real content without needing the background crawl to finish first.

    Returns the raw HTML string (may be empty if fetch failed).
    """
    if not url:
        return ""
    full_url = url if url.startswith(("http://", "https://")) else f"https://{url}"
    html = ""
    try:
        timeout = aiohttp.ClientTimeout(total=30)
        headers = {"User-Agent": "Mozilla/5.0 (compatible; YogreetBot/1.0)"}
        async with aiohttp.ClientSession(headers=headers) as session:
            async with session.get(full_url, timeout=timeout, allow_redirects=True) as resp:
                if resp.status == 200:
                    html = await resp.text(errors="replace")
                    logger.info(f"[QS] Homepage fetched ({len(html)} bytes) for {url}")
                else:
                    logger.warning(f"[QS] Homepage fetch returned status {resp.status} for {url}")
    except Exception as exc:
        logger.warning(f"[QS] Homepage fetch failed for {url}: {type(exc).__name__}: {exc}")

    if html:
        try:
            await save_raw_html(job_id, html)
            logger.info(f"[QS] Homepage HTML saved to S3 for job {job_id}")
        except Exception as exc:
            logger.warning(f"[QS] Failed to save homepage HTML to S3: {exc}")

    return html


async def _run_brand(job_id: str, brand_name: str) -> Dict[str, Any]:
    """Run Brand Analysis and upsert `brand_analysis` into quick_start."""
    logger.info(f"[QS] Brand analysis started for '{brand_name}'")
    try:
        brand_analysis = await BrandAnalyzer.analyze_brand(brand_name)
    except Exception as exc:
        logger.error(f"[QS] Brand analysis error: {exc}", exc_info=True)
        return {"error": str(exc)}

    try:
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    "brand_analysis": brand_analysis,
                    "updatedAt": datetime.utcnow(),
                },
                "$setOnInsert": {"createdAt": datetime.utcnow()},
            },
            upsert=True,
        )
    except Exception as exc:
        logger.warning(f"[QS] Failed to persist brand analysis: {exc}")

    logger.info(f"[QS] Brand analysis done for '{brand_name}'")
    return brand_analysis


async def _run_competitors_and_sov(job_id: str, url: str, brand_name: str) -> Dict[str, Any]:
    logger.info(f"[QS] Competitor + AI SOV analysis started for '{brand_name}'")
    analyzer = CompetitorAnalyzer()
    try:
        results = await analyzer.analyze(url, brand_name=brand_name)
    except Exception as exc:
        logger.error(f"[QS] Competitor analysis error: {exc}", exc_info=True)
        return {"error": str(exc)}

    ai_sov = results.get("ai_sov") or {}
    sov_snapshot = {
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "overall_sov": ai_sov.get("overall_sov", 0),
        "visibility_tier": ai_sov.get("visibility_tier", "Not yet AI-indexed"),
        "brand_known_by_models": ai_sov.get("brand_known_by_models", []),
        "by_model": ai_sov.get("by_model", {}),
    }

    try:
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId":               job_id,
                    "competitor_mentions": results.get("mentions"),
                    "ai_share_of_voice":   ai_sov,
                    "updatedAt":           datetime.utcnow(),
                },
                "$setOnInsert": {"createdAt": datetime.utcnow()},
                "$push": {
                    "ai_sov_history": {
                        "$each":  [sov_snapshot],
                        "$slice": -12,
                    }
                },
            },
            upsert=True,
        )
    except Exception as exc:
        logger.warning(f"[QS] Failed to persist competitor/SOV: {exc}")

    competitors_found = len(results.get("competitors", []))
    logger.info(f"[QS] Competitor + AI SOV analysis done — {competitors_found} competitors found")
    return results


def _start_crawl(
    job_id: str,
    url: str,
    session_id: str,
    project_id: str,
):
    """
    Fire-and-forget: launches the Scrapy crawler in a subprocess and returns
    immediately.  The crawl stores pages into MongoDB / S3 in the background
    and does NOT block brand, competitor, or ranking analysis.

    Returns (proc, manager, state) so the caller can reap the process later.
    """
    from workers.executors.crawler import spawn_ctx, _run_spider_subprocess
    from workers.worker_config import SCRAPY_SETTINGS

    manager = spawn_ctx.Manager()
    state = manager.dict()
    state["success"] = False
    state["error"] = None

    proc = spawn_ctx.Process(
        target=_run_spider_subprocess,
        args=(state, url, session_id, job_id, project_id, 0, 0, SCRAPY_SETTINGS),
        kwargs={"suppress_completion_events": True},
    )
    proc.start()
    logger.info(f"[QS] Crawl process launched (pid={proc.pid}) for {url} — running in background")
    return proc, manager, state


async def _run_ranking(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """
    Run Ranking Analysis (Trends by Model).
    Accepts pre-fetched homepage HTML so the S3 round-trip is skipped when
    called in parallel with the homepage fetch task.  Falls back to live
    fetch / S3 if html_content is not provided.
    Persists `ranking_analysis` into module_e (single source of truth).
    """
    try:
        result = await run_ranking_analysis(job_id=job_id, url=url, html_content=html_content or None)
        return result
    except Exception as exc:
        logger.error(f"[QS] Ranking analysis error: {exc}", exc_info=True)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# public entry point
# ---------------------------------------------------------------------------

async def run_quick_start(
    job_id: str,
    url: str,
    session_id: str = None,
    project_id: str = None,
    html_content: str = None,
) -> Dict[str, Any]:
    """
    Entry point consumed by queue_worker.py for MODULE_E_QUICK_START jobs.

    Execution order (optimised for minimum wall-clock time):

      Step 0 — Homepage fetch   (~1-2 s, single HTTP GET)
        • Downloads and stores the homepage HTML in S3 so ranking analysis
          receives real content immediately — no S3 round-trip needed.

      Crawl   (background, fire-and-forget, parallel with everything else)
        • Launches the full Scrapy crawl in a subprocess — stores pages to
          MongoDB / S3 independently, never blocks any analysis phase.

      Combined phase — ALL THREE in parallel (after Step 0):
        • Brand Analysis      — DataForSEO brand mentions + sentiment
        • Competitor + AI SOV — CompetitorAnalyzer (mentions + SOV + history)
        • Ranking Analysis    — DataForSEO AI model ranking across ChatGPT/Gemini
          ↳ Receives the pre-fetched HTML directly; no additional network call.

      Total analysis time ≈ max(T_brand, T_competitor, T_ranking)
      instead of the old T_brand + T_competitor + T_ranking (sequential phases).

    All results are stored under the same `jobId` in `module_e` so that
    `GET /quick-start/jobs/:jobId` resolves all four frontend sections.
    """
    mongo_manager.connect()

    brand_name = _infer_brand_name(url)
    logger.info(f"[QS] Job {job_id} started — url={url}, brand='{brand_name}'")

    _session_id  = session_id  or job_id
    _project_id  = project_id  or ""

    _publish_event(job_id, "JOB_STARTED", {
        "status": "running",
        "sessionId": _session_id,
        "projectId": _project_id,
        "jobId": job_id,
        "url": url,
    })

    crawl_proc = None
    crawl_manager = None
    crawl_state = None
    try:
        crawl_proc, crawl_manager, crawl_state = _start_crawl(job_id, url, _session_id, _project_id)
        _update_crawl_status(job_id, "running")
    except Exception as exc:
        logger.error(f"[QS] Crawl launch failed: {exc}", exc_info=exc)
        _update_crawl_status(job_id, "failed")

    try:
        # ── Step 0: fetch homepage fast so all three analyses get real content ──
        # This is a single lightweight HTTP GET (~1–2 s).  Everything downstream
        # receives the HTML directly — no S3 round-trip needed.
        logger.info("[QS] Fetching homepage (fast path before parallel analyses)")
        html_content = await _fetch_and_store_homepage(job_id, url)

        if _is_cancelled(job_id):
            logger.info(f"[QS] Job {job_id} cancelled before analyses — aborting")
            _update_crawl_status(job_id, "cancelled")
            return {"job_id": job_id, "success": False, "cancelled": True}

        # ── Combined Phase: brand + competitor + ranking ALL in parallel ──────
        # Ranking does NOT depend on brand or competitor results — it only
        # needs the URL and homepage HTML, both of which are now available.
        # Running all three concurrently cuts total wait time from
        #   T_brand + T_competitor + T_ranking   →   max(T_brand, T_competitor, T_ranking)
        logger.info("[QS] Starting brand, competitor & ranking analyses in parallel")
        _publish_event(job_id, "QS_STEP_UPDATE", {"step": "brand_analysis",      "stepStatus": "running"})
        _publish_event(job_id, "QS_STEP_UPDATE", {"step": "competitor_analysis", "stepStatus": "running"})
        _publish_event(job_id, "QS_STEP_UPDATE", {"step": "ranking_analysis",    "stepStatus": "running"})

        brand_result, competitor_result, ranking_result = await asyncio.gather(
            _run_brand(job_id, brand_name),
            _run_competitors_and_sov(job_id, url, brand_name),
            _run_ranking(job_id, url, html_content=html_content),  # pre-fetched HTML — no extra fetch
            return_exceptions=True,
        )

        if isinstance(brand_result, Exception):
            logger.error(f"[QS] Brand task raised: {brand_result}", exc_info=brand_result)
            brand_result = {"error": str(brand_result)}
            _publish_event(job_id, "QS_STEP_UPDATE", {"step": "brand_analysis", "stepStatus": "failed"})
        else:
            _publish_event(job_id, "QS_STEP_UPDATE", {"step": "brand_analysis", "stepStatus": "completed"})

        if isinstance(competitor_result, Exception):
            logger.error(f"[QS] Competitor task raised: {competitor_result}", exc_info=competitor_result)
            competitor_result = {"error": str(competitor_result)}
            _publish_event(job_id, "QS_STEP_UPDATE", {"step": "competitor_analysis", "stepStatus": "failed"})
        else:
            _publish_event(job_id, "QS_STEP_UPDATE", {"step": "competitor_analysis", "stepStatus": "completed"})

        if isinstance(ranking_result, Exception):
            logger.error(f"[QS] Ranking task raised: {ranking_result}", exc_info=ranking_result)
            ranking_result = {"error": str(ranking_result)}
            _publish_event(job_id, "QS_STEP_UPDATE", {"step": "ranking_analysis", "stepStatus": "failed"})
        else:
            _publish_event(job_id, "QS_STEP_UPDATE", {"step": "ranking_analysis", "stepStatus": "completed"})

        if _is_cancelled(job_id):
            logger.info(f"[QS] Job {job_id} cancelled after analyses — aborting, killing crawler")
            _update_crawl_status(job_id, "cancelled")
            return {"job_id": job_id, "success": False, "cancelled": True}

        _mark_completed(job_id, _session_id)

        # ── Schedule crawl reaper on the RUNNING event loop ─────────────
        # asyncio.get_running_loop() is always correct here because we are
        # inside an async function called via asyncio.run().  The deprecated
        # asyncio.get_event_loop() could return the wrong loop when called
        # from a non-main thread (e.g., our ThreadPoolExecutor workers).
        if crawl_proc is not None:
            _proc_ref = crawl_proc
            _manager_ref = crawl_manager
            _state_ref = crawl_state

            def _join_and_shutdown():
                _proc_ref.join()
                # Read the outcome flag BEFORE shutting down the Manager
                # server — the dict becomes inaccessible after shutdown().
                crawl_succeeded = False
                try:
                    crawl_succeeded = bool(_state_ref.get("success"))
                except Exception:
                    pass
                if _manager_ref is not None:
                    try:
                        _manager_ref.shutdown()
                    except Exception:
                        pass
                # Write the final crawl status now that the subprocess is done.
                final_crawl_status = "completed" if crawl_succeeded else "failed"
                _update_crawl_status(job_id, final_crawl_status)
                _publish_event(job_id, "QS_CRAWL_STATUS", {
                    "crawlStatus": final_crawl_status,
                    "jobId": job_id,
                })

            loop = asyncio.get_running_loop()
            task = loop.run_in_executor(None, _join_and_shutdown)
            _bg_add(task)
            task.add_done_callback(_bg_discard)
            # Re-assign so the finally block knows the reaper is scheduled.
            crawl_proc = None
            crawl_manager = None

        logger.info(f"[QS] Job {job_id} complete")
        return {
            "job_id":              job_id,
            "brand_analysis":      brand_result,
            "competitor_analysis": competitor_result,
            "ranking_analysis":    ranking_result,
            "success":             True,
        }

    finally:
        # Guarantee the crawl subprocess and its Manager are always cleaned up
        # even if an unexpected exception is raised during the analysis phases.
        # crawl_proc is set to None above once the reaper Future is scheduled,
        # so this block is only reached on the error path.
        if crawl_proc is not None:
            _kill_crawl_proc(crawl_proc, crawl_manager)
            _update_crawl_status(job_id, "failed")

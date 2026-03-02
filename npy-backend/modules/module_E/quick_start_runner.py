import asyncio
import logging
import multiprocessing
import os
import signal
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import aiohttp
from bs4 import BeautifulSoup

from utils.mongo import mongo_manager
from utils.storage import load_raw_html, save_raw_html
from .brand_analyzer import BrandAnalyzer
from .competitor_analyzer import CompetitorAnalyzer
from .ranking_runner import run_ranking_analysis

logger = logging.getLogger("module_e_quick_start")

# Strong references to background reaper tasks so they (and the Manager they
# hold) don't get garbage-collected while the crawl subprocess is still running.
_background_tasks: set = set()


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

    Creates a fresh publisher per call to avoid sharing a pika connection
    across threads from the ThreadPoolExecutor.
    """
    try:
        from utils.event_publisher import EventPublisher
        pub = EventPublisher()
        pub.connect()
        pub.emit_event(job_id, event_type, payload, retries=2)
        pub.close()
    except Exception as exc:
        logger.warning(f"[QS] Failed to publish {event_type} for {job_id}: {exc}")


def _mark_completed(job_id: str, session_id: str) -> None:
    """Mark job and session as COMPLETED in Mongo + Redis immediately,
    then publish a JOB_COMPLETED event so Node.js emits job:completed
    via Socket.IO without waiting for the background crawl."""
    try:
        from workers.queue_worker import mark_job_completed
        mark_job_completed(job_id, session_id)
        logger.info(f"[QS] Job {job_id} marked COMPLETED in Mongo/Redis")
    except Exception as exc:
        logger.error(f"[QS] Failed to mark job {job_id} completed: {exc}", exc_info=True)

    # Publish to RabbitMQ so Node.js consumer emits job:completed socket event
    # immediately (independent of the background crawl).
    _publish_event(job_id, "JOB_COMPLETED", {
        "status": "completed",
        "sessionId": session_id,
        "jobId": job_id,
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
    """Run Brand Analysis and upsert `brand_analysis` into module_e."""
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
                        "$slice": -12,          # keep last 12 snapshots
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

    Returns (proc, manager) so the caller can reap the process later.
    """
    from workers.queue_worker import spawn_ctx, _run_spider_subprocess
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
    return proc, manager


async def _run_ranking(job_id: str, url: str) -> Dict[str, Any]:
    """
    Run Ranking Analysis (Trends by Model).
    Fetches homepage live if no crawl data exists, then uses DataForSEO
    to check brand ranking across AI models (ChatGPT, Gemini).
    Persists `ranking_analysis` into the same module_e document.
    """
    try:
        result = await run_ranking_analysis(job_id=job_id, url=url, html_content=None)
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

    Crawl (background, fire-and-forget):
      • Launches the full Scrapy crawl in a subprocess — stores pages to
        MongoDB / S3 independently, never blocks any analysis phase.

    Phase 1 (parallel):
      • Brand Analysis        — DataForSEO brand mentions + sentiment
      • Competitor + AI SOV   — CompetitorAnalyzer (mentions + SOV + history)

    Phase 2 (sequential, after Phase 1):
      • Ranking Analysis      — Tries S3 HTML first; if the crawl hasn't
                                stored it yet, falls back to live HTTP fetch.

    All results are stored under the same `jobId` in `module_e` so that
    `GET /module-e/jobs/:jobId` resolves all four frontend sections.
    """
    mongo_manager.connect()

    brand_name = _infer_brand_name(url)
    logger.info(f"[QS] Job {job_id} started — url={url}, brand='{brand_name}'")

    # Fallback identifiers for the crawl subprocess
    _session_id  = session_id  or job_id
    _project_id  = project_id  or ""

    # ── Publish JOB_STARTED so Node.js marks job RUNNING and emits socket event ──
    _publish_event(job_id, "JOB_STARTED", {
        "status": "running",
        "sessionId": _session_id,
        "projectId": _project_id,
        "jobId": job_id,
        "url": url,
    })

    # ── Start crawl (fire-and-forget — runs in background) ────────────────
    crawl_proc = None
    crawl_manager = None
    try:
        crawl_proc, crawl_manager = _start_crawl(
            job_id, url, _session_id, _project_id,
        )
    except Exception as exc:
        logger.error(f"[QS] Crawl launch failed: {exc}", exc_info=exc)

    # ── Phase 1: homepage fetch + brand + competitor in parallel ─────────
    # Homepage HTML is fetched and saved to S3 here so that Phase 2
    # (ranking analysis) can call load_raw_html(job_id) and get real content
    # without waiting for the background crawl to finish.
    # Brand and competitor analyses don't need HTML so they run at the same time.
    logger.info(f"[QS] Phase 1 — homepage fetch, brand & competitor analysis running in parallel")
    _publish_event(job_id, "QS_STEP_UPDATE", {"step": "brand_analysis", "stepStatus": "running"})
    _publish_event(job_id, "QS_STEP_UPDATE", {"step": "competitor_analysis", "stepStatus": "running"})

    _, brand_result, competitor_result = await asyncio.gather(
        _fetch_and_store_homepage(job_id, url),
        _run_brand(job_id, brand_name),
        _run_competitors_and_sov(job_id, url, brand_name),
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

    # ── Check cancellation before Phase 2 ─────────────────────────────────
    if _is_cancelled(job_id):
        logger.info(f"[QS] Job {job_id} cancelled after Phase 1 — aborting")
        _kill_crawl_proc(crawl_proc, crawl_manager)
        return {"job_id": job_id, "success": False, "cancelled": True}

    # ── Phase 2: ranking analysis ─────────────────────────────────────────
    # ranking_runner will try S3 HTML first; if the crawl hasn't stored it
    # yet it falls back to a live HTTP fetch automatically.
    logger.info(f"[QS] Phase 2 — ranking analysis starting")
    _publish_event(job_id, "QS_STEP_UPDATE", {"step": "ranking_analysis", "stepStatus": "running"})
    try:
        ranking_result = await _run_ranking(job_id, url)
        _publish_event(job_id, "QS_STEP_UPDATE", {"step": "ranking_analysis", "stepStatus": "completed"})
    except Exception as exc:
        logger.error(f"[QS] Ranking task raised: {exc}", exc_info=exc)
        ranking_result = {"error": str(exc)}
        _publish_event(job_id, "QS_STEP_UPDATE", {"step": "ranking_analysis", "stepStatus": "failed"})

    # ── Check cancellation after Phase 2 ──────────────────────────────────
    if _is_cancelled(job_id):
        logger.info(f"[QS] Job {job_id} cancelled after Phase 2 — aborting, killing crawler")
        _kill_crawl_proc(crawl_proc, crawl_manager)
        return {"job_id": job_id, "success": False, "cancelled": True}

    # ── Mark job/session COMPLETED immediately after ranking — don't wait for crawl ──
    # This publishes JOB_COMPLETED to RabbitMQ so Node.js instantly emits
    # job:completed via Socket.IO. The background crawl stores pages  
    # independently and does NOT affect session completion.
    _mark_completed(job_id, _session_id)

    # Reap the crawl process in the background so we don't accumulate zombies.
    # The manager must be shut down AFTER join() so its server socket remains
    # available to the subprocess for the entire duration of the crawl.
    if crawl_proc is not None:
        _manager_ref = crawl_manager  # keep alive in closure

        def _join_and_shutdown():
            crawl_proc.join()
            if _manager_ref is not None:
                try:
                    _manager_ref.shutdown()
                except Exception:
                    pass

        loop = asyncio.get_event_loop()
        task = asyncio.ensure_future(loop.run_in_executor(None, _join_and_shutdown))
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

    logger.info(f"[QS] Job {job_id} complete")
    return {
        "job_id":              job_id,
        "brand_analysis":      brand_result,
        "competitor_analysis": competitor_result,
        "ranking_analysis":    ranking_result,
        "success":             True,
    }

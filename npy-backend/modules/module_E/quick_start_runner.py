import asyncio
import logging
import os
import sys
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from utils.mongo import mongo_manager
from utils.storage import load_raw_html
from .brand_analyzer import BrandAnalyzer
from .competitor_analyzer import CompetitorAnalyzer
from .ranking_runner import run_ranking_analysis

logger = logging.getLogger("module_e_quick_start")


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

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


async def _start_crawl_and_wait_for_homepage(
    job_id: str,
    url: str,
    session_id: str,
    project_id: str,
    poll_interval: float = 2.0,
    poll_timeout: float = 120.0,
) -> Optional[asyncio.subprocess.Process]:
    """
    Launches the Scrapy crawler as an asyncio subprocess so it runs in the
    background and crawls the entire website.

    The spider already saves the homepage HTML synchronously as soon as it
    processes crawl_depth == 0.  We poll load_raw_html() until that file
    appears (or poll_timeout is exceeded) before returning, ensuring that
    the ranking runner always has real crawl data to work with.

    Returns the subprocess handle so the caller can optionally await it later.
    """
    # Resolve the npy-backend root so the subprocess can import all modules.
    npy_root = os.path.dirname(  # npy-backend/
        os.path.dirname(          # modules/
            os.path.dirname(       # module_E/
                os.path.abspath(__file__)
            )
        )
    )

    cmd = [
        sys.executable, "-m", "workers.crawl_worker.crawler",
        "--url",        url,
        "--session-id", session_id,
        "--job-id",     job_id,
        "--project-id", project_id,
        "--max-pages",  "0",   # unlimited — crawl the whole site
        "--max-concurrency", "20",
    ]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=npy_root,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        logger.info(f"[QS] Crawl subprocess launched for {url} (job={job_id})")
    except Exception as exc:
        logger.error(f"[QS] Failed to start crawl subprocess: {exc}", exc_info=True)
        return None

    # Poll until the spider writes the homepage HTML (crawl_depth == 0)
    elapsed = 0.0
    while elapsed < poll_timeout:
        await asyncio.sleep(poll_interval)
        elapsed += poll_interval
        try:
            html = await load_raw_html(job_id)
        except Exception:
            html = ""
        if html:
            logger.info(f"[QS] Homepage HTML ready after {elapsed:.1f}s")
            return proc

    logger.warning(
        f"[QS] Timed out waiting for homepage HTML after {poll_timeout}s; proceeding anyway",
        extra={"job_id": job_id},
    )
    return proc


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

    Phase 1 (parallel):
      • Brand Analysis        — DataForSEO brand mentions + sentiment
      • Competitor + AI SOV   — CompetitorAnalyzer (mentions + SOV + history)
      • Crawl launch          — Starts the full Scrapy crawl in a subprocess;
                                the spider writes the homepage HTML as soon as
                                it processes crawl_depth == 0, then keeps
                                crawling the entire site in the background.

    Phase 2 (after homepage HTML is ready):
      • Ranking Analysis      — Uses the real crawled homepage HTML (not a
                                plain aiohttp fetch) for richer prompt content.

    All results are stored under the same `jobId` in `module_e` so that
    `GET /module-e/jobs/:jobId` resolves all four frontend sections.
    """
    mongo_manager.connect()

    brand_name = _infer_brand_name(url)
    logger.info(f"[QS] Job {job_id} started — url={url}, brand='{brand_name}'")

    # Fallback identifiers for the crawl subprocess
    _session_id  = session_id  or job_id
    _project_id  = project_id  or ""

    # ── Phase 1: run in parallel ──────────────────────────────────────────
    # Brand/competitor analyses don't need HTML, so they start immediately.
    # _start_crawl_and_wait_for_homepage launches the full Scrapy crawler and
    # blocks only until the homepage (crawl_depth == 0) is stored — the crawl
    # then continues in the background while Phase 2 runs.
    logger.info(f"[QS] Phase 1 — brand, competitor & crawl running in parallel")
    brand_result, competitor_result, crawl_proc = await asyncio.gather(
        _run_brand(job_id, brand_name),
        _run_competitors_and_sov(job_id, url, brand_name),
        _start_crawl_and_wait_for_homepage(job_id, url, _session_id, _project_id),
        return_exceptions=True,
    )

    if isinstance(brand_result, Exception):
        logger.error(f"[QS] Brand task raised: {brand_result}", exc_info=brand_result)
        brand_result = {"error": str(brand_result)}

    if isinstance(competitor_result, Exception):
        logger.error(f"[QS] Competitor task raised: {competitor_result}", exc_info=competitor_result)
        competitor_result = {"error": str(competitor_result)}

    if isinstance(crawl_proc, Exception):
        logger.error(f"[QS] Crawl launch raised: {crawl_proc}", exc_info=crawl_proc)
        crawl_proc = None

    # ── Phase 2: ranking (homepage HTML already written by crawler) ───────
    # The spider stored real crawled HTML at crawl_depth == 0; ranking_runner
    # will pick it up via load_raw_html(job_id), yielding richer prompt content
    # than a plain aiohttp text fetch.  The full crawl continues in background.
    logger.info(f"[QS] Phase 2 — ranking analysis starting")
    try:
        ranking_result = await _run_ranking(job_id, url)
    except Exception as exc:
        logger.error(f"[QS] Ranking task raised: {exc}", exc_info=exc)
        ranking_result = {"error": str(exc)}

    # Register a background task to reap the crawl subprocess when it finishes
    # so we don't accumulate zombie processes.
    if crawl_proc is not None:
        asyncio.ensure_future(crawl_proc.wait())

    logger.info(f"[QS] Job {job_id} complete")
    return {
        "job_id":              job_id,
        "brand_analysis":      brand_result,
        "competitor_analysis": competitor_result,
        "ranking_analysis":    ranking_result,
        "success":             True,
    }

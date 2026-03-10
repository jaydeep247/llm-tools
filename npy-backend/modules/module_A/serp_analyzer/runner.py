"""Runner for the SERP Analyzer module.

Called by the Module-A executor with a deserialized job payload dict.
Persists results to MongoDB and publishes a JOB_COMPLETED event.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from utils.mongo import mongo_manager
from utils.logger import logger as root_logger
from .serp_analyzer import run_serp_analysis

logger = logging.getLogger("serp_analyzer")


async def run_serp_analyzer(
    job_id: str,
    session_id: str,
    url: str,
    keywords: list[str],
    competitors: list[str],
    location_code: int,
    language_code: str,
    device: str,
    dataforseo_login: str,
    dataforseo_password: str,
) -> dict:
    """Entry point called by the executor.  Returns the persisted result dict."""

    root_logger.info(
        f"[SERP_RUNNER] Starting analysis | job={job_id} "
        f"keywords={len(keywords)} "
        f"url={url[:60]}"
    )

    result = await run_serp_analysis(
        job_id=job_id,
        session_id=session_id,
        url=url,
        keywords=keywords,
        competitors=competitors,
        location_code=location_code,
        language_code=language_code,
        device=device,
        dataforseo_login=dataforseo_login,
        dataforseo_password=dataforseo_password,
    )

    result_dict = result.to_dict()

    # ── Persist to MongoDB ─────────────────────────────────────────────
    try:
        mongo_manager.connect()
        mongo_manager.serp_results.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    **result_dict,
                    # Explicit camelCase aliases so Node.js queries work correctly.
                    # (asdict() produces snake_case job_id / session_id)
                    "jobId": job_id,
                    "sessionId": session_id,
                    "updatedAt": datetime.now(timezone.utc),
                }
            },
            upsert=True,
        )
        root_logger.info(f"[SERP_RUNNER] Persisted results for job={job_id}")
    except Exception as exc:
        logger.error(f"[SERP_RUNNER] MongoDB persist failed: {exc}", exc_info=True)

    return result_dict

"""Competitor AI Intelligence executor (Module F)."""

import asyncio
from utils.logger import configure_logger, logger


def execute_module_f_job(payload: dict) -> bool:
    """Execute Module F (Competitor AI Intelligence) job."""
    from modules.module_F.runner import run_module_f_competitor_ai_intelligence

    configure_logger()

    session_id = payload["sessionId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_F_COMPETITOR_AI_INTELLIGENCE").upper()
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")

    target_job_id = source_job_id if source_job_id else job_id

    logger.info(
        f"[MODULE_F] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}..."
    )

    try:
        result = asyncio.run(run_module_f_competitor_ai_intelligence(target_job_id, url))

        if isinstance(result, dict) and "error" in result:
            logger.error(f"[MODULE_F] ⚠️  Module returned error: {result.get('error')}")

        logger.info(f"[MODULE_F] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_F] ❌ {job_type} Processing failed: {e}", exc_info=True)
        raise

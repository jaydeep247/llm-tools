"""Content Analysis executor (Module D)."""

import asyncio
from utils.logger import configure_logger, logger


def execute_module_d_job(payload: dict) -> bool:
    """Execute Module D (Content Analysis) job."""
    from modules.module_D.runner import run_module_d, run_content_metrics, run_entity_analysis, run_prompt_tracking

    configure_logger()

    session_id = payload["sessionId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_D").upper()
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")

    target_job_id = source_job_id if source_job_id else job_id

    logger.info(
        f"[MODULE_D] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}..."
    )

    try:
        if job_type in ("MODULE_D_CONTENT_METRICS", "CONTENT_METRICS"):
            result = asyncio.run(run_content_metrics(target_job_id, url))
        elif job_type == "MODULE_D_PROMPT_TRACKING":
            prompts = payload.get("trackedPrompts") or payload.get("prompts") or payload.get("config", {}).get("trackedPrompts") or []
            result = asyncio.run(run_prompt_tracking(target_job_id, url, prompts))
        elif job_type == "MODULE_D_ENTITY_ANALYSIS":
            result = asyncio.run(run_entity_analysis(target_job_id, url))
        else:
            result = asyncio.run(run_module_d(target_job_id, url))

        if isinstance(result, dict) and "error" in result:
            logger.error(f"[MODULE_D] ⚠️  Module returned error: {result.get('error')}")
            if "HTML" in str(result.get("error", "")):
                raise RuntimeError(
                    f"HTML not found for job {target_job_id}. "
                    "Make sure sourceJobId is provided."
                )

        logger.info(f"[MODULE_D] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_D] ❌ {job_type} Processing failed: {e}", exc_info=True)
        raise

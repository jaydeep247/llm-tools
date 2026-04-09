"""Competitor AI Intelligence executor (Module F)."""

import asyncio
from utils.logger import configure_logger, logger
from workers.cancellation import run_cancellable


def execute_module_f_job(payload: dict) -> bool:
    """Execute Module F (Competitor AI Intelligence) job."""
    from modules.module_F.runner import run_module_f_competitor_ai_intelligence

    configure_logger()

    session_id = payload["sessionId"]
    project_id = payload.get("projectId") or ""
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_F_COMPETITOR_AI_INTELLIGENCE").upper()
    # source_job_id is the job whose module_e / context data we read from.
    # It must NOT be used as the write key — all writes (cbm_citation_snapshots,
    # module_f, etc.) must use job_id so every run produces a distinct document.
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId") or job_id

    logger.info(
        f"[MODULE_F] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}..."
    )

    try:
        result = asyncio.run(
            run_cancellable(
                run_module_f_competitor_ai_intelligence(
                    job_id,
                    url,
                    session_id=session_id,
                    project_id=project_id or None,
                    source_job_id=source_job_id,
                ),
                job_id,
            )
        )

        if isinstance(result, dict) and "error" in result:
            error_msg = result.get("error", "Module F returned an error")
            logger.error(f"[MODULE_F] ⚠️  Module returned error: {error_msg}")
            raise RuntimeError(error_msg)

        logger.info(f"[MODULE_F] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_F] ❌ {job_type} Processing failed: {e}", exc_info=True)
        raise

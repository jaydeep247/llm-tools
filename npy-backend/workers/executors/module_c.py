"""AEO Analysis executor (Module C)."""

import asyncio
from utils.logger import configure_logger, logger


def execute_module_c_job(payload: dict) -> bool:
    """Execute Module C (AEO Analysis) job."""
    from modules.module_C.runner import runner, run_module_c

    configure_logger()

    session_id = payload["sessionId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "AEO_ANALYSIS")
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    query = payload.get("query") or payload.get("config", {}).get("query")
    html_content = payload.get("htmlContent") or payload.get("html_content")

    target_job_id = source_job_id if source_job_id else job_id

    logger.info(
        f"[MODULE_C] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}..."
    )

    try:
        if job_type == "MODULE_C_AI_PRESENCE":
            result = asyncio.run(runner.run_submodule("ai_presence", target_job_id, url, html_content=html_content, query=query))
        elif job_type == "MODULE_C_ANSWERABILITY":
            result = asyncio.run(runner.run_submodule("answerability", target_job_id, url, html_content=html_content, query=query))
        elif job_type == "MODULE_C_KNOWLEDGE_BASE":
            result = asyncio.run(runner.run_submodule("knowledge_base", target_job_id, url, html_content=html_content, query=query))
        elif job_type == "MODULE_C_LLM_SIMULATOR":
            result = asyncio.run(runner.run_submodule("llm_simulator", target_job_id, url, html_content=html_content, query=query))
        elif job_type == "MODULE_C_ACTIONABLE_INSIGHTS":
            result = asyncio.run(runner.run_submodule("actionable_insights", target_job_id, url, html_content=html_content, query=query))
        else:
            result = asyncio.run(run_module_c(target_job_id, url, html_content=html_content, query=query))

        if isinstance(result, dict) and "error" in result:
            error_msg = result.get("error", "")
            if "HTML not found" in error_msg or "S3" in error_msg:
                raise RuntimeError(
                    f"HTML not found in S3 for job {target_job_id}. Run CRAWLER first."
                )
            raise RuntimeError(f"Module C analysis error: {error_msg}")

        logger.info(f"[MODULE_C] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_C] ❌ {job_type} Processing failed: {e}", exc_info=True)
        raise

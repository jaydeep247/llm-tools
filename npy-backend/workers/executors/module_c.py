"""AEO Analysis executor (Module C)."""

import asyncio
from utils.logger import configure_logger, logger

# New C-submodule names that map to runner.run_submodule()
_C_SUBMODULE_JOB_MAP = {
    "MODULE_C_C5": "c5",
    "MODULE_C_C1": "c1",
    "MODULE_C_C2": "c2",
    "MODULE_C_C3": "c3",
    "MODULE_C_C4": "c4",
    "MODULE_C_C6": "c6",
    "MODULE_C_C7": "c7",
    "MODULE_C_C8": "c8",
    "MODULE_C_C9": "c9",
    # Legacy names → run full pipeline via run_submodule fallback
    "MODULE_C_AI_PRESENCE": "ai_presence",
    "MODULE_C_ANSWERABILITY": "answerability",
    "MODULE_C_KNOWLEDGE_BASE": "knowledge_base",
    "MODULE_C_LLM_SIMULATOR": "llm_simulator",
    "MODULE_C_ACTIONABLE_INSIGHTS": "actionable_insights",
}


def execute_module_c_job(payload: dict) -> bool:
    """Execute Module C (AEO Analysis) job."""
    from modules.module_C.runner import runner, run_module_c

    configure_logger()

    session_id = payload["sessionId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "AEO_ANALYSIS")
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId") or ""
    query = payload.get("query") or payload.get("config", {}).get("query")
    html_content = payload.get("htmlContent") or payload.get("html_content")
    domain = payload.get("domain", "")
    industry = payload.get("industry", "")

    logger.info(
        f"[MODULE_C] {job_type} Processing started | Job: {job_id} | Source: {source_job_id} | URL: {url[:50]}..."
    )

    try:
        submodule = _C_SUBMODULE_JOB_MAP.get(job_type)

        if job_type == "MODULE_C_BULK_AUDIT":
            urls = payload.get("urls", [])
            result = asyncio.run(
                runner.run_bulk_audit(urls=urls or None, job_id=job_id, industry=industry)
            )
        elif submodule:
            result = asyncio.run(
                runner.run_submodule(
                    submodule, job_id, url,
                    source_job_id=source_job_id,
                    html_content=html_content, query=query,
                    domain=domain, industry=industry,
                )
            )
        else:
            # Default: full pipeline
            result = asyncio.run(
                run_module_c(
                    job_id, url,
                    source_job_id=source_job_id,
                    html_content=html_content, query=query,
                    domain=domain, industry=industry,
                )
            )

        if isinstance(result, dict) and "error" in result:
            error_msg = result.get("error", "")
            if "HTML not found" in error_msg or "S3" in error_msg:
                raise RuntimeError(
                    f"HTML not found in S3 for job {source_job_id or job_id}. Run CRAWLER first."
                )
            raise RuntimeError(f"Module C analysis error: {error_msg}")

        logger.info(f"[MODULE_C] {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_C] {job_type} Processing failed: {e}", exc_info=True)
        raise

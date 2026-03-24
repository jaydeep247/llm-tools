"""Brand Intelligence executor (Module E)."""

import asyncio
from utils.logger import configure_logger, logger
from workers.cancellation import is_job_cancelled


def execute_module_e_job(payload: dict) -> bool:
    """Execute Module E (Brand Intelligence) job."""
    from modules.module_E.runner import run_module_e, run_consistency_only
    from modules.quick_start.runner import run_quick_start
    from modules.module_E.sentiment_runner import run_sentiment_only
    from modules.module_E.competitor_runner import run_competitor_analysis
    from modules.module_E.ai_sov_runner import run_ai_sov_analysis
    from modules.module_E.ranking_runner import run_ranking_analysis
    from modules.module_E.brand_runner import run_brand_only

    configure_logger()

    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_E_FULL").upper()
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    main_keyword = payload.get("mainKeyword") or ""
    ga_property_id = payload.get("gaPropertyId") or ""

    target_job_id = source_job_id if source_job_id else job_id

    logger.info(
        f"[MODULE_E] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}..."
    )

    try:
        if is_job_cancelled(job_id):
            logger.info(f"[MODULE_E] 🛑 Job {job_id} cancelled before execution — skipping")
            return True

        if job_type == "MODULE_E_QUICK_START":
            result = asyncio.run(
                run_quick_start(
                    job_id, url,
                    session_id=session_id,
                    project_id=project_id,
                    main_keyword=main_keyword,
                    ga_property_id=ga_property_id,
                )
            )
            if isinstance(result, dict) and result.get("cancelled"):
                logger.info(f"[MODULE_E] 🛑 Quick Start job {job_id} cancelled")
                return True
        elif job_type == "MODULE_E_CONSISTENCY":
            result = asyncio.run(run_consistency_only(target_job_id, url))
        elif job_type == "MODULE_E_SENTIMENT":
            result = asyncio.run(run_sentiment_only(target_job_id, url))
        elif job_type == "MODULE_E_COMPETITORS":
            result = asyncio.run(run_competitor_analysis(target_job_id, url))
        elif job_type == "MODULE_E_AI_SOV":
            result = asyncio.run(run_ai_sov_analysis(target_job_id, url))
        elif job_type == "MODULE_E_RANKING":
            result = asyncio.run(run_ranking_analysis(target_job_id, url))
        elif job_type == "MODULE_E_BRAND":
            result = asyncio.run(run_brand_only(target_job_id, url))
        else:
            result = asyncio.run(run_module_e(target_job_id, url))

        if isinstance(result, dict) and "error" in result:
            logger.error(f"[MODULE_E] ⚠️  Module returned error: {result.get('error')}")

        logger.info(f"[MODULE_E] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_E] ❌ {job_type} Processing failed: {e}", exc_info=True)
        raise

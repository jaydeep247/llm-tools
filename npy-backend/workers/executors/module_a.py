"""Module A (SERP Analyzer) executor."""

import asyncio
import os

from utils.logger import configure_logger, logger


def execute_module_a_job(payload: dict) -> bool:
    """Execute a SERP Analyzer job for Module A."""
    from modules.module_A.serp_analyzer.runner import run_serp_analyzer

    configure_logger()

    job_id = payload.get("jobId") or f"job_{payload.get('sessionId')}"
    session_id = payload.get("sessionId", "")
    url = payload.get("url", "")

    # Keywords and options are published at the top level of the RabbitMQ payload
    # (alongside jobId/sessionId/url), not nested inside a "config" key.
    keywords: list[str] = payload.get("keywords") or []
    competitors: list[str] = payload.get("competitors") or []
    location_code: int = int(payload.get("locationCode") or 2840)
    language_code: str = payload.get("languageCode") or "en"
    device: str = payload.get("device") or "desktop"

    dataforseo_login = os.getenv("DATAFORSEO_LOGIN", "")
    dataforseo_password = os.getenv("DATAFORSEO_PASSWORD", "")

    if not dataforseo_login or not dataforseo_password:
        logger.error("[MODULE_A] DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD env vars not set")
        raise RuntimeError("DataForSEO credentials missing")

    if not keywords:
        logger.error(f"[MODULE_A] No keywords provided for job={job_id}")
        raise ValueError("keywords list is empty")

    logger.info(
        f"[MODULE_A] ▶️  SERP analysis | job={job_id} "
        f"keywords={len(keywords)} url={url[:50]}..."
    )

    try:
        asyncio.run(
            run_serp_analyzer(
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
        )
        logger.info(f"[MODULE_A] ✅ SERP analysis completed | job={job_id}")
        return True
    except Exception as exc:
        logger.error(f"[MODULE_A] ❌ SERP analysis failed: {exc}", exc_info=True)
        raise

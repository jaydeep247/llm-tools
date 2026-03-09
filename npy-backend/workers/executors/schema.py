"""Schema generation executor (Module B)."""

from datetime import datetime
from utils.config import config
from utils.logger import configure_logger, logger
from utils.mongo import mongo_manager
from utils.storage import load_raw_html_sync


def execute_schema_job(payload: dict) -> bool:
    """Execute schema generation job."""
    from modules.module_B.schema_generator import SchemaGenerator

    configure_logger()
    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    schema_type = payload.get("schemaType")
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")

    target_job_id = source_job_id if source_job_id else job_id

    logger.info(
        f"[MODULE_B] ▶️  SCHEMA Processing started | Job: {job_id}"
    )

    html_content = load_raw_html_sync(target_job_id)
    if not html_content:
        logger.warning(f"[SCHEMA] No HTML for job {target_job_id}")
        result = {"success": False, "error": "RAW_HTML_NOT_FOUND"}
    else:
        generator = SchemaGenerator()
        result = generator.generate_schema(html_content, url, schema_type or "auto")

    mongo_manager.connect()
    mongo_manager.schemas.update_one(
        {"jobId": job_id, "url": url},
        {"$set": {
            "jobId": job_id,
            "sessionId": session_id,
            "projectId": project_id,
            "url": url,
            "createdAt": datetime.utcnow(),
            **result,
        }},
        upsert=True,
    )

    logger.info(f"[MODULE_B] ✅ SCHEMA Processing completed | Job: {job_id}")
    return True

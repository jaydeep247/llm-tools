"""Schema generation executor (Module B)."""

from datetime import datetime
import hashlib
import ssl
import urllib.error
import urllib.request
from utils.config import config
from utils.logger import configure_logger, logger
from utils.mongo import mongo_manager
from utils.storage import load_raw_html_sync


def _normalize_url(raw: str) -> str:
    raw = (raw or "").strip()
    if not raw:
        return raw
    if raw.startswith("http://") or raw.startswith("https://"):
        return raw
    return f"https://{raw}"


def _fetch_html(raw_url: str) -> str:
    url = _normalize_url(raw_url)
    if not url:
        return ""

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(
            req,
            timeout=15,
            context=ssl.create_default_context(),
        ) as resp:
            body = resp.read()
            return body.decode("utf-8", errors="ignore")
    except (urllib.error.URLError, ValueError) as e:
        logger.warning(f"[SCHEMA] Failed to fetch HTML for url={url}: {str(e)}")
        return ""


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

    schema_type_norm = schema_type or "auto"
    html_content = load_raw_html_sync(target_job_id)
    if not html_content:
        logger.warning(f"[SCHEMA] No HTML for job {target_job_id}. Fetching URL instead: {url}")
        html_content = _fetch_html(url)

    if not html_content:
        result = {"success": False, "error": "RAW_HTML_NOT_FOUND"}
    else:
        content_hash = hashlib.md5(html_content.encode("utf-8", errors="ignore")).hexdigest()
        mongo_manager.connect()
        existing = mongo_manager.schemas.find_one({"jobId": job_id, "url": url})
        if (
            existing
            and existing.get("success") is True
            and existing.get("schema") is not None
            and existing.get("schemaType") == schema_type_norm
            and existing.get("contentHash") == content_hash
        ):
            result = {
                "success": True,
                "schema": existing.get("schema"),
                "type": existing.get("type"),
                "schema_text": existing.get("schema_text"),
                "rdfa_markup": existing.get("rdfa_markup", ""),
                "cached": True,
            }
        else:
            generator = SchemaGenerator()
            result = generator.generate_schema(html_content, url, schema_type_norm)
            result["cached"] = False
            result["contentHash"] = content_hash
            result["schemaType"] = schema_type_norm

    mongo_manager.schemas.update_one(
        {"jobId": job_id, "url": url},
        {"$set": {
            "jobId": job_id,
            "sessionId": session_id,
            "projectId": project_id,
            "url": url,
            "createdAt": datetime.utcnow(),
            "schemaType": schema_type_norm,
            **result,
        }},
        upsert=True,
    )

    logger.info(f"[MODULE_B] ✅ SCHEMA Processing completed | Job: {job_id}")
    return True

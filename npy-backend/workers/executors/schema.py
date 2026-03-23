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
    """Fetch HTML from a URL. Used for custom URLs and fallback."""
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
    """
    Execute schema generation job.

    URL resolution priority:
    1. If payload contains a custom `url` (user entered a specific page URL)
       → Always fetch that URL's HTML directly — this is page-specific generation
    2. If no custom URL → load cached HTML from S3 (the crawled homepage HTML)
    3. If S3 HTML is missing → fetch the session start URL as fallback
    """
    from modules.module_B.schema_generator import SchemaGenerator

    configure_logger()
    session_id  = payload["sessionId"]
    project_id  = payload["projectId"]
    schema_type = payload.get("schemaType")
    job_id      = payload.get("jobId") or f"job_{session_id}"
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")

    # ── Determine target URL ───────────────────────────────────────────
    # custom_url is set when the user typed a specific page URL in the UI
    custom_url  = (payload.get("url") or "").strip()
    session_url = (payload.get("sessionUrl") or "").strip()

    # The URL we will generate schema FOR
    target_url  = custom_url if custom_url else session_url

    # The job whose S3-cached HTML we can reuse (only valid for homepage)
    target_job_id = source_job_id if source_job_id else job_id

    logger.info(
        f"[MODULE_B] ▶️  SCHEMA Processing started | Job: {job_id} | "
        f"custom_url={custom_url!r} | schema_type={schema_type}"
    )

    schema_type_norm = schema_type or "auto"

    # ── HTML resolution ────────────────────────────────────────────────
    # KEY FIX: If a custom URL is provided, ALWAYS fetch that page fresh.
    # Never use the S3 cached HTML for custom URLs — it belongs to the
    # homepage crawl, not the specific page the user selected.
    if custom_url:
        logger.info(
            f"[SCHEMA] Custom URL provided — fetching page directly: {custom_url}"
        )
        html_content = _fetch_html(custom_url)
        if not html_content:
            logger.error(
                f"[SCHEMA] Failed to fetch custom URL: {custom_url}"
            )
            result = {
                "success": False,
                "error":   "CUSTOM_URL_FETCH_FAILED",
                "message": f"Could not fetch HTML from {custom_url}. "
                           f"The page may be inaccessible or blocked.",
            }
            _save_result(job_id, session_id, project_id, target_url,
                         schema_type_norm, result)
            return False
    else:
        # No custom URL → use S3 cached crawl HTML (homepage)
        html_content = load_raw_html_sync(target_job_id)
        if not html_content:
            logger.warning(
                f"[SCHEMA] No S3 HTML for job {target_job_id}. "
                f"Fetching session URL: {session_url}"
            )
            html_content = _fetch_html(session_url)

    if not html_content:
        result = {
            "success": False,
            "error":   "RAW_HTML_NOT_FOUND",
            "message": "No HTML content available. Run a crawl first.",
        }
        _save_result(job_id, session_id, project_id, target_url,
                     schema_type_norm, result)
        return False

    # ── Cache check ────────────────────────────────────────────────────
    # Only use cached schema when: same URL + same schema type +
    # same generator version + same HTML content hash
    content_hash      = hashlib.md5(
        html_content.encode("utf-8", errors="ignore")
    ).hexdigest()
    generator_version = getattr(SchemaGenerator, "GENERATOR_VERSION", "unknown")

    mongo_manager.connect()
    existing = mongo_manager.schemas.find_one({
        "jobId": job_id,
        "url":   target_url,
    })

    if (
        existing
        and existing.get("success") is True
        and existing.get("schema") is not None
        and existing.get("schemaType")        == schema_type_norm
        and existing.get("generatorVersion")  == generator_version
        and existing.get("contentHash")       == content_hash
    ):
        logger.info(
            f"[SCHEMA] Cache hit for job={job_id} url={target_url} "
            f"type={schema_type_norm}"
        )
        result = {
            "success":          True,
            "schema":           existing.get("schema"),
            "type":             existing.get("type"),
            "schema_text":      existing.get("schema_text"),
            "rdfa_markup":      existing.get("rdfa_markup", ""),
            # Intelligence fields (MOAT 6)
            "summary":          existing.get("summary"),
            "gap_report":       existing.get("gap_report"),
            "fix_patches":      existing.get("fix_patches"),
            "lcs_score_report": existing.get("lcs_score_report"),
            "schema_inventory": existing.get("schema_inventory"),
            "aivs_feed":        existing.get("aivs_feed"),
            "cached":           True,
            "generatorVersion": generator_version,
        }
    else:
        # ── Generate fresh schema ──────────────────────────────────────
        from modules.module_B.schema_orchestrator import SchemaOrchestrator

        orchestrator = SchemaOrchestrator()
        result = orchestrator.run(html_content, target_url, schema_type_norm)

        result["cached"]           = False
        result["contentHash"]      = content_hash
        result["schemaType"]       = schema_type_norm
        result["generatorVersion"] = generator_version

        logger.info(
            f"[SCHEMA] Generated | url={target_url} | "
            f"type={result.get('type')} | "
            f"lcs={result.get('summary', {}).get('lcs_score', 'N/A')}"
        )

    # ── Save to MongoDB ────────────────────────────────────────────────
    _save_result(job_id, session_id, project_id, target_url,
                 schema_type_norm, result)

    logger.info(f"[MODULE_B] ✅ SCHEMA Processing completed | Job: {job_id}")
    return True


def _save_result(
    job_id:      str,
    session_id:  str,
    project_id:  str,
    url:         str,
    schema_type: str,
    result:      dict,
) -> None:
    """Persist schema result to MongoDB (upsert by jobId + url)."""
    mongo_manager.schemas.update_one(
        {"jobId": job_id, "url": url},
        {"$set": {
            "jobId":      job_id,
            "sessionId":  session_id,
            "projectId":  project_id,
            "url":        url,
            "createdAt":  datetime.utcnow(),
            "schemaType": schema_type,
            **result,
        }},
        upsert=True,
    )
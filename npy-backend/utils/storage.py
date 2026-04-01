"""
Storage utilities for raw HTML and analysis results.
Uses S3 (DigitalOcean Spaces) exclusively - NO local filesystem storage.
"""

import hashlib
import json
from datetime import datetime, timezone

from utils.config import config
from utils.logger import logger

_s3_warned = False  # Log the "S3 disabled" warning only once


def _get_s3_client():
    """Lazy import to avoid circular dependencies"""
    from storage.s3_client import s3_storage
    return s3_storage


def _ensure_s3_enabled() -> bool:
    """Check if S3 storage is enabled and ready.
    Returns True if S3 is available, False otherwise (no exception).
    Logs a warning only on the first call to avoid log spam.
    """
    global _s3_warned
    if not config.S3_ENABLED:
        if not _s3_warned:
            logger.warning("[S3] S3_ENABLED is False — HTML will not be stored/loaded from S3.")
            _s3_warned = True
        return False
    
    s3 = _get_s3_client()
    if not s3.is_enabled:
        if not _s3_warned:
            logger.warning("[S3] S3 client is not properly configured — check credentials.")
            _s3_warned = True
        return False
    
    return True


# ─── ASYNC FUNCTIONS ─────────────────────────────────────────────────────────

async def save_raw_html(job_id: str, html_content: str, filename: str = "source.html") -> str:
    """
    Saves raw HTML content to S3 bucket ONLY.
    Local filesystem storage is NO LONGER SUPPORTED.
    
    Args:
        job_id: Job identifier
        html_content: HTML content to save
        filename: File name/key within the job folder
        
    Returns:
        S3 URI of the saved file, or empty string if S3 is unavailable
    """
    if not html_content:
        return ""
    
    if not _ensure_s3_enabled():
        return ""
    
    try:
        s3 = _get_s3_client()
        uri = await s3.save(job_id, html_content, filename)
        logger.info(f"[S3] ✅ HTML saved for job {job_id}/{filename} ({len(html_content)} bytes)")
        return uri
    except Exception as e:
        logger.error(f"[S3] ❌ Failed to save HTML to S3: {e}")
        return ""


async def load_raw_html(job_id: str, filename: str = "source.html") -> str:
    """
    Loads raw HTML content from S3 bucket ONLY.
    Supports both legacy keys (raw_html/{job_id}/...) and dedup keys (html_dedup/...).
    
    Args:
        job_id: Job identifier
        filename: File name/key within the job folder, OR a full dedup S3 key
        
    Returns:
        HTML content as string, or empty string if not found / S3 unavailable
    """
    if not _ensure_s3_enabled():
        return ""
    
    try:
        s3 = _get_s3_client()
        # Handle dedup keys: filename IS the full S3 key already
        if _is_dedup_key(filename):
            content = await s3.load_by_key(filename)
        else:
            content = await s3.load(job_id, filename)
        if content:
            logger.info(f"[S3] ✅ HTML loaded from S3 for job {job_id}/{filename} ({len(content)} bytes)")
            return content
        else:
            logger.warning(f"[S3] ⚠️  HTML not found in S3 for job {job_id}/{filename}")
            return ""
    except Exception as e:
        logger.error(f"[S3] ❌ Failed to load HTML from S3: {e}")
        return ""


# ─── SYNC FUNCTIONS ──────────────────────────────────────────────────────────

def save_raw_html_sync(job_id: str, html_content: str, filename: str = "source.html") -> str:
    """
    Synchronous version of save_raw_html for use in non-async contexts (e.g. Scrapy).
    Uses S3 bucket ONLY - NO local filesystem fallback.
    
    Args:
        job_id: Job identifier
        html_content: HTML content to save
        filename: File name/key within the job folder
        
    Returns:
        S3 URI of the saved file, or empty string if S3 is unavailable
    """
    if not html_content:
        return ""
    
    if not _ensure_s3_enabled():
        return ""
    
    try:
        s3 = _get_s3_client()
        uri = s3.save_sync(job_id, html_content, filename)
        logger.info(f"[S3] ✅ HTML saved (sync) for job {job_id}/{filename} ({len(html_content)} bytes)")
        return uri
    except Exception as e:
        logger.error(f"[S3] ❌ Failed to save HTML to S3 (sync): {e}")
        return ""


def load_raw_html_sync(job_id: str, filename: str = "source.html") -> str:
    """
    Synchronous version of load_raw_html.
    Supports both legacy keys (raw_html/{job_id}/...) and dedup keys (html_dedup/...).
    
    Args:
        job_id: Job identifier
        filename: File name/key within the job folder, OR a full dedup S3 key
        
    Returns:
        HTML content as string, or empty string if not found / S3 unavailable
    """
    if not _ensure_s3_enabled():
        return ""
    
    try:
        s3 = _get_s3_client()
        # Handle dedup keys: filename IS the full S3 key already
        if _is_dedup_key(filename):
            content = s3.load_by_key_sync(filename)
        else:
            content = s3.load_sync(job_id, filename)
        if content:
            logger.info(f"[S3] ✅ HTML loaded (sync) from S3 for job {job_id}/{filename} ({len(content)} bytes)")
            return content
        else:
            logger.warning(f"[S3] ⚠️  HTML not found in S3 for job {job_id}/{filename}")
            return ""
    except Exception as e:
        logger.error(f"[S3] ❌ Failed to load HTML from S3 (sync): {e}")
        return ""


# ─── HTML CONTENT DEDUP ──────────────────────────────────────────────────────

DEDUP_KEY_PREFIX = "html_dedup/"


def _compute_content_hash(html_content: str) -> str:
    """SHA-256 hash of HTML content for dedup comparison."""
    return hashlib.sha256(html_content.encode("utf-8")).hexdigest()


def _compute_url_hash(url: str) -> str:
    """SHA-256 hash of URL (first 24 chars), same scheme used by the crawler."""
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]


def _dedup_s3_key(project_id: str, url_hash: str) -> str:
    """Build the content-addressable S3 key for dedup."""
    return f"{DEDUP_KEY_PREFIX}{project_id}/pages/{url_hash}.html"


def _is_dedup_key(filename: str) -> bool:
    """Check whether a raw_html_filename is a dedup key (full S3 key)."""
    return filename.startswith(DEDUP_KEY_PREFIX)


def _get_dedup_collection():
    from utils.mongo import mongo_manager
    mongo_manager.connect()
    return mongo_manager.html_dedup


def save_html_dedup_sync(
    project_id: str,
    url: str,
    html_content: str,
) -> str:
    """
    Deduplicated HTML save (sync).

    1. Compute SHA-256 of the HTML content.
    2. Look up the MongoDB html_dedup index for this (project, url).
    3. If content_hash matches → skip S3 upload, return existing key (dedup hit).
    4. If content_hash differs → overwrite the S3 object, update MongoDB.
    5. If new URL → upload to S3, insert MongoDB record.

    Returns the dedup S3 key (to be stored as raw_html_filename in the page doc).
    """
    if not html_content:
        return ""
    if not _ensure_s3_enabled():
        return ""

    url_hash = _compute_url_hash(url)
    content_hash = _compute_content_hash(html_content)
    s3_key = _dedup_s3_key(project_id, url_hash)

    try:
        col = _get_dedup_collection()
        existing = col.find_one(
            {"project_id": project_id, "url_hash": url_hash},
            {"content_hash": 1, "s3_key": 1},
        )

        if existing and existing.get("content_hash") == content_hash:
            # ── DEDUP HIT: same content already stored ──
            logger.info(
                f"[DEDUP] ♻️  Hash match for {url} (project {project_id}) — skipping S3 upload"
            )
            return existing.get("s3_key", s3_key)

        # ── Upload to S3 (new or changed content) ──
        s3 = _get_s3_client()
        s3.save_by_key_sync(s3_key, html_content)

        now = datetime.now(timezone.utc)
        col.update_one(
            {"project_id": project_id, "url_hash": url_hash},
            {
                "$set": {
                    "url": url,
                    "content_hash": content_hash,
                    "s3_key": s3_key,
                    "size_bytes": len(html_content),
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )

        action = "replaced" if existing else "stored"
        logger.info(
            f"[DEDUP] ✅ HTML {action} for {url} (project {project_id}, "
            f"{len(html_content)} bytes, hash {content_hash[:12]}…)"
        )
        return s3_key

    except Exception as e:
        logger.error(f"[DEDUP] ❌ Dedup save failed for {url}: {e}")
        return ""


async def save_html_dedup(
    project_id: str,
    url: str,
    html_content: str,
) -> str:
    """
    Async version of save_html_dedup_sync.
    Runs the sync implementation in the S3 thread-pool executor.
    """
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, save_html_dedup_sync, project_id, url, html_content
    )


def load_html_dedup_sync(s3_key: str) -> str:
    """Load HTML from a dedup S3 key directly."""
    if not s3_key or not _ensure_s3_enabled():
        return ""
    try:
        s3 = _get_s3_client()
        content = s3.load_by_key_sync(s3_key)
        if content:
            logger.info(f"[DEDUP] ✅ HTML loaded from dedup key {s3_key} ({len(content)} bytes)")
        return content
    except Exception as e:
        logger.error(f"[DEDUP] ❌ Failed to load from dedup key {s3_key}: {e}")
        return ""


async def load_html_dedup(s3_key: str) -> str:
    """Async version of load_html_dedup_sync."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, load_html_dedup_sync, s3_key)


# ─── MONGODB STORAGE FUNCTIONS ───────────────────────────────────────────────
async def save_job_response(job_id: str, data: dict) -> str:
    """
    Saves job results to MongoDB fields collection.
    Stores analysis results directly into the fields collection.
    
    Args:
        job_id: Job ID
        data: Job results dictionary with structure:
              { job_id, url, success, modules: { module_c: {...}, ... } }
    
    Returns:
        MongoDB document URI
    """
    from utils.mongo import mongo_manager
    from datetime import datetime
    
    try:
        # Extract URL from data
        url = data.get("url", "")
        
        # Prepare base document
        document = {
            "jobId": job_id,
            "url": url,
            "timestamp": datetime.utcnow()
        }
        
        # Merge all modules into the document at the top level
        # e.g., 'modules': {'module_c': {...}} -> 'module_c': {...}
        modules = data.get("modules", {})
        if modules:
            document.update(modules)
            
        # Connect to MongoDB
        mongo_manager.connect()
        
        # Use upsert to handle updates for the same job_id + url
        result = mongo_manager.fields.update_one(
            {"jobId": job_id, "url": url},
            {"$set": document},
            upsert=True
        )
        
        doc_id = result.upserted_id or "updated"
        from utils.logger import logger
        
        return f"mongodb://fields/{doc_id}"
        
    except Exception as e:
        from utils.logger import logger
        error_type = type(e).__name__
        logger.error(f"Failed to save to MongoDB ({error_type})")
        raise e


async def save_aeo_analysis(job_id: str, url: str, data: dict) -> str:
    """
    Saves Module C analysis results to MongoDB module_c collection.
    
    Args:
        job_id: Job ID
        url: URL being analyzed
        data: Module C analysis results dictionary
    
    Returns:
        MongoDB document URI
    """
    from utils.mongo import mongo_manager
    from datetime import datetime
    
    try:
        # Prepare document
        document = {
            "jobId": job_id,
            "url": url,
            "domain": data.get("domain", ""),
            "industry": data.get("industry", ""),
            "timestamp": datetime.utcnow(),
            "overall_score": data.get("overall_score", 0),
            "modules": data.get("modules", {})
        }
        
        # Connect to MongoDB
        mongo_manager.connect()
        
        # Use upsert to handle updates for the same job_id + url
        result = mongo_manager.module_c.update_one(
            {"jobId": job_id, "url": url},
            {"$set": document},
            upsert=True
        )
        
        doc_id = result.upserted_id or "updated"
        from utils.logger import logger
        
        return f"mongodb://module_c/{doc_id}"
        
    except Exception as e:
        from utils.logger import logger
        error_type = type(e).__name__
        logger.error(f"Failed to save AEO analysis to MongoDB ({error_type})")
        raise e


async def load_aeo_analysis(job_id: str) -> dict:
    """
    Loads the most recent AEO analysis result from MongoDB for a given job.

    Args:
        job_id: Job ID to look up

    Returns:
        AEO analysis dict or None if not found
    """
    from utils.mongo import mongo_manager
    from utils.logger import logger

    try:
        mongo_manager.connect()
        doc = mongo_manager.module_c.find_one(
            {"jobId": job_id},
            sort=[("timestamp", -1)],
        )
        if doc:
            doc.pop("_id", None)
            return doc
        return None
    except Exception as e:
        logger.error(f"[STORAGE] Failed to load AEO analysis from MongoDB: {e}")
        return None

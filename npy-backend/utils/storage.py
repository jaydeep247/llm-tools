"""
Storage utilities for raw HTML and analysis results.
Uses S3 (DigitalOcean Spaces) exclusively - NO local filesystem storage.
"""

import json

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

async def save_raw_html(job_id: str, html_content: str) -> str:
    """
    Saves raw HTML content to S3 bucket ONLY.
    Local filesystem storage is NO LONGER SUPPORTED.
    
    Args:
        job_id: Job identifier
        html_content: HTML content to save
        
    Returns:
        S3 URI of the saved file, or empty string if S3 is unavailable
    """
    if not html_content:
        return ""
    
    if not _ensure_s3_enabled():
        return ""
    
    try:
        s3 = _get_s3_client()
        uri = await s3.save(job_id, html_content)
        logger.info(f"[S3] ✅ HTML saved for job {job_id} ({len(html_content)} bytes)")
        return uri
    except Exception as e:
        logger.error(f"[S3] ❌ Failed to save HTML to S3: {e}")
        return ""


async def load_raw_html(job_id: str) -> str:
    """
    Loads raw HTML content from S3 bucket ONLY.
    Local filesystem storage is NO LONGER SUPPORTED.
    
    Args:
        job_id: Job identifier
        
    Returns:
        HTML content as string, or empty string if not found / S3 unavailable
    """
    if not _ensure_s3_enabled():
        return ""
    
    try:
        s3 = _get_s3_client()
        content = await s3.load(job_id)
        if content:
            logger.info(f"[S3] ✅ HTML loaded from S3 for job {job_id} ({len(content)} bytes)")
            return content
        else:
            logger.warning(f"[S3] ⚠️  HTML not found in S3 for job {job_id}")
            return ""
    except Exception as e:
        logger.error(f"[S3] ❌ Failed to load HTML from S3: {e}")
        return ""


# ─── SYNC FUNCTIONS ──────────────────────────────────────────────────────────

def save_raw_html_sync(job_id: str, html_content: str) -> str:
    """
    Synchronous version of save_raw_html for use in non-async contexts (e.g. Scrapy).
    Uses S3 bucket ONLY - NO local filesystem fallback.
    
    Args:
        job_id: Job identifier
        html_content: HTML content to save
        
    Returns:
        S3 URI of the saved file, or empty string if S3 is unavailable
    """
    if not html_content:
        return ""
    
    if not _ensure_s3_enabled():
        return ""
    
    try:
        s3 = _get_s3_client()
        uri = s3.save_sync(job_id, html_content)
        logger.info(f"[S3] ✅ HTML saved (sync) for job {job_id} ({len(html_content)} bytes)")
        return uri
    except Exception as e:
        logger.error(f"[S3] ❌ Failed to save HTML to S3 (sync): {e}")
        return ""


def load_raw_html_sync(job_id: str) -> str:
    """
    Synchronous version of load_raw_html.
    Uses S3 bucket ONLY - NO local filesystem fallback.
    
    Args:
        job_id: Job identifier
        
    Returns:
        HTML content as string, or empty string if not found / S3 unavailable
    """
    if not _ensure_s3_enabled():
        return ""
    
    try:
        s3 = _get_s3_client()
        content = s3.load_sync(job_id)
        if content:
            logger.info(f"[S3] ✅ HTML loaded (sync) from S3 for job {job_id} ({len(content)} bytes)")
            return content
        else:
            logger.warning(f"[S3] ⚠️  HTML not found in S3 for job {job_id}")
            return ""
    except Exception as e:
        logger.error(f"[S3] ❌ Failed to load HTML from S3 (sync): {e}")
        return ""


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
    Saves Module C (AEO) analysis results to MongoDB aeo_analysis collection.
    
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
            "timestamp": datetime.utcnow(),
            "overall_score": data.get("overall_score", 0),
            "modules": data.get("modules", {})
        }
        
        # Connect to MongoDB
        mongo_manager.connect()
        
        # Use upsert to handle updates for the same job_id + url
        result = mongo_manager.aeo_analysis.update_one(
            {"jobId": job_id, "url": url},
            {"$set": document},
            upsert=True
        )
        
        doc_id = result.upserted_id or "updated"
        from utils.logger import logger
        
        return f"mongodb://aeo_analysis/{doc_id}"
        
    except Exception as e:
        from utils.logger import logger
        error_type = type(e).__name__
        logger.error(f"Failed to save AEO analysis to MongoDB ({error_type})")
        raise e

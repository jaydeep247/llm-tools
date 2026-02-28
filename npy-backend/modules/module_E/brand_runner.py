import logging
from datetime import datetime
from typing import Dict, Any

from utils.mongo import mongo_manager
from .brand_analyzer import BrandAnalyzer

logger = logging.getLogger("module_e_brand_runner")

async def run_brand_only(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """
    Run Brand Analysis only (no crawl, no other analysis).
    Upserts only the `brand_analysis` field in MongoDB.
    """
    mongo_manager.connect()

    # 1. Try to get brand_name from existing module_e document
    brand_name = None
    try:
        existing = mongo_manager.module_e.find_one({"jobId": job_id})
        if existing:
            # Try content_consistency mandate first
            brand_name = (
                existing.get("content_consistency", {})
                .get("mandate", {})
                .get("brand_name")
            )
            if not brand_name:
                brand_name = existing.get("brand_analysis", {}).get("brand_name")
            
            # If still no brand name, try sentiment tracking
            if not brand_name:
                brand_name = existing.get("sentiment_tracking", {}).get("brand_name")

    except Exception as e:
        logger.warning(f"Could not read existing module_e doc: {e}")

    # 2. If still no brand_name, infer from URL domain
    if not brand_name:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url if url.startswith("http") else f"https://{url}")
            domain = parsed.netloc or parsed.path
            parts = domain.replace("www.", "").split(".")
            brand_name = parts[0].capitalize() if parts else "Unknown"
        except Exception:
            brand_name = "Unknown"

    # 3. Run Brand Analysis
    try:
        brand_analysis = await BrandAnalyzer.analyze_brand(brand_name)
    except Exception as e:
        logger.error(f"Brand analysis failed: {e}", exc_info=True)
        return {
            "job_id": job_id,
            "success": False,
            "error": str(e),
        }

    # 4. Upsert brand_analysis
    try:
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    "brand_analysis": brand_analysis,
                    "updatedAt": datetime.utcnow(),
                },
                "$setOnInsert": {
                    "createdAt": datetime.utcnow(),
                },
            },
            upsert=True,
        )
    except Exception as exc:
        logger.warning(f"Failed to persist brand analysis result: {exc}")

    return {
        "job_id": job_id,
        "success": True,
        "brand_analysis": brand_analysis
    }

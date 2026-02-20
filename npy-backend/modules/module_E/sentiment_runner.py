"""
Sentiment-only runner for Module E.
Runs AI Sentiment & Visibility analysis for a brand and upserts
only the `sentiment_tracking` field in the MongoDB module_e collection.
"""
import logging
from datetime import datetime
from typing import Dict, Any

from utils.mongo import mongo_manager
from .sentiment_tracker import SentimentVisibilityTracker

logger = logging.getLogger("module_e_sentiment_runner")


async def run_sentiment_only(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """
    Run sentiment & visibility analysis only (no crawl, no content analysis).

    The brand_name is inferred from the job config passed via the orchestrator.
    Falls back to extracting from the existing module_e document in MongoDB.

    Args:
        job_id: The source crawl job ID (used to look up/store in module_e collection)
        url: Target URL (used for brand inference fallback)
        html_content: Not used — kept for compatibility with orchestrator signature

    Returns:
        Dict with sentiment_tracking result and success flag
    """
    logger.info("Sentiment-only runner started", extra={"job_id": job_id, "url": url})

    mongo_manager.connect()

    # 1. Try to get brand_name from existing module_e document
    brand_name = None
    try:
        existing = mongo_manager.module_e.find_one({"jobId": job_id})
        if existing:
            # Try content_consistency mandate first (most reliable)
            brand_name = (
                existing.get("content_consistency", {})
                .get("mandate", {})
                .get("brand_name")
            )
            # Fallback: brand_analysis
            if not brand_name:
                brand_name = existing.get("brand_analysis", {}).get("brand_name")
    except Exception as e:
        logger.warning(f"Could not read existing module_e doc: {e}")

    # 2. If still no brand_name, infer from URL domain
    if not brand_name:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url if url.startswith("http") else f"https://{url}")
            domain = parsed.netloc or parsed.path
            # Strip www. and TLD for a rough brand name
            parts = domain.replace("www.", "").split(".")
            brand_name = parts[0].capitalize() if parts else "Unknown"
            logger.info(f"Inferred brand_name from URL: {brand_name}")
        except Exception:
            brand_name = "Unknown"

    logger.info(f"Running sentiment analysis for brand: {brand_name}", extra={"job_id": job_id})

    # 3. Run sentiment & visibility analysis
    try:
        sentiment_tracking = await SentimentVisibilityTracker.analyze_sentiment_and_visibility(
            brand_name=brand_name
        )
    except Exception as e:
        logger.error(f"Sentiment analysis failed: {e}", exc_info=True)
        return {
            "job_id": job_id,
            "success": False,
            "error": str(e),
        }

    # 4. Upsert sentiment_tracking + append to score_history (keep last 50)
    history_entry = {
        "date": sentiment_tracking.get("timestamp", datetime.utcnow().isoformat()),
        "sentimentScore": sentiment_tracking.get("sentiment", {}).get("overall_score", 0),
        "visibilityScore": sentiment_tracking.get("visibility", {}).get("overall_visibility_score", 0),
    }
    try:
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    "sentiment_tracking": sentiment_tracking,
                    "updatedAt": datetime.utcnow(),
                },
                "$setOnInsert": {
                    "createdAt": datetime.utcnow(),
                },
                "$push": {
                    "score_history": {
                        "$each": [history_entry],
                        "$slice": -50,  # Keep only the last 50 entries
                    }
                },
            },
            upsert=True,
        )
        logger.info(
            "Sentiment tracking persisted to module_e collection",
            extra={"job_id": job_id, "brand_name": brand_name}
        )
    except Exception as exc:
        logger.warning(f"Failed to persist sentiment result: {exc}")

    return {
        "job_id": job_id,
        "success": True,
        "sentiment_tracking": sentiment_tracking,
    }

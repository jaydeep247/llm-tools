import logging
from datetime import datetime
from typing import Dict, Any, List
from utils.mongo import mongo_manager
from utils.storage import load_raw_html
from .competitor_analyzer import CompetitorAnalyzer
from .recommendations import generate_sov_recommendations

logger = logging.getLogger("module_e_competitors")

async def run_competitor_analysis(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """
    Runner for competitor analysis.
    Called by job_runner.py for 'module_e_competitors' jobs.
    """
    mongo_manager.connect()
    analyzer = CompetitorAnalyzer()

    # 1. Check if we have existing competitors in MongoDB or infer from brand analysis
    # For now, we'll let the analyzer auto-discover via DataForSEO if not provided
    
    brand_name = None
    keywords = None
    try:
        existing = mongo_manager.module_e.find_one({"jobId": job_id})
        if existing:
            # Try content_consistency mandate first (most reliable)
            mandate = existing.get("content_consistency", {}).get("mandate", {})
            brand_name = mandate.get("brand_name")
            
            # Extract keywords from mandate or entity_coverage if available
            if not keywords:
                keywords = existing.get("entity_coverage", {}).get("expected", [])
            
            # Fallback: brand_analysis
            if not brand_name:
                brand_name = existing.get("brand_analysis", {}).get("brand_name")
    except Exception as e:
        logger.warning(f"Could not read existing module_e doc: {e}")

    try:
        results = await analyzer.analyze(url, brand_name=brand_name, keywords=keywords)

        ai_sov = results.get("ai_sov") or {}
        competitor_mentions_data = results.get("mentions") or {}

        # Generate SOV recommendations
        existing_history = []
        try:
            existing_doc = mongo_manager.module_e.find_one({"jobId": job_id}, {"ai_sov_history": 1})
            if existing_doc:
                existing_history = existing_doc.get("ai_sov_history", [])
        except Exception:
            pass
        sov_recommendations = generate_sov_recommendations(
            ai_sov=ai_sov,
            competitor_mentions=competitor_mentions_data,
            sov_history=existing_history,
        )

        # Build a timestamped snapshot for the history array
        sov_snapshot = {
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "overall_sov": ai_sov.get("overall_sov", 0),
            "by_model": ai_sov.get("by_model", {}),
        }

        # 2. Persist result to MongoDB in the module_e collection.
        # $set updates the latest snapshot fields.
        # $push appends to ai_sov_history (capped at last 12 runs via $slice).
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    "competitor_mentions": results.get("mentions"),
                    "ai_share_of_voice": ai_sov,
                    "competitive_leaderboard": results.get("competitive_leaderboard"),
                    "sov_recommendations": sov_recommendations,
                    "updatedAt": datetime.utcnow(),
                    "createdAt": datetime.utcnow(),
                },
                "$push": {
                    "ai_sov_history": {
                        "$each": [sov_snapshot],
                        "$slice": -12,   # keep last 12 runs
                    }
                },
            },
            upsert=True,
        )
        
        return results

    except Exception as e:
        logger.error(f"Competitor analysis failed for job {job_id}: {e}", exc_info=True)
        return {"error": str(e)}

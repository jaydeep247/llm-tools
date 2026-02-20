import logging
from datetime import datetime
from typing import Dict, Any, List
from utils.mongo import mongo_manager
from utils.storage import load_raw_html
from .competitor_analyzer import CompetitorAnalyzer

logger = logging.getLogger("module_e_competitors")

async def run_competitor_analysis(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """
    Runner for competitor analysis.
    Called by job_runner.py for 'module_e_competitors' jobs.
    """
    logger.info(f"Competitor analysis runner started for job {job_id}")

    mongo_manager.connect()
    analyzer = CompetitorAnalyzer()

    # 1. Check if we have existing competitors in MongoDB or infer from brand analysis
    # For now, we'll let the analyzer auto-discover via DataForSEO if not provided
    
    try:
        results = await analyzer.analyze(url)

        ai_sov = results.get("ai_sov") or {}

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
        
        logger.info(f"Competitor analysis results persisted for job {job_id}")
        return results

    except Exception as e:
        logger.error(f"Competitor analysis failed for job {job_id}: {e}", exc_info=True)
        return {"error": str(e)}

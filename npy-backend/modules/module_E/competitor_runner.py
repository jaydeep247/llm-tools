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

    Key fix: we now read the brand_description that was generated during
    onboarding and pass it to CompetitorAnalyzer.analyze().  This allows
    the industry inference and AI competitor discovery to use the ACTUAL
    description of what the company does, instead of guessing from the
    domain name — which was causing wrong competitor results.
    """
    mongo_manager.connect()
    analyzer = CompetitorAnalyzer()

    brand_name = None
    brand_description = None
    keywords = None

    try:
        existing = mongo_manager.module_e.find_one({"jobId": job_id})
        if existing:
            # 1. Brand description from onboarding — PRIMARY signal for competitor discovery
            brand_description = existing.get("brand_description")
            if brand_description:
                logger.info(f"Using onboarding brand_description for job {job_id} ({len(brand_description)} chars)")
            else:
                logger.warning(f"No brand_description found for job {job_id} — will infer from domain only")

            # 2. Brand name
            mandate = existing.get("content_consistency", {}).get("mandate", {})
            brand_name = mandate.get("brand_name")
            if not brand_name:
                brand_name = existing.get("brand_analysis", {}).get("brand_name")

            # 3. Keywords for leaderboard
            if not keywords:
                keywords = existing.get("entity_coverage", {}).get("expected", [])

    except Exception as e:
        logger.warning(f"Could not read existing module_e doc: {e}")

    try:
        results = await analyzer.analyze(
            url,
            brand_name=brand_name,
            keywords=keywords,
            brand_description=brand_description,   # ← passed through to all sub-steps
        )

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

        sov_snapshot = {
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "overall_sov": ai_sov.get("overall_sov", 0),
            "by_model": ai_sov.get("by_model", {}),
        }

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
                        "$slice": -12,
                    }
                },
            },
            upsert=True,
        )

        return results

    except Exception as e:
        logger.error(f"Competitor analysis failed for job {job_id}: {e}", exc_info=True)
        return {"error": str(e)}
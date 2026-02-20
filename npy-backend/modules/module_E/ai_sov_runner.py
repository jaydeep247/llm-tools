import logging
import os
from datetime import datetime
from typing import Dict, Any
from utils.mongo import mongo_manager
from .competitor_analyzer import CompetitorAnalyzer

logger = logging.getLogger("module_e_ai_sov")


def _clear_ai_sov_cache() -> int:
    """
    Surgically removes only AI SOV cache entries (task names starting with
    'module_e_ai_sov_') from the orchestrator cache file.
    Leaves competitor/mentions cache entries intact.
    Returns the number of lines removed.
    """
    cache_file = os.path.join("data", "cache", "orchestrator_cache.jsonl")
    if not os.path.exists(cache_file):
        return 0

    removed = 0
    try:
        with open(cache_file, "r", encoding="utf-8") as f:
            lines = f.readlines()

        kept = []
        for line in lines:
            if '"module_e_ai_sov_' in line:
                removed += 1
            else:
                kept.append(line)

        with open(cache_file, "w", encoding="utf-8") as f:
            f.writelines(kept)

        logger.info(f"AI SOV cache cleared: removed {removed} entries, kept {len(kept)}")
    except Exception as e:
        logger.warning(f"Could not clear AI SOV cache: {e}")

    return removed


async def run_ai_sov_analysis(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """
    Runner for AI SOV-only re-analysis.
    Called by job_runner.py for 'module_e_ai_sov' jobs.

    - Reads existing competitors from MongoDB (no DataForSEO call)
    - Clears only AI SOV cache entries so LLMs are queried fresh
    - Runs _analyze_ai_sov() and pushes a new snapshot to ai_sov_history
    """
    logger.info(f"AI SOV runner started for job {job_id}")

    mongo_manager.connect()
    analyzer = CompetitorAnalyzer()

    try:
        # 1. Load existing competitor data from MongoDB
        existing = mongo_manager.module_e.find_one({"jobId": job_id})
        if not existing:
            logger.warning(f"No existing module_e record for job {job_id}. Run full competitor analysis first.")
            return {"error": "No existing competitor data found. Run full competitor analysis first."}

        mentions_data = existing.get("competitor_mentions") or {}
        data_rows = mentions_data.get("data", [])

        if not data_rows:
            logger.warning(f"No competitor mentions data found for job {job_id}")
            return {"error": "No competitor data found. Run full competitor analysis first."}

        # data[0] is always the brand itself; data[1:] are competitors
        domain = data_rows[0]["name"] if data_rows else analyzer._extract_domain(url)
        competitors = [row["name"] for row in data_rows[1:]]

        logger.info(f"AI SOV re-run for domain={domain}, competitors={competitors}")

        # 2. Clear AI SOV cache entries so we get fresh LLM responses
        _clear_ai_sov_cache()

        # 3. Infer industry (cached — no need to clear this)
        brand_name = analyzer._extract_brand_name(domain)
        industry, service_type = await analyzer._infer_industry(domain, brand_name)
        logger.info(f"Industry: {industry} | Service: {service_type}")

        # 4. Run AI SOV analysis (fresh, cache cleared above)
        ai_sov = await analyzer._analyze_ai_sov(
            domain=domain,
            brand_name=brand_name,
            industry=industry,
            service_type=service_type,
            competitors=competitors,
        )

        # 5. Build snapshot and persist
        sov_snapshot = {
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "overall_sov": ai_sov.get("overall_sov", 0),
            "by_model": ai_sov.get("by_model", {}),
        }

        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "ai_share_of_voice": ai_sov,
                    "updatedAt": datetime.utcnow(),
                },
                "$push": {
                    "ai_sov_history": {
                        "$each": [sov_snapshot],
                        "$slice": -12,  # keep last 12 runs
                    }
                },
            },
        )

        logger.info(f"AI SOV re-run complete for job {job_id}: {ai_sov.get('overall_sov', 0)}%")
        return {"ai_sov": ai_sov, "snapshot": sov_snapshot}

    except Exception as e:
        logger.error(f"AI SOV runner failed for job {job_id}: {e}", exc_info=True)
        return {"error": str(e)}

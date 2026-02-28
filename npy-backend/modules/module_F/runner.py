import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from utils.mongo import mongo_manager

from .competitor_ai_intelligence import CompetitorAIIntelligence

logger = logging.getLogger("module_f_runner")


def _extract_competitors_from_module_e(doc: Dict[str, Any]) -> List[str]:
    mentions = (doc or {}).get("competitor_mentions") or {}
    rows = mentions.get("data") or []
    names = [r.get("name") for r in rows if isinstance(r, dict) and r.get("name")]
    if len(names) <= 1:
        return []
    return names[1:]


def _extract_brand_name_from_module_e(doc: Dict[str, Any]) -> Optional[str]:
    cc = (doc or {}).get("content_consistency") or {}
    mandate = cc.get("mandate") or {}
    brand_name = mandate.get("brand_name")
    return str(brand_name).strip() if brand_name else None


def _extract_topic_from_module_e(doc: Dict[str, Any]) -> Optional[str]:
    cc = (doc or {}).get("content_consistency") or {}
    mandate = cc.get("mandate") or {}
    topic = mandate.get("topic")
    return str(topic).strip() if topic else None


def _extract_prompts_from_module_e(doc: Dict[str, Any], topic: Optional[str] = None) -> List[str]:
    prompts = []
    
    # 1. Ranking prompts
    ranking = doc.get("ranking") or {}
    if ranking.get("generated_prompts"):
        prompts = ranking["generated_prompts"]
        
    # 2. Content Consistency prompts
    if not prompts:
        cc = doc.get("content_consistency") or {}
        prompts = cc.get("generated_prompts") or cc.get("prompts") or []

    # 3. Fallback to topic-based prompts
    if not prompts and topic:
        prompts = [
            f"What are the best {topic} solutions?",
            f"Top {topic} providers",
            f"Who leads the market in {topic}?",
            f"Compare {topic} services",
            f"Reviews for {topic} companies"
        ]
        
    return prompts


async def run_module_f_competitor_ai_intelligence(job_id: str, url: str) -> Dict[str, Any]:
    mongo_manager.connect()

    module_e_doc = mongo_manager.module_e.find_one({"jobId": job_id}) or {}
    competitors = _extract_competitors_from_module_e(module_e_doc)
    brand_name = _extract_brand_name_from_module_e(module_e_doc)
    topic = _extract_topic_from_module_e(module_e_doc)

    if not competitors:
        result = {
            "job_id": job_id,
            "url": url,
            "error": "No competitors found. Run Module E competitor analysis first.",
            "created_at": datetime.utcnow().isoformat(),
        }
        mongo_manager.db.module_f.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    **result,
                    "updatedAt": datetime.utcnow(),
                },
                "$setOnInsert": {"createdAt": datetime.utcnow()},
            },
            upsert=True,
        )
        return result

    analyzer = CompetitorAIIntelligence()
    comparison = await analyzer.compare_visibility_against_competitors(
        url=url,
        competitors=competitors,
        brand_name=brand_name,
        topic=topic,
    )

    prompts = _extract_prompts_from_module_e(module_e_doc, topic)
    competitor_wins = await analyzer.analyze_competitor_prompt_wins(
        prompts=prompts,
        competitors=competitors,
        brand_name=brand_name,
        url=url
    )

    gap_opportunities = analyzer.compute_gap_analysis(
        prompt_results=competitor_wins.get("detailed_results", []),
        competitors=competitors
    )

    source_analysis = await analyzer.analyze_competitor_sources(
        competitors=competitors,
        topic=topic
    )

    result = {
        "job_id": job_id,
        "url": url,
        "compare_visibility_against_competitors": comparison,
        "competitor_wins": competitor_wins,
        "gap_opportunities": gap_opportunities,
        "source_analysis": source_analysis,
        "created_at": datetime.utcnow().isoformat(),
    }

    mongo_manager.db.module_f.update_one(
        {"jobId": job_id},
        {
            "$set": {
                "jobId": job_id,
                **result,
                "updatedAt": datetime.utcnow(),
            },
            "$setOnInsert": {"createdAt": datetime.utcnow()},
        },
        upsert=True,
    )

    logger.info(
        "Module F competitor AI intelligence persisted",
        extra={"job_id": job_id, "competitors": len(competitors)},
    )

    return result


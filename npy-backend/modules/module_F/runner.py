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


async def run_module_f_competitor_ai_intelligence(
    job_id: str,
    url: str,
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    mongo_manager.connect()

    if not session_id or not project_id:
        job_doc = mongo_manager.db.jobs.find_one(
            {"$or": [{"id": job_id}, {"jobId": job_id}]},
            {
                "sessionId": 1,
                "session_id": 1,
                "projectId": 1,
                "project_id": 1,
            },
        ) or {}
        session_id = session_id or job_doc.get("sessionId") or job_doc.get("session_id")
        project_id = project_id or job_doc.get("projectId") or job_doc.get("project_id")

    session_id = str(session_id).strip() if session_id else ""
    project_id = str(project_id).strip() if project_id else ""

    module_e_match = [{"jobId": job_id}]
    if session_id:
        module_e_match.append({"sessionId": session_id})

    module_e_pipeline = [
        {"$match": {"$or": module_e_match}},
        {
            "$addFields": {
                "_matchPriority": {
                    "$cond": [{"$eq": ["$jobId", job_id]}, 0, 1]
                }
            }
        },
        {"$sort": {"_matchPriority": 1, "createdAt": -1}},
        {"$limit": 1},
        {
            "$project": {
                "_matchPriority": 0,
            }
        },
    ]
    module_e_doc = next(mongo_manager.module_e.aggregate(module_e_pipeline), {})
    if not module_e_doc and session_id:
        logger.info(f"Module E data not found for jobId {job_id}, fallback for session {session_id} returned no result")

    module_e_doc = module_e_doc or {}
    competitors = _extract_competitors_from_module_e(module_e_doc)
    brand_name = _extract_brand_name_from_module_e(module_e_doc)
    topic = _extract_topic_from_module_e(module_e_doc)

    if not competitors:
        logger.warning(f"No competitors found for job {job_id} (session {session_id})")
        result = {
            "job_id": job_id,
            "session_id": session_id,
            "project_id": project_id,
            "url": url,
            "error": "No competitors found. Run Module E competitor analysis first.",
            "created_at": datetime.utcnow().isoformat(),
        }
        mongo_manager.db.module_f.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    "sessionId": session_id,
                    "projectId": project_id,
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

    topic_for_prompts = (comparison or {}).get("topic") or topic
    prompts = _extract_prompts_from_module_e(module_e_doc, topic_for_prompts)
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
        topic=topic_for_prompts
    )

    recommendations = await analyzer.generate_metric_recommendations(
        visibility_data=comparison,
        win_rate_data=competitor_wins,
        gap_data=gap_opportunities,
        source_data=source_analysis,
    )

    emerging_trends: Dict[str, Any] = {}
    try:
        prev_doc = None
        if session_id:
            prev_doc = mongo_manager.db.module_f.find_one(
                {"sessionId": session_id, "jobId": {"$ne": job_id}},
                sort=[("createdAt", -1)]
            )
        emerging_trends = analyzer.compute_emerging_trends(
            current_compare=comparison,
            current_wins=competitor_wins,
            prev_doc=prev_doc,
        )
    except Exception:
        emerging_trends = {}

    result = {
        "job_id": job_id,
        "session_id": session_id,
        "project_id": project_id,
        "url": url,
        "compare_visibility_against_competitors": comparison,
        "competitor_wins": competitor_wins,
        "gap_opportunities": gap_opportunities,
        "source_analysis": source_analysis,
        "recommendations": recommendations,
        "emerging_trends": emerging_trends if emerging_trends else None,
        "created_at": datetime.utcnow().isoformat(),
    }

    mongo_manager.db.module_f.update_one(
        {"jobId": job_id},
        {
            "$set": {
                "jobId": job_id,
                "sessionId": session_id,
                "projectId": project_id,
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


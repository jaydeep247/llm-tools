
import asyncio
import logging
from typing import Dict, Any
from datetime import datetime

from .contentAnylsisMatrix import OpenAIService
from modules.module_C.knowledge_base import KnowledgeBaseModule
from utils.storage import load_raw_html_sync, save_raw_html
from utils.mongo import mongo_manager

logger = logging.getLogger("module_d")

async def run_content_metrics(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """Run only Content Metrics analysis"""
    if not html_content:
        html_content = load_raw_html_sync(job_id)
        
    if not html_content:
        return {"error": "HTML content missing"}
        
    ai_service = OpenAIService()
    result = ai_service.analyze_content_metrics(html_content, url)
    
    # Store partial result
    try:
        mongo_manager.connect()
        mongo_manager.content_metrics.update_one(
            {"jobId": job_id, "url": url},
            {"$set": {"content_metrics": result, "updatedAt": datetime.utcnow()}},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to store content metrics: {e}")
        
    return result

async def run_entity_analysis(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """Run only Entity Analysis (Knowledge Base)"""
    if not html_content:
        html_content = load_raw_html_sync(job_id)
        
    if not html_content:
        return {"error": "HTML content missing"}

    kb_module = KnowledgeBaseModule()
    result = await kb_module.run_analysis(html_content, url)
    
    # Store partial result
    try:
        mongo_manager.connect()
        mongo_manager.content_metrics.update_one(
            {"jobId": job_id, "url": url},
            {"$set": {"knowledge_base": result, "updatedAt": datetime.utcnow()}},
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to store entity analysis: {e}")
        
    return result

async def run_module_d(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """Run full Module D analysis"""
    if not html_content:
        html_content = load_raw_html_sync(job_id)
        
    if not html_content:
        return {"error": "HTML content missing"}

    # Run in parallel
    kb_task = asyncio.create_task(run_entity_analysis(job_id, url, html_content))
    metrics_task = asyncio.create_task(run_content_metrics(job_id, url, html_content))
    
    kb_result, metrics_result = await asyncio.gather(kb_task, metrics_task)
    
    # Entity relevance requires found entities from KB and AI Service
    ai_service = OpenAIService()
    entity_coverage = kb_result.get("entity_coverage") or {}
    found_entities = entity_coverage.get("found_entities") or []
    expected_entities = entity_coverage.get("expected_entities") or []
    
    entity_relevance = ai_service.analyze_entity_relevance(
        html_content, url, found_entities, expected_entities
    )
    
    result = {
        "success": True,
        "content_metrics": metrics_result,
        "entity_metrics": {
            "entities_detected_count": len(found_entities),
            "entity_coverage_score": entity_coverage.get("coverage_score", 0),
            "entity_relevance_score": entity_relevance.get("entity_relevance_score", 50),
            "relevant_entities": entity_relevance.get("relevant_entities", []),
            "irrelevant_entities": entity_relevance.get("irrelevant_entities", [])
        },
        "knowledge_base": kb_result
    }
    
    # Store full result
    try:
        mongo_manager.connect()
        doc = {
            "jobId": job_id,
            "url": url,
            "createdAt": datetime.utcnow(),
            **result,
        }
        mongo_manager.content_metrics.update_one(
            {"jobId": job_id, "url": url},
            {"$set": doc},
            upsert=True,
        )
        logger.info(f"Stored Module D result for job {job_id}")
    except Exception as e:
        logger.error(f"Failed to store Module D result: {e}")
    
    return result

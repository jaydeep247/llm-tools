import logging
from datetime import datetime
from utils.mongo import mongo_manager
from .pipeline import BrandPipeline

logger = logging.getLogger("brand_onboarding")

async def generate_brand_description(url: str, job_id: str | None = None) -> dict:
    """Stage 1 & 2 wrapper. Returns { description, profile }."""
    if not job_id:
        job_id = f"temp_{int(datetime.utcnow().timestamp())}"

    context = await BrandPipeline.stage1_crawl(url, job_id)
    if not context:
        raise RuntimeError("Could not extract any text from the website")

    profile = await BrandPipeline.stage2_description(context, url, job_id)

    description = profile.get("description", "")
    if not description:
        description = profile.get("one_liner", "Brand description generated.")

    # Strip internal MongoDB / date fields before sending to the client
    _INTERNAL_KEYS = {"_id", "job_id", "created_at"}
    clean_profile = {k: v for k, v in profile.items() if k not in _INTERNAL_KEYS}

    return {"description": description, "profile": clean_profile}

async def get_stored_description(job_id: str) -> dict | None:
    """Returns { description, profile } from the stored brand profile, or None."""
    doc = mongo_manager.brand_profiles.find_one({"job_id": job_id})
    if doc:
        description = doc.get("description") or doc.get("one_liner")
        if description:
            _INTERNAL_KEYS = {"_id", "job_id", "created_at"}
            clean_profile = {k: v for k, v in doc.items() if k not in _INTERNAL_KEYS}
            return {"description": description, "profile": clean_profile}
    # Fallback to legacy module_e for existing jobs (description-only)
    doc_legacy = mongo_manager.module_e.find_one({"jobId": job_id})
    if doc_legacy and doc_legacy.get("brand_description"):
        return {"description": doc_legacy["brand_description"], "profile": None}
    return None

async def get_stored_onboarding_data(job_id: str) -> dict | None:
    profile = mongo_manager.brand_profiles.find_one({"job_id": job_id})
    if profile:
        description = profile.get("description") or profile.get("one_liner")
        
        topics_generated = []
        topics_selected = profile.get("topics_selected", [])
        for t in mongo_manager.brand_topics.find({"job_id": job_id}):
            topics_generated.append(t.get("topic"))
            
        prompts_generated = []
        for p in mongo_manager.brand_prompts.find({"job_id": job_id}):
            prompts_generated.append({"prompt": p.get("prompt"), "type": p.get("intent", "informational")})
            
        prompts_selected = profile.get("prompts_selected", [])
        
        # Results structure
        # Expected by frontend:
        # prompt_results: [{ prompt: str, type: str, results: { openai: {response, analysis, error}, google: {...} } }]
        
        # Normalize backend provider names to frontend-expected keys
        _PROVIDER_KEY_MAP = {"google": "gemini", "anthropic": "claude", "openai": "openai"}

        prompt_results = []
        raw_results = list(mongo_manager.prompt_results.find({"job_id": job_id}))
        grouped_results = {}
        for r in raw_results:
            p_text = r["prompt"]
            if p_text not in grouped_results:
                grouped_results[p_text] = {}
            fe_key = _PROVIDER_KEY_MAP.get(r["model_name"], r["model_name"])
            grouped_results[p_text][fe_key] = {
                "response": r.get("full_response_text", ""),
                "analysis": {
                    "brand_mentioned": r.get("brand_mentioned", False),
                    "mention_position": r.get("mention_position", "not mentioned"),
                    "competitors_mentioned": r.get("competitors_mentioned", []),
                    "brand_visibility_score": r.get("visibility_score", 0)
                },
                "error": None
            }
            
        for p_text, provider_res in grouped_results.items():
            prompt_results.append({
                "prompt": p_text,
                "type": "informational",
                "results": provider_res
            })
            
        return {
            "description": description,
            "topics_generated": topics_generated,
            "topics_selected": topics_selected,
            "prompts_generated": prompts_generated,
            "prompts_selected": prompts_selected,
            "prompt_results": prompt_results
        }
        
    # Legacy fallback
    doc_legacy = mongo_manager.module_e.find_one({"jobId": job_id})
    if doc_legacy:
        return {
            "description": doc_legacy.get("brand_description"),
            "topics_generated": doc_legacy.get("brand_topics_generated", []),
            "topics_selected": doc_legacy.get("brand_topics_selected", []),
            "prompts_generated": doc_legacy.get("brand_prompts_generated", []),
            "prompts_selected": doc_legacy.get("brand_prompts_selected", []),
            "prompt_results": doc_legacy.get("brand_prompt_results", []),
        }
    return None

async def generate_brand_topics(url: str, brand_name: str, brand_description: str, job_id: str | None = None) -> list[str]:
    """Stage 3 wrapper"""
    if not job_id:
        job_id = f"temp_{int(datetime.utcnow().timestamp())}"

    # Use the rich profile already stored by stage2 — no re-crawl needed since the
    # profile now contains the full evidence-based overview (features, use cases, etc.)
    profile = mongo_manager.brand_profiles.find_one({"job_id": job_id})
    if not profile:
        # Fallback: build a minimal profile if stage2 was skipped
        profile = {
            "brand_name": brand_name,
            "description": brand_description,
            "website_url": url,
            "product_category": brand_description,
            "job_id": job_id
        }

    topics_data = await BrandPipeline.stage3_topics(profile, job_id=job_id)
    return [t["topic"] for t in topics_data]

async def save_brand_topics(job_id: str, selected_topics: list[str]) -> None:
    mongo_manager.brand_profiles.update_one(
        {"job_id": job_id},
        {"$set": {"topics_selected": selected_topics}},
        upsert=True
    )
    # Legacy
    mongo_manager.module_e.update_one(
        {"jobId": job_id},
        {"$set": {"brand_topics_selected": selected_topics}},
        upsert=True
    )

async def generate_brand_prompts(brand_name: str, brand_description: str, selected_topics: list[str], job_id: str | None = None) -> list[dict]:
    """Stage 4 wrapper"""
    if not job_id:
        job_id = f"temp_{int(datetime.utcnow().timestamp())}"
        
    profile = mongo_manager.brand_profiles.find_one({"job_id": job_id})
    if not profile:
        profile = {
            "brand_name": brand_name,
            "description": brand_description,
            "job_id": job_id
        }
        
    topics = []
    # If selected_topics are given, fetch their full objects from DB
    for t_name in selected_topics:
        topic_doc = mongo_manager.brand_topics.find_one({"job_id": job_id, "topic": t_name})
        if topic_doc:
            topics.append(topic_doc)
        else:
            topics.append({"topic": t_name, "customer_journey_stage": "awareness", "description": "Selected topic"})
            
    prompts_data = await BrandPipeline.stage4_prompts(topics, profile, job_id)

    # prompts_data is now [{topic: str, prompts: [...]}, ...]
    return [
        {
            "topic": group["topic"],
            "prompts": [
                {
                    "prompt": p.get("prompt", ""),
                    "type": p.get("prompt_type", "informational"),
                    "journey_stage": p.get("journey_stage", ""),
                }
                for p in group.get("prompts", [])
                if isinstance(p, dict) and p.get("prompt")
            ],
        }
        for group in prompts_data
        if isinstance(group, dict)
    ]

async def save_brand_prompts(job_id: str, selected_prompts: list[str]) -> None:
    mongo_manager.brand_profiles.update_one(
        {"job_id": job_id},
        {"$set": {"prompts_selected": selected_prompts}},
        upsert=True
    )
    # Legacy
    mongo_manager.module_e.update_one(
        {"jobId": job_id},
        {"$set": {"brand_prompts_selected": selected_prompts}},
        upsert=True
    )

async def execute_brand_prompts(brand_name: str, prompts: list[dict], job_id: str | None = None) -> list[dict]:
    """Stage 5 & 6 wrapper"""
    if not job_id:
        job_id = f"temp_{int(datetime.utcnow().timestamp())}"
        
    profile = mongo_manager.brand_profiles.find_one({"job_id": job_id})
    if not profile:
        profile = {"brand_name": brand_name, "job_id": job_id}
        
    valid_results = await BrandPipeline.stage5_execution(prompts, profile, job_id)
    await BrandPipeline.stage6_scoring(job_id)
    
    # Normalize backend provider names to frontend-expected keys
    _PROVIDER_KEY_MAP = {"google": "gemini", "anthropic": "claude", "openai": "openai"}

    # Return formatted results for frontend
    prompt_results = []
    grouped_results = {}
    for r in valid_results:
        p_text = r["prompt"]
        if p_text not in grouped_results:
            grouped_results[p_text] = {}
        fe_key = _PROVIDER_KEY_MAP.get(r["model_name"], r["model_name"])
        grouped_results[p_text][fe_key] = {
            "response": r.get("full_response_text", ""),
            "analysis": {
                "brand_mentioned": r.get("brand_mentioned", False),
                "mention_position": r.get("mention_position", "not mentioned"),
                "competitors_mentioned": r.get("competitors_mentioned", []),
                "brand_visibility_score": r.get("visibility_score", 0)
            },
            "error": None
        }
        
    for p_text, provider_res in grouped_results.items():
        prompt_results.append({
            "prompt": p_text,
            "type": "informational",
            "results": provider_res
        })
        
    # Legacy persist for compatibility if needed
    mongo_manager.module_e.update_one(
        {"jobId": job_id},
        {"$set": {"brand_prompt_results": prompt_results}},
        upsert=True
    )
    
    return prompt_results

async def get_brand_prompt_results(job_id: str) -> list[dict] | None:
    data = await get_stored_onboarding_data(job_id)
    if data:
        return data.get("prompt_results")
    return None

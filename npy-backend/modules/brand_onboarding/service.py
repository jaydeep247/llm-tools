import logging
from datetime import datetime
from utils.mongo import mongo_manager
from .pipeline import BrandPipeline

logger = logging.getLogger("brand_onboarding")

# Provider key mapping: backend provider name → frontend display key
_PROVIDER_KEY_MAP = {"google": "gemini", "anthropic": "claude", "openai": "openai"}


def _format_single_result(r: dict) -> dict:
    """Format a raw MongoDB prompt_results doc into the frontend per-LLM structure."""
    return {
        "response": r.get("full_response_text", ""),
        "analysis": {
            "brand_mentioned": r.get("brand_mentioned", False),
            "brand_mention_count": r.get("brand_mention_count", 0),
            "brand_rank": r.get("brand_rank"),
            "brand_rank_out_of": r.get("brand_rank_out_of", 0),
            "mention_position": r.get("mention_position", "not_mentioned"),
            "sentiment": r.get("sentiment", "not_mentioned"),
            "in_title": r.get("in_title", False),
            "competitors_mentioned": r.get("competitors_mentioned", []),
            "all_mentioned_brands": r.get("all_mentioned_brands", []),
            "brand_visibility_score": r.get("visibility_score", 0),
        },
        "error": None,
    }


def _compute_aggregate_stats(results: list) -> dict:
    """
    Compute aggregate stats across all LLM response docs for a job.

    Returns:
      total_responses:        int
      brand_presence_count:   int   (how many responses mentioned the brand)
      brand_presence_total:   int   (= total_responses, for percentage calc)
      brand_presence_rate:    float (percentage)
      avg_rank:               float | None  (avg 1-based rank where brand was present)
      positive_mentions:      int
      negative_mentions:      int
      neutral_mentions:       int
      competitors_presence:   [{name, count}]  total mentions across all responses
      all_brand_mentions:     [{name, count}]  brand + competitors, totalled
    """
    if not results:
        return {}

    total = len(results)
    brand_presence_count = sum(1 for r in results if r.get("brand_mentioned"))

    ranks = [r["brand_rank"] for r in results if r.get("brand_rank") is not None]
    avg_rank = round(sum(ranks) / len(ranks), 2) if ranks else None

    positive_mentions = sum(1 for r in results if r.get("sentiment") == "positive")
    negative_mentions = sum(1 for r in results if r.get("sentiment") == "negative")
    neutral_mentions = sum(
        1 for r in results if r.get("brand_mentioned") and r.get("sentiment") == "neutral"
    )

    # Aggregate competitor mention counts across all results
    comp_totals: dict = {}
    for r in results:
        for c in (r.get("competitors_mentioned") or []):
            name = c.get("name", "") if isinstance(c, dict) else str(c)
            count = c.get("count", 1) if isinstance(c, dict) else 1
            if name:
                comp_totals[name] = comp_totals.get(name, 0) + count

    competitors_presence = [
        {"name": k, "count": v}
        for k, v in sorted(comp_totals.items(), key=lambda x: -x[1])
    ]

    # Aggregate all brand mention counts (our brand + competitors)
    all_brand_totals: dict = {}
    for r in results:
        for b in (r.get("all_mentioned_brands") or []):
            name = b.get("name", "") if isinstance(b, dict) else str(b)
            count = b.get("count", 1) if isinstance(b, dict) else 1
            if name:
                all_brand_totals[name] = all_brand_totals.get(name, 0) + count

    all_brand_mentions = [
        {"name": k, "count": v}
        for k, v in sorted(all_brand_totals.items(), key=lambda x: -x[1])
    ]

    return {
        "total_responses": total,
        "brand_presence_count": brand_presence_count,
        "brand_presence_total": total,
        "brand_presence_rate": round(brand_presence_count / total * 100, 1) if total else 0.0,
        "avg_rank": avg_rank,
        "positive_mentions": positive_mentions,
        "negative_mentions": negative_mentions,
        "neutral_mentions": neutral_mentions,
        "competitors_presence": competitors_presence,
        "all_brand_mentions": all_brand_mentions,
    }

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
        # prompt_results: [{ prompt: str, type: str, results: { openai: {response, analysis, error}, gemini: {...}, claude: {...} } }]

        prompt_results = []
        raw_results = list(mongo_manager.prompt_results.find({"job_id": job_id}))
        grouped_results: dict = {}
        for r in raw_results:
            p_text = r["prompt"]
            if p_text not in grouped_results:
                grouped_results[p_text] = {}
            fe_key = _PROVIDER_KEY_MAP.get(r["model_name"], r["model_name"])
            grouped_results[p_text][fe_key] = _format_single_result(r)

        # Build prompt → topic mapping from brand_prompts collection
        prompt_topic_map: dict = {}
        for p in mongo_manager.brand_prompts.find({"job_id": job_id}, {"prompt": 1, "topic": 1}):
            if p.get("prompt") and p.get("topic"):
                prompt_topic_map[p["prompt"]] = p["topic"]

        for p_text, provider_res in grouped_results.items():
            prompt_results.append({
                "prompt": p_text,
                "type": "informational",
                "topic": prompt_topic_map.get(p_text, ""),
                "results": provider_res,
            })

        aggregate = _compute_aggregate_stats(raw_results)

        # Read stored competitive landscape (from Stage 7)
        cl_doc = mongo_manager.brand_competitive_landscape.find_one({"job_id": job_id})
        competitive_landscape = (cl_doc or {}).get("competitive_landscape") or []

        # Fallback: if stage 7 hasn't run or produced empty results, derive from
        # aggregate.all_brand_mentions so the panel always has data to show.
        if not competitive_landscape and aggregate:
            brand_name = (profile or {}).get("brand_name") or ""
            bn_lower = brand_name.strip().lower()
            for i, entry in enumerate(aggregate.get("all_brand_mentions") or []):
                name = entry.get("name") or ""
                competitive_landscape.append({
                    "name": name,
                    "mention_count": entry.get("count") or 0,
                    "avg_rank": None,
                    "providers_mentioned": [],
                    "is_our_brand": bool(name.strip().lower() == bn_lower and bn_lower),
                    "organic_rank": i + 1,
                })
            
        return {
            "description": description,
            "topics_generated": topics_generated,
            "topics_selected": topics_selected,
            "prompts_generated": prompts_generated,
            "prompts_selected": prompts_selected,
            "prompt_results": prompt_results,
            "aggregate": aggregate,
            "competitive_landscape": competitive_landscape,
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

async def execute_brand_prompts(brand_name: str, prompts: list, job_id: str | None = None) -> dict:
    """Stage 5 & 6 wrapper. Returns {prompt_results, aggregate}."""
    if not job_id:
        job_id = f"temp_{int(datetime.utcnow().timestamp())}"

    profile = mongo_manager.brand_profiles.find_one({"job_id": job_id})
    if not profile:
        profile = {"brand_name": brand_name, "job_id": job_id}

    valid_results = await BrandPipeline.stage5_execution(prompts, profile, job_id)
    await BrandPipeline.stage6_scoring(job_id)

    # Stage 7: Unbranded category discovery — runs in parallel with scoring
    competitive_landscape = await BrandPipeline.stage7_category_discovery(profile, job_id)

    grouped_results: dict = {}
    for r in valid_results:
        p_text = r["prompt"]
        if p_text not in grouped_results:
            grouped_results[p_text] = {}
        fe_key = _PROVIDER_KEY_MAP.get(r["model_name"], r["model_name"])
        grouped_results[p_text][fe_key] = _format_single_result(r)

    # Build prompt → topic mapping from brand_prompts collection
    prompt_topic_map: dict = {}
    for p in mongo_manager.brand_prompts.find({"job_id": job_id}, {"prompt": 1, "topic": 1}):
        if p.get("prompt") and p.get("topic"):
            prompt_topic_map[p["prompt"]] = p["topic"]

    prompt_results = [
        {"prompt": p_text, "type": "informational", "topic": prompt_topic_map.get(p_text, ""), "results": provider_res}
        for p_text, provider_res in grouped_results.items()
    ]

    aggregate = _compute_aggregate_stats(valid_results)

    # Fallback: if stage7 produced empty landscape, derive from aggregate
    if not competitive_landscape and aggregate:
        bn_lower = (brand_name or "").strip().lower()
        for i, entry in enumerate(aggregate.get("all_brand_mentions") or []):
            name = entry.get("name") or ""
            competitive_landscape.append({
                "name": name,
                "mention_count": entry.get("count") or 0,
                "avg_rank": None,
                "providers_mentioned": [],
                "is_our_brand": bool(name.strip().lower() == bn_lower and bn_lower),
                "organic_rank": i + 1,
            })

    # Legacy persist for compatibility
    mongo_manager.module_e.update_one(
        {"jobId": job_id},
        {"$set": {"brand_prompt_results": prompt_results}},
        upsert=True
    )

    return {"prompt_results": prompt_results, "aggregate": aggregate, "competitive_landscape": competitive_landscape}

async def get_brand_prompt_results(job_id: str) -> dict | None:
    data = await get_stored_onboarding_data(job_id)
    if data:
        return {
            "results": data.get("prompt_results"),
            "aggregate": data.get("aggregate"),
        }
    return None

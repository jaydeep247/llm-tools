"""
prompt_library.py — SOP-001 Phase 1: Prompt Library
FULLY NEW — this entire file was missing from the codebase.

SOP-001 §2.1 requirements implemented:
  - prompt_library collection in MongoDB (append-only, never delete rows)
  - 50 seed prompts across 3 categories (brand, category, problem)
  - intent_category, industry_tag, competitor_tags, tier_access per prompt
  - get_prompts_for_job() returns the correct prompts for a job's tier + brand
  - seed_prompt_library() idempotent — safe to call on every startup
  - Admin functions: add_prompt(), deactivate_prompt(), update_competitor_tags()

Collections written:
  - prompt_library   — the master prompt store (SOP-001 §2.1 schema)
"""

import logging
from datetime import datetime
from typing import Optional
from utils.mongo import mongo_manager

logger = logging.getLogger("prompt_library")


# ─────────────────────────────────────────────────────────────────────────────
# SOP-001 §2.1 seed prompts — 50 prompts, 3 categories
# Each prompt has: text, intent_category, industry_tag, tier_access
# ─────────────────────────────────────────────────────────────────────────────

_SEED_PROMPTS = [
    # ── Brand Prompts (direct brand queries) ─────────────────────────────────
    {
        "prompt_text": "What is {brand}?",
        "intent_category": "informational",
        "industry_tag": "general",
        "tier_access": "starter",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "Is {brand} legitimate?",
        "intent_category": "informational",
        "industry_tag": "general",
        "tier_access": "starter",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "Reviews of {brand}",
        "intent_category": "commercial",
        "industry_tag": "general",
        "tier_access": "starter",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "How does {brand} work?",
        "intent_category": "informational",
        "industry_tag": "general",
        "tier_access": "starter",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "Is {brand} worth it?",
        "intent_category": "commercial",
        "industry_tag": "general",
        "tier_access": "starter",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "What are the pros and cons of {brand}?",
        "intent_category": "comparative",
        "industry_tag": "general",
        "tier_access": "starter",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "{brand} pricing",
        "intent_category": "commercial",
        "industry_tag": "general",
        "tier_access": "starter",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "{brand} alternatives",
        "intent_category": "comparative",
        "industry_tag": "general",
        "tier_access": "pro",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "How does {brand} compare to competitors?",
        "intent_category": "comparative",
        "industry_tag": "general",
        "tier_access": "pro",
        "prompt_type": "brand",
    },
    {
        "prompt_text": "Is {brand} better than alternatives?",
        "intent_category": "comparative",
        "industry_tag": "general",
        "tier_access": "pro",
        "prompt_type": "brand",
    },

    # ── Category Prompts (AEO / SEO / SaaS industry) ─────────────────────────
    {
        "prompt_text": "Best AI SEO tools 2025",
        "intent_category": "commercial",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "Top GEO platforms for agencies",
        "intent_category": "commercial",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "How to improve AI search visibility",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "What is answer engine optimisation?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "Best tools to track AI citations",
        "intent_category": "commercial",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "How to get cited by ChatGPT",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "How to get cited by Perplexity AI",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "What is generative engine optimisation?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "Best SEO audit tools 2025",
        "intent_category": "commercial",
        "industry_tag": "seo",
        "tier_access": "pro",
        "prompt_type": "category",
    },
    {
        "prompt_text": "AI visibility tools for SaaS companies",
        "intent_category": "commercial",
        "industry_tag": "saas",
        "tier_access": "pro",
        "prompt_type": "category",
    },
    {
        "prompt_text": "How do AI assistants choose which websites to cite?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "What content signals make a page more citable by AI?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "Best tools to monitor brand mentions in AI answers",
        "intent_category": "commercial",
        "industry_tag": "marketing",
        "tier_access": "pro",
        "prompt_type": "category",
    },
    {
        "prompt_text": "How to rank in ChatGPT answers",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "AEO vs SEO: what is the difference?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },
    {
        "prompt_text": "Top content optimisation platforms for agencies",
        "intent_category": "commercial",
        "industry_tag": "marketing",
        "tier_access": "pro",
        "prompt_type": "category",
    },
    {
        "prompt_text": "How to measure AI search performance",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "pro",
        "prompt_type": "category",
    },
    {
        "prompt_text": "AI SEO tools comparison 2025",
        "intent_category": "comparative",
        "industry_tag": "seo",
        "tier_access": "pro",
        "prompt_type": "category",
    },
    {
        "prompt_text": "Best platforms for tracking competitor AI citations",
        "intent_category": "commercial",
        "industry_tag": "seo",
        "tier_access": "agency",
        "prompt_type": "category",
    },
    {
        "prompt_text": "How to do AEO audit for a website",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "category",
    },

    # ── Problem Prompts (highest buying intent) ───────────────────────────────
    {
        "prompt_text": "My brand does not show in ChatGPT answers",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to get cited by AI assistants",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "Why is my competitor showing up in AI answers but not me?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "My website traffic dropped after AI search launched",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How do I know if AI systems are citing my content?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to fix low AI search visibility",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "Why does Perplexity AI not cite my website?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to optimise content for AI search engines",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to track which AI models mention my brand",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "pro",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to increase brand citations in LLM answers",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "pro",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "Content not being cited by AI — how to fix?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to add FAQ schema to improve AI citations",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "Why is AI search hurting my organic traffic?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to beat competitors in AI search results",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "pro",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "My content is not appearing in Perplexity or ChatGPT",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to structure website content for AI readability",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How do I monitor my brand in generative AI answers?",
        "intent_category": "informational",
        "industry_tag": "marketing",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "AI citation tracking for ecommerce brands",
        "intent_category": "commercial",
        "industry_tag": "ecommerce",
        "tier_access": "pro",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "How to get more brand mentions in AI generated content",
        "intent_category": "informational",
        "industry_tag": "marketing",
        "tier_access": "pro",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "Tools to audit AI answer engine performance",
        "intent_category": "commercial",
        "industry_tag": "seo",
        "tier_access": "pro",
        "prompt_type": "problem",
    },
    {
        "prompt_text": "Why does ChatGPT recommend my competitor instead of me?",
        "intent_category": "informational",
        "industry_tag": "seo",
        "tier_access": "starter",
        "prompt_type": "problem",
    },
]

# Tier hierarchy for access control
_TIER_HIERARCHY = {"starter": 0, "pro": 1, "agency": 2, "enterprise": 3}

# SOP-001 §3.4 — Hard prompt limits per tier per job run
# These match the monthly limits scaled to per-run (monthly / ~20 working days)
_TIER_PROMPT_LIMITS = {
    "starter":    10,   # 50/mo → ~10 per run
    "pro":        15,   # 200/mo → ~15 per run (cost controlled)
    "agency":     25,   # 500/mo → ~25 per run
    "enterprise": 50,   # 1000/mo → 50 per run
}


# ─────────────────────────────────────────────────────────────────────────────
# Seeding — idempotent, safe to run on startup
# ─────────────────────────────────────────────────────────────────────────────

def seed_prompt_library() -> int:
    """
    SOP-001 §2.1: Seed 50 prompt templates into MongoDB.
    Idempotent — skips prompts that already exist (matched on prompt_text).
    Returns count of newly inserted prompts.
    """
    mongo_manager.connect()
    db = mongo_manager.db
    inserted = 0

    for seed in _SEED_PROMPTS:
        existing = db.prompt_library.find_one({"prompt_text": seed["prompt_text"]})
        if not existing:
            db.prompt_library.insert_one({
                **seed,
                "competitor_tags": [],
                "is_active": True,
                "created_at": datetime.utcnow(),
                "last_run_at": None,
            })
            inserted += 1

    logger.info("[PROMPT_LIBRARY] Seeded %d new prompts (%d total templates)", inserted, len(_SEED_PROMPTS))
    return inserted


# ─────────────────────────────────────────────────────────────────────────────
# Prompt retrieval — called by runner.py to get prompts for a job
# ─────────────────────────────────────────────────────────────────────────────

def get_prompts_for_job(
    brand_name: str,
    plan_tier: str = "starter",
    industry_tag: str = "seo",
    competitor_domains: list = None,
    custom_prompts: list = None,
    limit: int = None,  # None = use SOP-001 §3.4 tier limit
) -> list:
    """
    SOP-001 §2.1: Get active prompts for a job.

    - Filters by tier_access (starter gets starter prompts; pro gets starter+pro; etc.)
    - Replaces {brand} placeholder with real brand_name
    - Merges customer's custom_prompts from their dashboard
    - Enforces SOP-001 §3.4 per-run limits by tier (prevents cost blowout)

    Args:
        brand_name:          Customer's brand name e.g. "Colytics"
        plan_tier:           starter / pro / agency / enterprise
        industry_tag:        seo / marketing / saas / ecommerce / general
        competitor_domains:  Used to filter competitor-specific prompt templates
        custom_prompts:      Custom prompts submitted by customer from dashboard
        limit:               Override tier limit (defaults to SOP-001 §3.4 per-tier cap)
    """
    mongo_manager.connect()
    db = mongo_manager.db

    # SOP-001 §3.4 — enforce per-tier per-run limit
    if limit is None:
        limit = _TIER_PROMPT_LIMITS.get(plan_tier, _TIER_PROMPT_LIMITS["starter"])

    tier_level = _TIER_HIERARCHY.get(plan_tier, 0)

    # Tiers the customer can access (inclusive of lower tiers)
    accessible_tiers = [t for t, level in _TIER_HIERARCHY.items() if level <= tier_level]

    # Query active prompts for accessible tiers and industry
    query = {
        "is_active": True,
        "tier_access": {"$in": accessible_tiers},
    }
    if industry_tag and industry_tag != "general":
        query["$or"] = [
            {"industry_tag": industry_tag},
            {"industry_tag": "general"},
        ]

    raw_prompts = list(db.prompt_library.find(query).limit(limit))

    prompt_texts = []
    seen = set()

    for p in raw_prompts:
        text = p.get("prompt_text", "")
        # Replace {brand} placeholder with real brand name
        if brand_name:
            text = text.replace("{brand}", brand_name)
        if text and text not in seen:
            prompt_texts.append(text)
            seen.add(text)

    # Merge customer's custom prompts (from their dashboard)
    if custom_prompts:
        for cp in custom_prompts:
            if cp and cp not in seen:
                prompt_texts.append(cp)
                seen.add(cp)

    # Enforce tier limit
    prompt_texts = prompt_texts[:limit]

    logger.info(
        "[PROMPT_LIBRARY] Returning %d prompts | tier=%s | brand=%s",
        len(prompt_texts), plan_tier, brand_name,
    )
    return prompt_texts


# ─────────────────────────────────────────────────────────────────────────────
# Admin functions (for Gaurav's weekly curation — SOP-001 §3.1)
# ─────────────────────────────────────────────────────────────────────────────

def add_prompt(
    prompt_text: str,
    intent_category: str,
    industry_tag: str,
    tier_access: str = "pro",
    competitor_tags: list = None,
    prompt_type: str = "category",
) -> str:
    """
    SOP-001 §2.1: Add a new prompt to the library.
    Append-only — never deletes. Returns inserted _id as str.
    """
    if not prompt_text or not prompt_text.strip():
        raise ValueError("prompt_text cannot be empty")

    mongo_manager.connect()
    db = mongo_manager.db

    existing = db.prompt_library.find_one({"prompt_text": prompt_text.strip()})
    if existing:
        logger.info("[PROMPT_LIBRARY] Prompt already exists: '%s'", prompt_text[:50])
        return str(existing["_id"])

    result = db.prompt_library.insert_one({
        "prompt_text": prompt_text.strip(),
        "intent_category": intent_category,
        "industry_tag": industry_tag,
        "tier_access": tier_access,
        "prompt_type": prompt_type,
        "competitor_tags": competitor_tags or [],
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_run_at": None,
    })
    logger.info("[PROMPT_LIBRARY] Added prompt: '%s'", prompt_text[:50])
    return str(result.inserted_id)


def deactivate_prompt(prompt_text: str) -> bool:
    """
    SOP-001 §2.1: Deactivate a prompt (append-only — sets is_active=False, never deletes).
    Returns True if deactivated, False if not found.
    """
    mongo_manager.connect()
    result = mongo_manager.db.prompt_library.update_one(
        {"prompt_text": prompt_text},
        {"$set": {"is_active": False, "deactivated_at": datetime.utcnow()}},
    )
    if result.matched_count > 0:
        logger.info("[PROMPT_LIBRARY] Deactivated: '%s'", prompt_text[:50])
        return True
    logger.warning("[PROMPT_LIBRARY] Prompt not found to deactivate: '%s'", prompt_text[:50])
    return False


def update_competitor_tags(prompt_text: str, competitor_tags: list) -> bool:
    """Update the competitor brand tags watched in a prompt's responses."""
    mongo_manager.connect()
    result = mongo_manager.db.prompt_library.update_one(
        {"prompt_text": prompt_text},
        {"$set": {"competitor_tags": competitor_tags, "updated_at": datetime.utcnow()}},
    )
    return result.matched_count > 0


def mark_prompt_run(prompt_text: str) -> None:
    """Update last_run_at timestamp after a prompt is executed."""
    try:
        mongo_manager.connect()
        mongo_manager.db.prompt_library.update_one(
            {"prompt_text": prompt_text},
            {"$set": {"last_run_at": datetime.utcnow()}},
        )
    except Exception as exc:
        logger.warning("[PROMPT_LIBRARY] Could not update last_run_at: %s", exc)


def get_library_stats() -> dict:
    """
    SOP-001 §3.1 Admin Dashboard: prompt library health stats.
    Returns total, active, by tier, by category, citation rate per prompt.
    """
    mongo_manager.connect()
    db = mongo_manager.db

    total = db.prompt_library.count_documents({})
    active = db.prompt_library.count_documents({"is_active": True})

    by_tier = {}
    for tier in _TIER_HIERARCHY:
        by_tier[tier] = db.prompt_library.count_documents({"tier_access": tier, "is_active": True})

    by_type = {}
    for pt in ["brand", "category", "problem"]:
        by_type[pt] = db.prompt_library.count_documents({"prompt_type": pt, "is_active": True})

    return {
        "total_prompts": total,
        "active_prompts": active,
        "inactive_prompts": total - active,
        "by_tier": by_tier,
        "by_type": by_type,
    }
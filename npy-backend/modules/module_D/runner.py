"""
module_d_runner.py — FULL PIPELINE + ALL NEW CAPABILITIES
No separate router. Everything handled here via runner functions
called by workers/executors/module_d.py job dispatch.

Job types handled (all routed through execute_module_d_job):
  MODULE_D                  Full pipeline (steps 1–10)
  MODULE_D_CONTENT_METRICS  Content + entity metrics only
  MODULE_D_ENTITY_ANALYSIS  Entity analysis only
  MODULE_D_PROMPT_TRACKING  Prompt tracking with real LLM execution
  MODULE_D_PROMPT_INGEST    Ingest + dedup + store new prompts
  MODULE_D_PROMPT_EXPAND    Expand seed keywords into 5-cluster variants
  MODULE_D_DIFFICULTY       Recompute difficulty scores for all prompts
  MODULE_D_PROMPT_LIST      Return all prompts for a project (read)
  MODULE_D_CITATIONS        Return citation records for a prompt (read)
  MODULE_D_PERFORMANCE      Return performance snapshots (read)
  MODULE_D_MANUAL_RUN       Trigger a single prompt re-execution
  MODULE_D_FEEDBACK         Record recommendation feedback (RAR/SLAR/RDR)
  MODULE_D_HEALTH           Admin pipeline health summary

SOP references implemented:
  SOP-002 §3.2  Rate limit enforcement (500 prompts/project/24h)
  SOP-002 §3.3  Two-step dedup (SHA-256 hash + cosine similarity 0.92)
  SOP-002 §4    Prompt expansion into 5 intent clusters
  SOP-002 §4.3  Difficulty scoring with 4-input weighted formula
  SOP-002 §5.1  Full 10-step pipeline
  SOP-002 §5.3  Rate limit handling with Redis counters + re-queue
  SOP-002 §7.1  Prompt Visibility Score formula (append-only snapshots)
  SOP-002 §8.1  All 7 API operations (as runner functions, not HTTP routes)
  SOP-002 §12   Investor KPI instrumentation
"""

import asyncio
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from .contentAnylsisMatrix import ClaudeService, _record_investor_kpis
from modules.module_C.knowledge_base import KnowledgeBaseModule
from utils.storage import load_raw_html_sync
from utils.mongo import mongo_manager
from .recommendation_engine import generate_prompt_recommendations

ClaudeService.generate_prompt_recommendations = generate_prompt_recommendations

logger = logging.getLogger("module_d")

# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _step_ok(name: str, data: Any) -> Dict:
    return {"status": "ok", "step": name, "data": data}

def _step_err(name: str, exc: Exception) -> Dict:
    logger.error("Step %s failed: %s", name, exc)
    return {"status": "error", "step": name, "error": str(exc), "data": None}


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §3.2 — Rate limit: 500 prompts per project per 24h
# ─────────────────────────────────────────────────────────────────────────────

_DAILY_PROMPT_LIMIT = 500

def _check_and_enforce_rate_limit(project_id: str, count_to_add: int = 1) -> Dict:
    """
    Returns {"allowed": True} or {"allowed": False, "current": int, "limit": int}.
    """
    try:
        mongo_manager.connect()
        since = datetime.utcnow() - timedelta(hours=24)
        current = mongo_manager.db.prompt_jobs.count_documents({
            "project_id": project_id,
            "created_at": {"$gte": since},
        })
        if current + count_to_add > _DAILY_PROMPT_LIMIT:
            logger.warning(
                "[RATE_LIMIT] Project %s has %d prompts in last 24h — limit is %d",
                project_id, current, _DAILY_PROMPT_LIMIT,
            )
            return {"allowed": False, "current": current, "limit": _DAILY_PROMPT_LIMIT}
        return {"allowed": True, "current": current}
    except Exception as exc:
        logger.warning("Rate limit check failed: %s", exc)
        return {"allowed": True, "current": 0}


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §5.1 Step 2 — Delta classification from DB
# ─────────────────────────────────────────────────────────────────────────────

def _derive_account_context_from_db(
    job_id: str,
    caller_context: Optional[Dict] = None,
) -> Dict:
    derived: Dict = {}
    try:
        mongo_manager.connect()
        kpis = list(
            mongo_manager.db.platform_kpis.find(
                {"job_id": job_id}, sort=[("recorded_at", -1)], limit=10,
            )
        )
        if len(kpis) >= 2:
            latest  = kpis[0].get("avg_citation_rate") or 0.0
            prev    = kpis[-1].get("avg_citation_rate") or 0.0
            if prev > 0:
                derived["citation_score_drop_pct"] = max(0.0, round((prev - latest) / prev * 100, 2))

        seven_ago = datetime.utcnow() - timedelta(days=7)
        snaps = list(
            mongo_manager.db.prompt_performance_snapshots.find(
                {"created_at": {"$gte": seven_ago}}, sort=[("created_at", 1)]
            )
        )
        if len(snaps) >= 2:
            first_pvs = snaps[0].get("prompt_visibility_score", 0)
            last_pvs  = snaps[-1].get("prompt_visibility_score", 0)
            derived["aivs_dropped_7d"] = last_pvs < first_pvs
            delta = round(first_pvs - last_pvs, 2)
            if delta > 0:
                derived["aivs_drop_pts"]  = delta
            else:
                derived["aivs_gain_pts"]  = abs(delta)

        comp_counts = [s.get("competitor_count", 0) for s in snaps if isinstance(s.get("competitor_count"), (int, float))]
        if len(comp_counts) >= 2 and comp_counts[-1] - comp_counts[0] > 0:
            derived["competitor_gained_pts"] = comp_counts[-1] - comp_counts[0]

        job_doc = mongo_manager.content_metrics.find_one({"jobId": job_id}, sort=[("updatedAt", -1)]) or {}
        last_crawl = job_doc.get("updatedAt")
        if isinstance(last_crawl, datetime):
            derived["days_since_crawl"] = (datetime.utcnow() - last_crawl).days

        last_action = (mongo_manager.db.recommendation_feedback.find_one(
            {"job_id": job_id, "feedback": "completed"}, sort=[("recorded_at", -1)]
        ) or {}).get("recorded_at")
        derived["days_since_last_action"] = (
            (datetime.utcnow() - last_action).days if isinstance(last_action, datetime) else 99
        )

        tracking = mongo_manager.db.prompt_tracking.find_one({"jobId": job_id}) or {}
        derived["total_tracked_prompts"] = len(tracking.get("tracked_prompts") or [])

    except Exception as exc:
        logger.warning("Could not derive account context from DB for job %s: %s", job_id, exc)

    return {**derived, **(caller_context or {})}


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §5.1 Step 9 — Delivery hooks (scaffolded)
# ─────────────────────────────────────────────────────────────────────────────

async def _deliver_recommendations(job_id: str, url: str, recommendations: List[Dict], summary: Dict) -> Dict:
    log: Dict[str, str] = {}
    try:
        # TODO: emit to Redis Streams / WebSocket channel
        log["dashboard"] = "ok_noop"
    except Exception as exc:
        log["dashboard"] = f"error: {exc}"
    try:
        # TODO: enqueue email job via BullMQ scheduler
        log["email_digest"] = "ok_noop"
    except Exception as exc:
        log["email_digest"] = f"error: {exc}"
    try:
        if summary.get("critical", 0) > 0:
            # TODO: fire push notification via notification gateway
            log["push_notification"] = "ok_noop_critical_detected"
        else:
            log["push_notification"] = "skipped_no_critical"
    except Exception as exc:
        log["push_notification"] = f"error: {exc}"
    return log


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §8.1 — PROMPT INGEST (replaces POST /api/v1/prompts)
# ─────────────────────────────────────────────────────────────────────────────

async def run_prompt_ingest(
    project_id: str,
    prompts: List[str],
    intent_cluster: Optional[str] = None,
    target_models: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    SOP-002 §3.2 + §3.3 — Ingest, validate, dedup, and store prompts.
    Called by execute_module_d_job for MODULE_D_PROMPT_INGEST job type.

    Handles:
      - Length validation (10–500 chars)
      - Rate limit enforcement (500/project/24h)
      - SHA-256 exact dedup
      - Cosine similarity near-dedup (>0.92 flagged, not blocked)
      - Hash + embedding stored for future dedup
    """
    from .prompt_dedup import check_duplicate, store_prompt_hash_and_embedding
    from .prompt_library import seed_prompt_library

    seed_prompt_library()

    rate_check = _check_and_enforce_rate_limit(project_id, len(prompts))
    if not rate_check["allowed"]:
        return {
            "success": False,
            "error": "rate_limit_exceeded",
            "message": f"Maximum {_DAILY_PROMPT_LIMIT} prompts per project per 24 hours.",
            "current_count": rate_check["current"],
            "retry_after_seconds": 3600,
        }

    mongo_manager.connect()
    db  = mongo_manager.db
    now = datetime.utcnow()

    created = 0
    duplicates_skipped = 0
    near_duplicates_flagged = 0
    prompt_ids = []

    for prompt_text in prompts:
        if not isinstance(prompt_text, str):
            continue
        prompt_text = prompt_text.strip()

        # Length validation (SOP-002 §3.2)
        if len(prompt_text) < 10 or len(prompt_text) > 500:
            logger.debug("[INGEST] Skipped prompt outside 10–500 char range: '%s'", prompt_text[:40])
            continue

        # Dedup (SOP-002 §3.3)
        dedup = check_duplicate(prompt_text, project_id)

        if dedup["action"] == "reject":
            duplicates_skipped += 1
            continue

        if dedup["action"] == "flag":
            near_duplicates_flagged += 1
            # Near-duplicate: insert with warning flag — client decides

        doc = {
            "project_id":       project_id,
            "prompt_text":      prompt_text,
            "intent_cluster":   intent_cluster or "informational",
            "target_models":    target_models or ["gpt-4o", "gemini-1.5-pro", "claude-sonnet-4-5"],
            "difficulty_score": 0.0,
            "status":           "pending",
            "is_near_duplicate": dedup["action"] == "flag",
            "near_duplicate_similarity": dedup.get("similarity_score"),
            "prompt_hash":      dedup.get("hash"),
            "created_at":       now,
            "scheduled_next":   now + timedelta(minutes=5),
        }
        result = db.prompt_jobs.insert_one(doc)
        prompt_ids.append(str(result.inserted_id))
        created += 1

        store_prompt_hash_and_embedding(prompt_text, project_id, dedup)

    queue_position = db.prompt_jobs.count_documents({"status": "pending"})

    logger.info("[INGEST] project=%s created=%d skipped=%d near_dup=%d",
                project_id, created, duplicates_skipped, near_duplicates_flagged)

    return {
        "success":                 True,
        "created":                 created,
        "duplicates_skipped":      duplicates_skipped,
        "near_duplicates_flagged": near_duplicates_flagged,
        "prompt_ids":              prompt_ids,
        "estimated_first_run":     (now + timedelta(minutes=5)).isoformat() + "Z",
        "queue_position":          queue_position,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §4 — PROMPT EXPANSION
# ─────────────────────────────────────────────────────────────────────────────

async def run_prompt_expand(
    job_id: str,
    project_id: str,
    seed_keywords: List[str],
) -> Dict[str, Any]:
    """
    SOP-002 §4.2 — Expand seed keywords into 5-cluster variant sets.
    Called by execute_module_d_job for MODULE_D_PROMPT_EXPAND.
    Results are stored in prompt_expansions collection.
    Expanded variants are also ingested via run_prompt_ingest.
    """
    from .prompt_expander import expand_seed_prompts_batch, get_all_variants_flat

    if not seed_keywords:
        return {"success": False, "error": "No seed_keywords provided"}

    expansions = expand_seed_prompts_batch(
        seed_prompts=seed_keywords,
        job_id=job_id,
        project_id=project_id,
    )

    # Collect all flat variants across all seeds
    all_variants = []
    for exp in expansions:
        all_variants.extend(get_all_variants_flat(exp))

    # Remove dupes
    all_variants = list(dict.fromkeys(all_variants))

    # Ingest expanded variants as real prompt_jobs
    ingest_result = await run_prompt_ingest(
        project_id=project_id,
        prompts=all_variants,
    )

    total_variants = sum(e.get("total_variants", 0) for e in expansions)
    errors = [e["error"] for e in expansions if e.get("error")]

    logger.info("[EXPAND] seeds=%d total_variants=%d ingested=%d",
                len(seed_keywords), total_variants, ingest_result.get("created", 0))

    return {
        "success":         True,
        "seeds_processed": len(expansions),
        "total_variants":  total_variants,
        "ingest_result":   ingest_result,
        "expansion_errors": errors,
        "expansions":      expansions,
    }


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §4.3 — DIFFICULTY RECOMPUTE
# ─────────────────────────────────────────────────────────────────────────────

async def run_difficulty_update(job_id: str) -> Dict[str, Any]:
    """
    SOP-002 §4.3 — Recompute difficulty scores for all prompts in a job.
    Called by execute_module_d_job for MODULE_D_DIFFICULTY.
    """
    from .difficulty_scorer import batch_update_difficulties
    result = batch_update_difficulties(job_id)
    return {"success": True, **result}


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §8.1 — READ OPERATIONS (list / citations / performance)
# ─────────────────────────────────────────────────────────────────────────────

async def run_prompt_list(project_id: str, status_filter: Optional[str] = None, limit: int = 100) -> Dict[str, Any]:
    """
    SOP-002 §8.1 GET /api/v1/prompts/{project_id} — list all prompts.
    Called by execute_module_d_job for MODULE_D_PROMPT_LIST.
    """
    mongo_manager.connect()
    query = {"project_id": project_id}
    if status_filter:
        query["status"] = status_filter
    prompts = list(mongo_manager.db.prompt_jobs.find(query, {"embedding": 0}).limit(limit))
    for p in prompts:
        p["_id"] = str(p["_id"])
    return {"success": True, "project_id": project_id, "count": len(prompts), "prompts": prompts}


async def run_get_citations(prompt_job_id: str, project_id: str) -> Dict[str, Any]:
    """
    SOP-002 §8.1 GET /api/v1/prompts/{id}/citations
    Called by execute_module_d_job for MODULE_D_CITATIONS.
    """
    import bson
    mongo_manager.connect()
    db = mongo_manager.db

    try:
        pj = db.prompt_jobs.find_one({"_id": bson.ObjectId(prompt_job_id)})
    except Exception:
        pj = db.prompt_jobs.find_one({"project_id": project_id, "prompt_text": prompt_job_id})

    if not pj:
        return {"success": False, "error": "Prompt job not found"}

    prompt_text = pj.get("prompt_text", "")
    events = list(db.citation_events.find({"job_id": project_id}))

    # Per-model aggregation
    citation_summary = {}
    for model in ["gpt-4o", "gemini-1.5-pro", "claude-sonnet-4-5"]:
        me = [e for e in events if e.get("model_version") == model]
        ce = [e for e in me if e.get("is_customer_citation")]
        cope = [e for e in me if e.get("is_competitor_citation")]
        total = len(me)
        cr  = round(len(ce) / max(total, 1), 4) if total else 0.0
        sov_d = len(ce) + len(cope)
        sov = round(len(ce) / max(sov_d, 1), 4) if sov_d else 0.0
        pos = [e.get("position_rank", 10) for e in ce if e.get("position_rank")]
        avg_pos = round(sum(pos) / len(pos), 2) if pos else 10.0
        citation_summary[model] = {"citation_rate": cr, "avg_position": avg_pos, "share_of_voice": sov}

    # Competitor mentions
    comp_counts: Dict[str, int] = {}
    for e in events:
        if e.get("is_competitor_citation") and e.get("competitor_domain"):
            d = e["competitor_domain"]
            comp_counts[d] = comp_counts.get(d, 0) + 1
    competitor_mentions = [{"domain": d, "mention_count": c} for d, c in sorted(comp_counts.items(), key=lambda x: -x[1])]

    return {
        "success":             True,
        "prompt_id":           prompt_job_id,
        "prompt_text":         prompt_text,
        "total_executions":    db.citation_responses.count_documents({"job_id": project_id}),
        "citation_summary":    citation_summary,
        "competitor_mentions": competitor_mentions,
    }


async def run_get_performance(prompt_job_id: str, days: int = 30) -> Dict[str, Any]:
    """
    SOP-002 §8.1 GET /api/v1/prompts/{id}/performance
    Called by execute_module_d_job for MODULE_D_PERFORMANCE.
    """
    mongo_manager.connect()
    since = datetime.utcnow() - timedelta(days=days)
    snaps = list(
        mongo_manager.db.prompt_performance_snapshots.find(
            {"prompt_job_id": prompt_job_id, "snapshot_date": {"$gte": since.date().isoformat()}},
            sort=[("snapshot_date", 1)],
        )
    )
    for s in snaps:
        s["_id"] = str(s["_id"])
    return {"success": True, "prompt_job_id": prompt_job_id, "days": days,
            "snapshot_count": len(snaps), "snapshots": snaps}


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §8.1 — MANUAL RUN (trigger single prompt re-execution)
# ─────────────────────────────────────────────────────────────────────────────

async def run_manual_prompt_run(prompt_job_id: str, project_id: str) -> Dict[str, Any]:
    """
    SOP-002 §8.1 POST /api/v1/prompts/{id}/run — override schedule.
    Called by execute_module_d_job for MODULE_D_MANUAL_RUN.
    """
    import bson
    mongo_manager.connect()
    db = mongo_manager.db

    try:
        pj = db.prompt_jobs.find_one({"_id": bson.ObjectId(prompt_job_id)})
    except Exception:
        pj = db.prompt_jobs.find_one({"project_id": project_id, "prompt_text": prompt_job_id})

    if not pj:
        return {"success": False, "error": "Prompt job not found"}

    # Mark as running
    db.prompt_jobs.update_one(
        {"_id": pj["_id"]},
        {"$set": {"status": "running", "run_triggered_at": datetime.utcnow()}},
    )

    prompt_text = pj.get("prompt_text", "")
    from . import llm_runner, citation_parser

    try:
        from urllib.parse import urlparse
        customer_domain = urlparse(project_id).netloc.lstrip("www.").lower() if "://" in project_id else ""
        brand_name = customer_domain.split(".")[0].capitalize() if customer_domain else ""

        llm_output = llm_runner.run_llm_queries(
            job_id=project_id,
            prompts=[prompt_text],
            customer_domain=customer_domain,
            brand_name=brand_name,
        )
        citation_parser.parse_and_store_citations(llm_output)

        db.prompt_jobs.update_one(
            {"_id": pj["_id"]},
            {"$set": {"status": "complete", "last_run_at": datetime.utcnow()}},
        )
        return {"success": True, "prompt_job_id": prompt_job_id, "status": "complete",
                "message": "Manual run completed"}
    except Exception as exc:
        db.prompt_jobs.update_one(
            {"_id": pj["_id"]},
            {"$set": {"status": "failed", "last_error": str(exc)}},
        )
        return {"success": False, "error": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §5.1 Step 10 + Moat #4 §8.1 — FEEDBACK CAPTURE
# ─────────────────────────────────────────────────────────────────────────────

async def mark_recommendation_feedback(
    job_id: str,
    recommendation_id: str,
    feedback: str,
    post_action_pvs: Optional[float] = None,
    notes: str = "",
) -> Dict[str, Any]:
    """
    SOP-002 §5.1 Step 10 — Records completed/dismissed/ignored.
    Instruments RAR, SLAR, RDR for investor KPIs (Moat #4 §8.1).
    Called by execute_module_d_job for MODULE_D_FEEDBACK.
    """
    if feedback not in ("completed", "dismissed", "ignored"):
        return {"success": False, "error": "feedback must be one of: completed, dismissed, ignored"}

    now = datetime.utcnow()
    try:
        mongo_manager.connect()

        mongo_manager.db.recommendation_feedback.insert_one({
            "job_id":            job_id,
            "recommendation_id": recommendation_id,
            "feedback":          feedback,
            "post_action_pvs":   post_action_pvs,
            "notes":             notes,
            "recorded_at":       now,
        })

        mongo_manager.db.recommendations.update_one(
            {"jobId": job_id, "recommendations.recommendation_id": recommendation_id},
            {"$set": {
                "recommendations.$.status":          feedback,
                "recommendations.$.actioned_at":     now,
                "recommendations.$.post_action_pvs": post_action_pvs,
            }},
        )

        total   = mongo_manager.db.recommendation_feedback.count_documents({"job_id": job_id})
        done    = mongo_manager.db.recommendation_feedback.count_documents({"job_id": job_id, "feedback": "completed"})
        lifted  = mongo_manager.db.recommendation_feedback.count_documents({"job_id": job_id, "feedback": "completed", "post_action_pvs": {"$gt": 0}})

        rar  = round(done / total, 4)  if total else 0.0
        slar = round(lifted / done, 4) if done  else 0.0

        mongo_manager.db.platform_kpis.update_one(
            {"job_id": job_id, "kpi_type": "recommendation_rates"},
            {"$set": {"rar": rar, "slar": slar, "total_delivered": total,
                      "total_completed": done, "updated_at": now},
             "$setOnInsert": {"created_at": now}},
            upsert=True,
        )

        return {"success": True, "feedback": feedback,
                "recommendation_id": recommendation_id, "rar": rar, "slar": slar}

    except Exception as exc:
        logger.error("Feedback capture failed for %s: %s", recommendation_id, exc)
        return {"success": False, "error": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §8.1 — ADMIN HEALTH
# ─────────────────────────────────────────────────────────────────────────────

async def run_admin_health(job_id: str = "") -> Dict[str, Any]:
    """
    SOP-002 §8.1 + §9.3 acceptance criteria — pipeline health snapshot.
    Called by execute_module_d_job for MODULE_D_HEALTH.
    Returns queue depth, error rates, model costs, rate limit hits.
    """
    from .prompt_library import get_library_stats

    mongo_manager.connect()
    db  = mongo_manager.db
    now = datetime.utcnow()
    h24 = now - timedelta(hours=24)

    queue_depth = {
        "pending":  db.prompt_jobs.count_documents({"status": "pending"}),
        "running":  db.prompt_jobs.count_documents({"status": "running"}),
        "complete": db.prompt_jobs.count_documents({"status": "complete"}),
        "failed":   db.prompt_jobs.count_documents({"status": "failed"}),
    }

    total_24h = db.citation_responses.count_documents({"response_timestamp": {"$gte": h24}})
    empty_24h = db.citation_responses.count_documents({"response_timestamp": {"$gte": h24}, "cited_urls": {"$size": 0}})
    error_rate = round((empty_24h / max(total_24h, 1)) * 100, 2)

    pipeline = [
        {"$match": {"response_timestamp": {"$gte": h24}}},
        {"$group": {"_id": "$model_version", "cost": {"$sum": "$estimated_cost_usd"}, "count": {"$sum": 1}}},
    ]
    cost_by_model = {
        doc["_id"]: {"cost_usd": round(doc["cost"], 6), "executions": doc["count"]}
        for doc in db.citation_responses.aggregate(pipeline) if doc.get("_id")
    }

    rate_limit_hits = {}
    try:
        import redis
        from utils.config import config
        r = redis.from_url(config.REDIS_URL, decode_responses=True)
        for m in ["gpt-4o", "gemini-1.5-pro", "claude-sonnet-4-5"]:
            val = r.get(f"rate_limit:{m}:hits")
            rate_limit_hits[m] = int(val) if val else 0
    except Exception:
        rate_limit_hits = {"error": "Redis unavailable"}

    dedup_alerts = db.prompt_dedup_alerts.count_documents({"status": "unresolved"})

    return {
        "success":            True,
        "timestamp":          now.isoformat() + "Z",
        "queue_depth":        queue_depth,
        "error_rate_24h_pct": error_rate,
        "executions_24h":     total_24h,
        "cost_by_model_24h":  cost_by_model,
        "rate_limit_hits":    rate_limit_hits,
        "prompt_library":     get_library_stats(),
        "dedup_alerts_unresolved": dedup_alerts,
        "pipeline_healthy":   error_rate < 5.0 and queue_depth.get("failed", 0) < 10,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Core pipeline steps — reusable by full pipeline and standalone callers
# ─────────────────────────────────────────────────────────────────────────────

async def run_content_metrics(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """SOP-002 §5.1 Step 2 — AEO content analysis via Claude."""
    if not html_content:
        html_content = load_raw_html_sync(job_id)
    if not html_content:
        return {"error": "HTML content missing", "step": "content_metrics"}
    ai_service = ClaudeService()
    result = ai_service.analyze_content_metrics(html_content, url)
    try:
        mongo_manager.connect()
        mongo_manager.content_metrics.update_one(
            {"jobId": job_id, "url": url},
            {"$set": {"content_metrics": result, "updatedAt": datetime.utcnow()}},
            upsert=True,
        )
    except Exception as e:
        logger.error("Failed to store content metrics: %s", e)
    return result


async def run_entity_analysis(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """SOP-002 §5.1 Step 1 — KnowledgeBase NER entity extraction."""
    if not html_content:
        html_content = load_raw_html_sync(job_id)
    if not html_content:
        return {"error": "HTML content missing", "step": "entity_analysis"}
    kb_module = KnowledgeBaseModule()
    result = await kb_module.run_analysis(html_content, url)
    try:
        mongo_manager.connect()
        mongo_manager.content_metrics.update_one(
            {"jobId": job_id, "url": url},
            {"$set": {"knowledge_base": result, "updatedAt": datetime.utcnow()}},
            upsert=True,
        )
    except Exception as e:
        logger.error("Failed to store entity analysis: %s", e)
    return result


async def run_prompt_tracking(job_id: str, url: str, prompts: list) -> Dict[str, Any]:
    """SOP-002 §5.1 Step 4 — Prompt tracking with real LLM data or TF-IDF fallback."""
    mongo_manager.connect()

    resolve_url = (url or "").strip()
    if not resolve_url:
        try:
            me_doc = mongo_manager.module_e.find_one({"jobId": job_id}) or {}
            resolve_url = (
                str(me_doc.get("website_url") or me_doc.get("url") or me_doc.get("startUrl") or "")
            ).strip()
        except Exception:
            resolve_url = ""

    cleaned_prompts = [p.strip() for p in (prompts or []) if isinstance(p, str) and p.strip()]

    # Same as full Module D step 4: run models → citation_events → prompt_jobs aggregates.
    # Without this, calculate_prompt_tracking_metrics only sees zeros / position-only PVS (~3.5).
    if cleaned_prompts:
        from . import llm_runner, citation_parser
        from urllib.parse import urlparse
        try:
            customer_domain = (
                urlparse(resolve_url).netloc.lstrip("www.").lower() if resolve_url else ""
            )
            brand_name = customer_domain.split(".")[0].capitalize() if customer_domain else ""

            competitor_domains: List[str] = []
            try:
                me_doc = mongo_manager.module_e.find_one({"jobId": job_id}) or {}
                competitor_domains = [
                    str(c.get("domain", "")).strip()
                    for c in (me_doc.get("competitors") or [])
                    if c.get("domain")
                ]
            except Exception:
                pass

            llm_output = llm_runner.run_llm_queries(
                job_id=job_id,
                prompts=cleaned_prompts,
                customer_domain=customer_domain,
                brand_name=brand_name,
                competitor_domains=competitor_domains,
                page_url=resolve_url or url or "",
            )
            citation_parser.parse_and_store_citations(llm_output)
        except Exception as exc:
            logger.error("Prompt tracking LLM/citation step failed: %s", exc, exc_info=True)

    ai_service = ClaudeService()
    result = ai_service.calculate_prompt_tracking_metrics(
        job_id=job_id, url=resolve_url or url or "", prompts=prompts or []
    )
    return {
        "success":         True,
        "prompt_tracking": result,
        "metrics":         result.get("metrics") or [],
    }


async def run_recommendations(
    job_id: str,
    url: str,
    prompt_metrics: list,
    account_context: Optional[Dict] = None,
    user_role: str = "SEO Manager",
    plan_tier: str = "pro",
) -> Dict[str, Any]:
    """Moat #4 Steps 4–8 — IEU-ranked recommendation cards."""
    enriched = _derive_account_context_from_db(job_id, account_context)
    ai_service = ClaudeService()
    result = ai_service.generate_prompt_recommendations(
        job_id=job_id, url=url, prompt_metrics=prompt_metrics,
        account_context=enriched, user_role=user_role, plan_tier=plan_tier,
    )
    if prompt_metrics:
        try:
            _record_investor_kpis(job_id, prompt_metrics)
        except Exception as exc:
            logger.warning("Standalone KPI record failed: %s", exc)
    return {"success": True, "recommendation_engine": result}


# ─────────────────────────────────────────────────────────────────────────────
# Full Module D pipeline — SOP-002 §5.1 Steps 1–10
# ─────────────────────────────────────────────────────────────────────────────

async def run_module_d(
    job_id: str,
    url: str,
    html_content: str = None,
    prompts: list = None,
    account_context: Optional[Dict] = None,
    user_role: str = "SEO Manager",
    plan_tier: str = "pro",
) -> Dict[str, Any]:
    """
    Full Module D — SOP-002 §5.1 Steps 1–10.
    Steps 1+2 parallel, Steps 3–10 sequential.
    """
    if not html_content:
        html_content = load_raw_html_sync(job_id)
    if not html_content:
        return {"success": False, "error": "HTML content missing", "step_status": {"html_load": "error"}}

    step_status: Dict[str, str] = {}

    # ── Steps 1+2: parallel ───────────────────────────────────────────────
    try:
        kb_task      = asyncio.create_task(run_entity_analysis(job_id, url, html_content))
        metrics_task = asyncio.create_task(run_content_metrics(job_id, url, html_content))
        kb_result, metrics_result = await asyncio.gather(kb_task, metrics_task, return_exceptions=True)
        step_status["step_1_entity"]          = "error" if isinstance(kb_result, Exception)      else "ok"
        step_status["step_2_content_metrics"] = "error" if isinstance(metrics_result, Exception) else "ok"
        if isinstance(kb_result,      Exception): kb_result      = {"error": str(kb_result)}
        if isinstance(metrics_result, Exception): metrics_result = {"error": str(metrics_result)}
    except Exception as exc:
        kb_result = metrics_result = {"error": str(exc)}
        step_status["step_1_entity"] = step_status["step_2_content_metrics"] = "error"

    # ── Step 3: entity relevance ──────────────────────────────────────────
    ai_service = ClaudeService()
    try:
        ec  = (kb_result.get("entity_coverage") or {}) if isinstance(kb_result, dict) else {}
        fe  = ec.get("found_entities")    or []
        ee  = ec.get("expected_entities") or []
        er  = ai_service.analyze_entity_relevance(html_content, url, fe, ee)
        step_status["step_3_entity_relevance"] = "ok"
    except Exception as exc:
        er = {"entity_relevance_score": 50, "error": str(exc)}
        ec, fe = {}, []
        step_status["step_3_entity_relevance"] = "error"

    # ── Step 4: LLM runner + citation parser ─────────────────────────────
    from . import llm_runner, citation_parser
    from .prompt_library import get_prompts_for_job, mark_prompt_run, seed_prompt_library
    from urllib.parse import urlparse

    seed_prompt_library()
    try:
        customer_domain = urlparse(url).netloc.lstrip("www.").lower() if url else ""
        brand_name = customer_domain.split(".")[0].capitalize() if customer_domain else ""

        competitor_domains = []
        try:
            me_doc = mongo_manager.module_e.find_one({"jobId": job_id}) or {}
            competitor_domains = [c.get("domain","") for c in (me_doc.get("competitors") or []) if c.get("domain")]
        except Exception:
            pass

        effective_prompts = prompts or get_prompts_for_job(
            brand_name=brand_name, plan_tier=plan_tier, competitor_domains=competitor_domains,
        )

        llm_output = llm_runner.run_llm_queries(
            job_id=job_id, prompts=effective_prompts,
            customer_domain=customer_domain, brand_name=brand_name,
            competitor_domains=competitor_domains, page_url=url,
        )
        for p in effective_prompts:
            try: mark_prompt_run(p)
            except Exception: pass

        citation_parser.parse_and_store_citations(llm_output)
        step_status["step_4_llm_and_citation"] = "ok"
    except Exception as exc:
        logger.error("Step 4 LLM+Citation failed: %s", exc)
        step_status["step_4_llm_and_citation"] = "error"

    # ── Step 4a: prompt tracking metrics ─────────────────────────────────
    try:
        tracking_result = ai_service.calculate_prompt_tracking_metrics(
            job_id=job_id, url=url, prompts=prompts or []
        )
        prompt_metrics = tracking_result.get("metrics") or []
        step_status["step_4a_prompt_tracking"] = "ok"
    except Exception as exc:
        tracking_result = {"error": str(exc)}
        prompt_metrics  = []
        step_status["step_4a_prompt_tracking"] = "error"

    # ── Step 5: delta classification ──────────────────────────────────────
    try:
        enriched_context = _derive_account_context_from_db(job_id, account_context)
        step_status["step_5_delta"] = "ok"
    except Exception as exc:
        enriched_context = account_context or {}
        step_status["step_5_delta"] = "error"

    # ── Steps 6–8: IEU recommendations ───────────────────────────────────
    try:
        recs_result = ai_service.generate_prompt_recommendations(
            job_id=job_id, url=url, prompt_metrics=prompt_metrics,
            account_context=enriched_context, user_role=user_role, plan_tier=plan_tier,
        )
        step_status["step_6_8_recommendations"] = "ok"
    except Exception as exc:
        recs_result = {"recommendations": [], "summary": {}, "error": str(exc)}
        step_status["step_6_8_recommendations"] = "error"

    # ── Step 9: delivery hooks ─────────────────────────────────────────────
    try:
        delivery_log = await _deliver_recommendations(
            job_id, url,
            recs_result.get("recommendations") or [],
            recs_result.get("summary") or {},
        )
        step_status["step_9_delivery"] = "ok"
    except Exception as exc:
        delivery_log = {"error": str(exc)}
        step_status["step_9_delivery"] = "error"

    step_status["step_10_feedback"] = "endpoint_available_via_MODULE_D_FEEDBACK"

    # ── Difficulty update after full run ──────────────────────────────────
    try:
        from .difficulty_scorer import batch_update_difficulties
        batch_update_difficulties(job_id)
    except Exception:
        pass

    # ── Data quality summary ──────────────────────────────────────────────
    real_count = sum(1 for m in prompt_metrics if m.get("calculation_method") == "real_citation_data")
    data_quality = {
        "prompts_from_real_citation_data": real_count,
        "prompts_from_estimation":         len(prompt_metrics) - real_count,
        "sop002_pipeline_active":          real_count > 0,
        "difficulty_distribution":         {m.get("difficulty_label","?"): 1 for m in prompt_metrics},
        "pvs_formula_versions_used":       list({m.get("pvs_formula_version") for m in prompt_metrics if m.get("pvs_formula_version")}),
    }

    result = {
        "success":         True,
        "content_metrics": metrics_result if isinstance(metrics_result, dict) else {},
        "entity_metrics": {
            "entities_detected_count": len(fe),
            "entity_coverage_score":   ec.get("coverage_score", 0),
            "entity_relevance_score":  er.get("entity_relevance_score", 50),
            "relevant_entities":       er.get("relevant_entities", []),
            "irrelevant_entities":     er.get("irrelevant_entities", []),
        },
        "knowledge_base":  kb_result if isinstance(kb_result, dict) else {},
        "prompt_tracking": tracking_result,
        "recommendations": recs_result,
        "delivery_log":    delivery_log,
        "data_quality":    data_quality,
        "step_status":     step_status,
        "account_context_used": {
            k: v for k, v in enriched_context.items()
            if k in ("citation_score_drop_pct","aivs_dropped_7d","aivs_drop_pts",
                     "competitor_gained_pts","days_since_last_action",
                     "total_tracked_prompts","days_since_crawl")
        },
    }

    try:
        mongo_manager.connect()
        mongo_manager.content_metrics.update_one(
            {"jobId": job_id, "url": url},
            {"$set": {"jobId": job_id, "url": url, "createdAt": datetime.utcnow(),
                      **{k: v for k, v in result.items() if k != "step_status"}}},
            upsert=True,
        )
    except Exception as e:
        logger.error("Failed to store Module D result: %s", e)

    return result
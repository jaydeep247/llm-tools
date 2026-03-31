"""
workers/executors/module_d.py — Module D job dispatcher

All Module D operations are routed here from the queue worker.
NO separate HTTP routes — everything is handled by runner.py functions.

Job types handled:
  MODULE_D                  Full 10-step pipeline
  MODULE_D_CONTENT_METRICS  Content + entity metrics only
  MODULE_D_ENTITY_ANALYSIS  Entity analysis only
  MODULE_D_PROMPT_TRACKING  Prompt tracking (real LLM + TF-IDF fallback)
  MODULE_D_PROMPT_INGEST    Ingest + validate + dedup + store prompts
  MODULE_D_PROMPT_EXPAND    Expand seed keywords into 5-cluster variants
  MODULE_D_DIFFICULTY       Recompute difficulty scores for all prompts
  MODULE_D_PROMPT_LIST      Return all prompts for a project
  MODULE_D_CITATIONS        Return citation records for a prompt
  MODULE_D_PERFORMANCE      Return historical performance snapshots
  MODULE_D_MANUAL_RUN       Trigger immediate re-execution of one prompt
  MODULE_D_FEEDBACK         Record recommendation feedback (RAR/SLAR/RDR)
  MODULE_D_HEALTH           Admin pipeline health summary

Payload fields used per job type — see each handler block below.
All results are persisted to MongoDB by the runner functions.
"""

import asyncio
from utils.logger import configure_logger, logger
from utils.mongo import mongo_manager


# ─────────────────────────────────────────────────────────────────────────────
# Prompt normalisation helpers (shared across ingest + tracking)
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_prompts(raw) -> list:
    seen, out = set(), []
    for p in (raw or []):
        if not isinstance(p, str):
            continue
        v = p.strip()
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out


def _normalize_intent(intent: str) -> str:
    raw = (intent or "").strip().lower()
    if raw in ("agent-style", "agent_style"):
        return "agent"
    allowed = {"informational", "commercial", "comparative", "transactional", "agent"}
    return raw if raw in allowed else "informational"


def _load_onboarding_prompts_with_intent(job_id: str) -> list:
    """
    Load onboarding prompts from module_e and preserve onboarding intent tags.
    Priority:
      1) brand_prompts_selected (user-selected)
      2) brand_prompts_generated (AI-generated with prompt/type)
    """
    if not job_id:
        return []
    try:
        mongo_manager.connect()
        doc = mongo_manager.module_e.find_one({"jobId": job_id}) or {}
        generated = doc.get("brand_prompts_generated") or []
        selected = doc.get("brand_prompts_selected") or []

        generated_map = {}
        normalized_rows = []
        for row in generated:
            if not isinstance(row, dict):
                continue
            prompt = str(row.get("prompt", "")).strip()
            if not prompt:
                continue
            intent = _normalize_intent(str(row.get("type") or "informational"))
            generated_map[prompt] = intent
            normalized_rows.append({"prompt": prompt, "intent": intent, "source": "onboarding_generated"})

        if selected:
            selected_rows = []
            seen = set()
            for p in selected:
                prompt = str(p).strip()
                if not prompt or prompt in seen:
                    continue
                seen.add(prompt)
                selected_rows.append({
                    "prompt": prompt,
                    "intent": generated_map.get(prompt, "informational"),
                    "source": "onboarding_selected",
                })
            if selected_rows:
                return selected_rows

        return normalized_rows
    except Exception as exc:
        logger.warning("[MODULE_D] Could not load onboarding prompts for %s: %s", job_id, exc)
        return []


def _build_prompt_set(payload: dict, target_job_id: str) -> tuple:
    """
    Build final prompt list from explicit prompts + optional seed expansion.
    Returns (final_prompts: list, intelligence_meta: dict).

    Applies:
      - SOP-002 §3.2 length validation (10–500 chars)
      - SOP-002 §3.3 exact + near-duplicate deduplication
      - SOP-002 §4    seed keyword expansion into 5 intent clusters
    """
    explicit_manual = _normalize_prompts(
        payload.get("trackedPrompts")
        or payload.get("prompts")
        or payload.get("config", {}).get("trackedPrompts")
        or []
    )
    seeds = _normalize_prompts(
        payload.get("seedKeywords")
        or payload.get("config", {}).get("seedKeywords")
        or []
    )
    expand = bool(
        payload.get("expandFromKeywords")
        or payload.get("config", {}).get("expandFromKeywords")
    )
    project_id = payload.get("projectId") or payload.get("sessionId") or "default_project"

    onboarding_rows = _load_onboarding_prompts_with_intent(target_job_id)
    onboarding_prompts = [r["prompt"] for r in onboarding_rows]
    onboarding_intent_by_prompt = {r["prompt"]: r["intent"] for r in onboarding_rows}

    # Onboarding-first strategy:
    # always start from onboarding prompts if available, then add manual prompts.
    # Seed expansion becomes fallback only when onboarding is missing.
    explicit = _normalize_prompts(onboarding_prompts + explicit_manual)

    expanded_count = 0
    intent_counts  = {c: 0 for c in ("informational","commercial","comparative","transactional","agent")}

    used_source = "onboarding" if onboarding_prompts else "seed_fallback"
    if not onboarding_prompts and expand and seeds:
        from modules.module_D.prompt_expander import expand_seed_prompts_batch
        rows = expand_seed_prompts_batch(
            seed_prompts=seeds,
            job_id=str(payload.get("jobId") or ""),
            project_id=str(project_id),
        )
        for row in rows:
            for cluster, variants in ((row or {}).get("clusters") or {}).items():
                if cluster in intent_counts:
                    intent_counts[cluster] += len(variants)
                    explicit.extend(variants)
        expanded_count = len(rows)
    elif onboarding_prompts:
        for prompt in explicit:
            intent = onboarding_intent_by_prompt.get(prompt, "informational")
            intent_counts[intent] = intent_counts.get(intent, 0) + 1

    from modules.module_D.prompt_dedup import check_duplicate

    final, d_exact, d_near, d_short, d_long = [], 0, 0, 0, 0

    for p in _normalize_prompts(explicit):
        if len(p) < 10:
            d_short += 1
            continue
        if len(p) > 500:
            d_long += 1
            continue
        dedup = check_duplicate(p, str(project_id))
        if dedup.get("action") == "reject":
            d_exact += 1
            continue
        if dedup.get("action") == "flag":
            d_near += 1
            # Near-duplicate still included — flagged for admin dashboard
        final.append(p)

    meta = {
        "prompt_source_mode":             used_source,
        "onboarding_prompts_count":       len(onboarding_prompts),
        "manual_prompts_count":           len(explicit_manual),
        "expanded_from_seed_keywords":   expanded_count,
        "seed_keywords_count":           len(seeds),
        "intent_cluster_distribution":   intent_counts,
        "dedup_summary": {
            "dropped_exact_duplicates": d_exact,
            "dropped_near_duplicates":  d_near,
            "dropped_too_short":        d_short,
            "dropped_too_long":         d_long,
        },
        "total_prompts_final": len(final),
    }
    return final, meta


# ─────────────────────────────────────────────────────────────────────────────
# Main dispatcher
# ─────────────────────────────────────────────────────────────────────────────

def execute_module_d_job(payload: dict) -> bool:
    """
    Single entry point for all Module D job types.
    Imported by workers/registry.py and called by the queue worker.
    """
    from modules.module_D.runner import (
        run_module_d,
        run_content_metrics,
        run_entity_analysis,
        run_prompt_tracking,
        run_prompt_ingest,
        run_prompt_expand,
        run_difficulty_update,
        run_prompt_list,
        run_get_citations,
        run_get_performance,
        run_manual_prompt_run,
        mark_recommendation_feedback,
        run_admin_health,
    )

    configure_logger()

    session_id    = payload.get("sessionId", "")
    url           = payload.get("url", "")
    job_id        = payload.get("jobId") or f"job_{session_id}"
    job_type      = payload.get("jobType", "MODULE_D").upper()
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    target_job_id = source_job_id if source_job_id else job_id
    project_id    = payload.get("projectId") or payload.get("config", {}).get("projectId") or target_job_id

    logger.info("[MODULE_D] ▶  %s | job=%s | url=%s", job_type, job_id, (url or "")[:60])

    try:
        result = _dispatch(
            job_type=job_type,
            payload=payload,
            target_job_id=target_job_id,
            project_id=project_id,
            url=url,
            run_module_d=run_module_d,
            run_content_metrics=run_content_metrics,
            run_entity_analysis=run_entity_analysis,
            run_prompt_tracking=run_prompt_tracking,
            run_prompt_ingest=run_prompt_ingest,
            run_prompt_expand=run_prompt_expand,
            run_difficulty_update=run_difficulty_update,
            run_prompt_list=run_prompt_list,
            run_get_citations=run_get_citations,
            run_get_performance=run_get_performance,
            run_manual_prompt_run=run_manual_prompt_run,
            mark_recommendation_feedback=mark_recommendation_feedback,
            run_admin_health=run_admin_health,
        )

        if isinstance(result, dict) and not result.get("success", True):
            err = result.get("error", "")
            logger.error("[MODULE_D] ⚠  returned error: %s", err)
            if "HTML" in err:
                raise RuntimeError(f"HTML not found for job {target_job_id}. sourceJobId required.")

        logger.info("[MODULE_D] ✅ %s completed | job=%s", job_type, job_id)
        return True

    except Exception as exc:
        logger.error("[MODULE_D] ❌ %s failed: %s", job_type, exc, exc_info=True)
        raise


def _dispatch(job_type, payload, target_job_id, project_id, url, **fns):
    """Route job_type to the correct runner function."""

    # ── Full pipeline ─────────────────────────────────────────────────────
    if job_type == "MODULE_D":
        prompts, meta = _build_prompt_set(payload, target_job_id)
        logger.info(
            "[MODULE_D] prompt_intelligence | source_mode=%s | onboarding_prompts_count=%s | intent_cluster_distribution=%s | total_prompts_final=%s",
            meta.get("prompt_source_mode"),
            meta.get("onboarding_prompts_count"),
            meta.get("intent_cluster_distribution"),
            meta.get("total_prompts_final"),
        )
        result = asyncio.run(fns["run_module_d"](
            job_id=target_job_id, url=url, prompts=prompts,
            account_context=payload.get("accountContext"),
            user_role=payload.get("userRole", "SEO Manager"),
            plan_tier=payload.get("planTier", "pro"),
        ))
        if isinstance(result, dict):
            result["prompt_intelligence"] = meta
        return result

    # ── Content metrics only ─────────────────────────────────────────────
    if job_type in ("MODULE_D_CONTENT_METRICS", "CONTENT_METRICS"):
        return asyncio.run(fns["run_content_metrics"](target_job_id, url))

    # ── Entity analysis only ─────────────────────────────────────────────
    if job_type == "MODULE_D_ENTITY_ANALYSIS":
        return asyncio.run(fns["run_entity_analysis"](target_job_id, url))

    # ── Prompt tracking (LLM execution + TF-IDF fallback) ────────────────
    if job_type == "MODULE_D_PROMPT_TRACKING":
        prompts, meta = _build_prompt_set(payload, target_job_id)
        logger.info(
            "[MODULE_D] prompt_intelligence | source_mode=%s | onboarding_prompts_count=%s | intent_cluster_distribution=%s | total_prompts_final=%s",
            meta.get("prompt_source_mode"),
            meta.get("onboarding_prompts_count"),
            meta.get("intent_cluster_distribution"),
            meta.get("total_prompts_final"),
        )
        result = asyncio.run(fns["run_prompt_tracking"](target_job_id, url, prompts))
        if isinstance(result, dict):
            result["prompt_intelligence"] = meta
        return result

    # ── Prompt ingest — validate + dedup + store ─────────────────────────
    # Payload: { projectId, prompts: [...], intentCluster?, targetModels? }
    if job_type == "MODULE_D_PROMPT_INGEST":
        raw_prompts = _normalize_prompts(
            payload.get("prompts") or payload.get("trackedPrompts") or []
        )
        return asyncio.run(fns["run_prompt_ingest"](
            project_id=project_id,
            prompts=raw_prompts,
            intent_cluster=payload.get("intentCluster"),
            target_models=payload.get("targetModels"),
        ))

    # ── Prompt expansion — seed keywords → 5-cluster variants ────────────
    # Payload: { projectId, seedKeywords: [...] }
    if job_type == "MODULE_D_PROMPT_EXPAND":
        seeds = _normalize_prompts(
            payload.get("seedKeywords") or payload.get("config", {}).get("seedKeywords") or []
        )
        return asyncio.run(fns["run_prompt_expand"](
            job_id=target_job_id,
            project_id=project_id,
            seed_keywords=seeds,
        ))

    # ── Difficulty score recompute ────────────────────────────────────────
    # Payload: { jobId }
    if job_type == "MODULE_D_DIFFICULTY":
        return asyncio.run(fns["run_difficulty_update"](target_job_id))

    # ── List prompts for a project ────────────────────────────────────────
    # Payload: { projectId, statusFilter?, limit? }
    if job_type == "MODULE_D_PROMPT_LIST":
        return asyncio.run(fns["run_prompt_list"](
            project_id=project_id,
            status_filter=payload.get("statusFilter"),
            limit=int(payload.get("limit", 100)),
        ))

    # ── Get citations for a prompt ────────────────────────────────────────
    # Payload: { promptJobId, projectId }
    if job_type == "MODULE_D_CITATIONS":
        return asyncio.run(fns["run_get_citations"](
            prompt_job_id=payload.get("promptJobId") or target_job_id,
            project_id=project_id,
        ))

    # ── Get performance snapshots ─────────────────────────────────────────
    # Payload: { promptJobId, days? }
    if job_type == "MODULE_D_PERFORMANCE":
        return asyncio.run(fns["run_get_performance"](
            prompt_job_id=payload.get("promptJobId") or target_job_id,
            days=int(payload.get("days", 30)),
        ))

    # ── Manual re-run for a single prompt ─────────────────────────────────
    # Payload: { promptJobId, projectId }
    if job_type == "MODULE_D_MANUAL_RUN":
        return asyncio.run(fns["run_manual_prompt_run"](
            prompt_job_id=payload.get("promptJobId") or target_job_id,
            project_id=project_id,
        ))

    # ── Recommendation feedback ───────────────────────────────────────────
    # Payload: { jobId, recommendationId, feedback, postActionPvs?, notes? }
    if job_type == "MODULE_D_FEEDBACK":
        return asyncio.run(fns["mark_recommendation_feedback"](
            job_id=target_job_id,
            recommendation_id=payload.get("recommendationId", ""),
            feedback=payload.get("feedback", ""),
            post_action_pvs=payload.get("postActionPvs"),
            notes=payload.get("notes", ""),
        ))

    # ── Admin health ──────────────────────────────────────────────────────
    if job_type == "MODULE_D_HEALTH":
        return asyncio.run(fns["run_admin_health"](target_job_id))

    # ── Default: full pipeline ────────────────────────────────────────────
    logger.warning("[MODULE_D] Unknown job type '%s' — running full pipeline", job_type)
    return asyncio.run(fns["run_module_d"](job_id=target_job_id, url=url))
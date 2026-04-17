# runner.py
#
# ── AIVS™ D7 Integration (Step 10 — new) ─────────────────────────────────────
# Calls run_d7_pipeline() from moat7_aivs_bridge.py after all MOAT 7 steps.
# This is the only runner step that feeds MOAT 3 (AIVS™ Scoring System).
#
# New fields added to result dict:
#   d7_aivs_output  — D7 score, grade, delta, AIVS contribution, param breakdown
#
# New MongoDB collection written each run:
#   cbm_aivs_d7    — one doc per project, upserted (historical via d7_delta)
#
# What callers (MOAT 3 / API / frontend) consume from d7_aivs_output:
#   d7_score             — 0–100 Competitive Citation Gap Score
#   d7_grade             — A+/A/B/C/D/F
#   d7_delta             — change vs previous run (None on first run)
#   d7_delta_direction   — "improved" | "dropped" | "stable" | "first_run"
#   aivs_d7_contribution — d7_score × 0.15 (D7's 15% of total AIVS™)
#   projected_aivs_score — d1_d6 + d7 contribution (if d1_d6 available)
#   param_breakdown      — SOV / gap count / source overlap sub-scores
#   alert_level          — "high" | "medium" | "low" | "none"
# ─────────────────────────────────────────────────────────────────────────────

import logging
import re
from datetime import datetime, date
from typing import Any, Dict, List, Optional

from utils.mongo import mongo_manager

from .competitor_ai_intelligence import CompetitorAIIntelligence

logger = logging.getLogger("module_f_runner")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS — extract data from Module E document
# ─────────────────────────────────────────────────────────────────────────────

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


def _extract_plan_from_project(project_id: str) -> str:
    if not project_id:
        return "agency"
    try:
        proj = mongo_manager.db.projects.find_one(
            {"$or": [{"id": project_id}, {"projectId": project_id}]},
            {"plan": 1, "subscription": 1},
        ) or {}
        plan = (
            proj.get("plan")
            or (proj.get("subscription") or {}).get("plan")
            or "agency"
        )
        return str(plan).strip().lower()
    except Exception:
        return "agency"


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS — read from brand onboarding (single source of truth for competitors)
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_competitors_from_onboarding(
    module_e_job_id: str,
    lookup_id: str,
) -> List[str]:
    """
    Read competitor names from brand_competitive_landscape (Stage 7 output).
    This is the canonical source for competitors — set during brand onboarding.

    Priority:
      1. Query by module_e_job_id (onboarding job linked to the current session)
      2. Query by lookup_id as fallback
    Returns [] if no onboarding landscape is found.
    """
    doc: Optional[Dict[str, Any]] = None
    if module_e_job_id:
        doc = mongo_manager.brand_competitive_landscape.find_one({"job_id": module_e_job_id})
    if not doc and lookup_id and lookup_id != module_e_job_id:
        doc = mongo_manager.brand_competitive_landscape.find_one({"job_id": lookup_id})
    if not doc:
        return []
    landscape = doc.get("competitive_landscape") or []
    return [
        entry["name"]
        for entry in landscape
        if isinstance(entry, dict) and entry.get("name") and not entry.get("is_our_brand")
    ]


def _fetch_brand_name_from_onboarding(
    module_e_job_id: str,
    lookup_id: str,
) -> Optional[str]:
    """
    Read brand_name from brand_profiles (onboarding Stage 2 output).
    Returns None if not found — caller falls back to Module E extraction.
    """
    doc: Optional[Dict[str, Any]] = None
    if module_e_job_id:
        doc = mongo_manager.brand_profiles.find_one(
            {"job_id": module_e_job_id}, {"brand_name": 1}
        )
    if not doc and lookup_id and lookup_id != module_e_job_id:
        doc = mongo_manager.brand_profiles.find_one(
            {"job_id": lookup_id}, {"brand_name": 1}
        )
    if doc:
        name = str(doc.get("brand_name") or "").strip()
        return name or None
    return None


def _fetch_topic_grouped_prompts(
    lookup_id: str,
    session_id: str,
    module_e_job_id: str,
) -> tuple:
    """
    Fetch topic-grouped prompts directly from the brand_prompts collection.

    Priority:
      1. Query by module_e_job_id (exact job match — most reliable)
      2. Query by lookup_id as fallback
      3. Returns empty if nothing found

    Returns:
        topic_groups     — [{topic: str, prompts: [str]}]
        prompt_to_topic  — {prompt_str: topic_str}
        flat_prompts     — [prompt_str] (ordered for analysis, one pass across topics)
    """
    prompt_docs: List[Dict[str, Any]] = []

    # 1. Try exact job_id match (brand onboarding job)
    if module_e_job_id:
        prompt_docs = list(mongo_manager.brand_prompts.find({"job_id": module_e_job_id}))

    # 2. Fallback: try the runner's lookup_id directly
    if not prompt_docs and lookup_id and lookup_id != module_e_job_id:
        prompt_docs = list(mongo_manager.brand_prompts.find({"job_id": lookup_id}))

    if not prompt_docs:
        return [], {}, []

    # Group by topic, preserving insertion order
    topic_map: Dict[str, List[str]] = {}
    for doc in prompt_docs:
        topic_val = str(doc.get("topic") or "").strip()
        prompt_val = str(doc.get("prompt") or "").strip()
        if topic_val and prompt_val:
            topic_map.setdefault(topic_val, [])
            if prompt_val not in topic_map[topic_val]:
                topic_map[topic_val].append(prompt_val)

    if not topic_map:
        return [], {}, []

    topic_groups = [{"topic": t, "prompts": ps} for t, ps in topic_map.items()]
    prompt_to_topic = {p: t for t, ps in topic_map.items() for p in ps}
    # Interleave: take prompts round-robin across topics so each topic gets coverage
    # even when the analysis is capped (e.g. 10 prompts total)
    all_topic_prompts = list(topic_map.values())
    flat_prompts: List[str] = []
    max_per_topic = max(len(ps) for ps in all_topic_prompts)
    for i in range(max_per_topic):
        for ps in all_topic_prompts:
            if i < len(ps):
                flat_prompts.append(ps[i])

    return topic_groups, prompt_to_topic, flat_prompts


def _extract_prompts_from_module_e(
    doc: Dict[str, Any],
    topic: Optional[str] = None,
) -> List[str]:
    """
    SOP §3 — Extract prompts for visibility analysis.
    
    Refined logic:
    1. Collect ALL generated prompts (both brand_prompts_selected AND brand_prompts_generated).
    2. Fallback to ranking_analysis prompts if empty.
    3. Fallback to content_consistency prompts if empty.
    4. Fallback to topic-based defaults if all else fails.
    """
    prompts_set: set = set()

    # 1. Collect from brand_prompts_selected (the ones user chose)
    selected = doc.get("brand_prompts_selected") or []
    for p in selected:
        val = str(p or "").strip()
        if val:
            prompts_set.add(val)

    # 2. Collect from brand_prompts_generated (the ones AI produced during onboarding)
    generated = doc.get("brand_prompts_generated") or []
    if isinstance(generated, list):
        for p in generated:
            if isinstance(p, dict):
                val = str(p.get("prompt") or "").strip()
            else:
                val = str(p or "").strip()
            if val:
                prompts_set.add(val)

    # 3. If still empty, check ranking_analysis
    if not prompts_set:
        ranking = doc.get("ranking_analysis") or doc.get("ranking") or {}
        ranking_prompts = ranking.get("generated_prompts") or []
        for p in ranking_prompts:
            val = str(p or "").strip()
            if val:
                prompts_set.add(val)

    # 4. If still empty, check content_consistency
    if not prompts_set:
        cc = doc.get("content_consistency") or {}
        cc_prompts = cc.get("generated_prompts") or cc.get("prompts") or []
        for p in cc_prompts:
            val = str(p or "").strip()
            if val:
                prompts_set.add(val)

    # Convert back to list
    prompts = list(prompts_set)

    # 5. Final fallback to topic-based defaults
    if not prompts and topic:
        prompts = [
            f"What are the best {topic} solutions?",
            f"Top {topic} providers",
            f"Who leads the market in {topic}?",
            f"Compare {topic} services",
            f"Reviews for {topic} companies",
        ]
    
    return prompts


# ─────────────────────────────────────────────────────────────────────────────
# SOP §2 Step 1 — Read competitor_config from MongoDB
# Provides brand_aliases, display_order, and entity IDs that the extraction
# pipeline needs for fuzzy matching and leaderboard ordering.
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_competitor_config(project_id: str) -> List[Dict[str, Any]]:
    """
    Read active competitor_config entries for a project.
    Returns list of dicts with: id, competitor_name, domain, brand_aliases, display_order.
    """
    if not project_id:
        return []
    try:
        configs = list(
            mongo_manager.db.competitor_config.find(
                {"projectId": project_id, "isActive": {"$ne": False}},
                sort=[("displayOrder", 1)],
            )
        )
        result = []
        for cfg in configs:
            result.append({
                "id": str(cfg.get("id") or cfg.get("_id") or ""),
                "competitor_name": str(
                    cfg.get("competitorName") or cfg.get("competitor_name") or ""
                ),
                "domain": str(cfg.get("domain") or ""),
                "brand_aliases": list(
                    cfg.get("brandAliases") or cfg.get("brand_aliases") or []
                ),
                "display_order": int(cfg.get("displayOrder") or cfg.get("display_order") or 0),
            })
        return result
    except Exception as e:
        logger.warning(f"Could not fetch competitor_config for project {project_id}: {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# SOP §4 — Extract user role from project/session context
# Used to personalize MOAT 4 recommendations (L4 layer)
# ─────────────────────────────────────────────────────────────────────────────

def _extract_role_from_context(project_id: str, session_id: str) -> str:
    """
    Resolve user role from session or project context.
    Falls back to 'seo_manager' if no role is configured.
    """
    try:
        if session_id:
            session_doc = mongo_manager.db.sessions.find_one(
                {"$or": [{"id": session_id}, {"sessionId": session_id}]},
                {"role": 1, "userRole": 1},
            ) or {}
            role = session_doc.get("role") or session_doc.get("userRole")
            if role:
                return str(role).strip().lower().replace(" ", "_")
        if project_id:
            proj = mongo_manager.db.projects.find_one(
                {"$or": [{"id": project_id}, {"projectId": project_id}]},
                {"defaultRole": 1, "role": 1},
            ) or {}
            role = proj.get("defaultRole") or proj.get("role")
            if role:
                return str(role).strip().lower().replace(" ", "_")
    except Exception:
        pass
    return "seo_manager"


# ─────────────────────────────────────────────────────────────────────────────
# SOP §6 — Plan feature flags for API/frontend enforcement
# ─────────────────────────────────────────────────────────────────────────────

PLAN_FEATURE_FLAGS: Dict[str, Dict[str, Any]] = {
    "free": {
        "max_competitors": 0, "leaderboard": False,
        "model_breakdown_view": False, "prompt_level_drilldown": False,
        "competitor_cited_urls": False, "gap_opportunities": False,
        "trend_chart_days": 0, "benchmark_score_alerts": False, "export": False,
    },
    "pro": {
        "max_competitors": 3, "leaderboard": True,
        "model_breakdown_view": False, "prompt_level_drilldown": False,
        "competitor_cited_urls": False, "gap_opportunities": "limited",
        "trend_chart_days": 30, "benchmark_score_alerts": False, "export": False,
    },
    "agency": {
        "max_competitors": 10, "leaderboard": True,
        "model_breakdown_view": True, "prompt_level_drilldown": True,
        "competitor_cited_urls": True, "gap_opportunities": True,
        "trend_chart_days": 90, "benchmark_score_alerts": True, "export": True,
    },
    "enterprise": {
        "max_competitors": 25, "leaderboard": True,
        "model_breakdown_view": True, "prompt_level_drilldown": True,
        "competitor_cited_urls": True, "gap_opportunities": True,
        "trend_chart_days": 99999, "benchmark_score_alerts": True, "export": True,
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# NEW — fetch brand's cited domains for D7 Param 3 (source overlap)
# Reads from MOAT 1 (citation_intelligence) or MOAT 5 (llm_source_attribution)
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_brand_cited_domains(project_id: str, session_id: str) -> List[str]:
    """
    Returns deduplicated list of domains that cite the brand.
    Used by compute_source_overlap_ratio() in moat7_aivs_bridge.py.
    Falls back to [] if MOAT 1/5 data not available — D7 Param 3 scores 0.
    """
    domains: List[str] = []
    try:
        moat1_doc = mongo_manager.db.citation_intelligence.find_one(
            {"$or": [{"projectId": project_id}, {"sessionId": session_id}]},
            sort=[("createdAt", -1)],
        ) or {}
        for cite in (moat1_doc.get("cited_sources") or []):
            if isinstance(cite, dict) and cite.get("domain"):
                d = str(cite["domain"]).strip().lower()
                if d and d not in domains:
                    domains.append(d)

        if not domains:
            moat5_doc = mongo_manager.db.llm_source_attribution.find_one(
                {"$or": [{"projectId": project_id}, {"sessionId": session_id}]},
                sort=[("createdAt", -1)],
            ) or {}
            for src in (moat5_doc.get("brand_sources") or []):
                if isinstance(src, dict) and src.get("domain"):
                    d = str(src["domain"]).strip().lower()
                    if d and d not in domains:
                        domains.append(d)
    except Exception as e:
        logger.warning(f"Could not fetch brand cited domains: {e}")
    return domains


# ─────────────────────────────────────────────────────────────────────────────
# NEW — fetch previous D7 result for delta computation
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_previous_d7(project_id: str, job_id: str) -> Optional[Dict[str, Any]]:
    """Returns None on first run or if collection doesn't exist yet."""
    try:
        return mongo_manager.db.cbm_aivs_d7.find_one(
            {"projectId": project_id, "jobId": {"$ne": job_id}},
            sort=[("generatedAt", -1)],
        )
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# SOP §3 Screen 1 — 7-day score_delta + rank_move calculator
# ─────────────────────────────────────────────────────────────────────────────

def _compute_leaderboard_deltas(
    current_comparison: Dict[str, Any],
    session_id: str,
    job_id: str,
) -> Dict[str, Dict[str, Any]]:
    deltas: Dict[str, Dict[str, Any]] = {}
    if not session_id:
        return deltas
    try:
        prev = mongo_manager.db.module_f.find_one(
            {"sessionId": session_id, "jobId": {"$ne": job_id}},
            sort=[("createdAt", -1)],
        )
        if not prev:
            return deltas

        prev_comparison = prev.get("compare_visibility_against_competitors") or {}

        def _entity_map(block: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
            m: Dict[str, Dict[str, Any]] = {}
            brand = block.get("brand")
            if isinstance(brand, dict) and brand.get("name"):
                m[str(brand["name"]).strip()] = brand
            for row in block.get("competitors") or []:
                if isinstance(row, dict) and row.get("name"):
                    m[str(row["name"]).strip()] = row
            return m

        prev_map = _entity_map(prev_comparison)
        cur_map  = _entity_map(current_comparison)

        for name, cur_row in cur_map.items():
            prev_row   = prev_map.get(name) or {}
            cur_score  = float(cur_row.get("benchmark_score") or 0)
            prev_score = float(prev_row.get("benchmark_score") or 0)
            cur_rank   = int(cur_row.get("rank_position") or 0)
            prev_rank  = int(prev_row.get("rank_position") or 0)
            deltas[name] = {
                "score_delta": round(cur_score - prev_score, 1),
                "rank_move":   (prev_rank - cur_rank) if (prev_rank > 0 and cur_rank > 0) else 0,
            }
    except Exception as e:
        logger.warning(f"Could not compute leaderboard deltas: {e}")
    return deltas


# ─────────────────────────────────────────────────────────────────────────────
# SOP §5.1 Table 2 — daily citation snapshot writer
# ─────────────────────────────────────────────────────────────────────────────

def _write_citation_snapshots(
    job_id: str, project_id: str, session_id: str,
    topic: str, comparison: Dict[str, Any],
    prompt_count: int = 0,
) -> None:
    from .competitor_ai_intelligence import _compute_citation_score

    snapshot_date = date.today().isoformat()
    brand_block   = comparison.get("brand") or {}
    comp_blocks   = comparison.get("competitors") or []
    all_entities  = ([brand_block] if brand_block else []) + list(comp_blocks)

    rows = []
    for entity in all_entities:
        if not isinstance(entity, dict) or not entity.get("name"):
            continue
        entity_name = str(entity["name"]).strip()
        is_brand    = entity is brand_block
        entity_type = "client" if is_brand else "competitor"
        entity_id   = str(entity.get("entity_id") or "") or None
        per_model   = entity.get("per_model") or {}
        for model_name, model_stats in per_model.items():
            if not isinstance(model_stats, dict):
                continue
            mention_present  = int(model_stats.get("mentions") or 0) > 0
            mention_position = model_stats.get("rank")
            mention_sentiment = float(model_stats.get("sentiment") or 0.0)
            mention_in_title  = bool(model_stats.get("in_title", False))
            citation_present  = bool(model_stats.get("citation_present", False))
            cited_urls        = list(model_stats.get("cited_urls") or [])
            citation_score = _compute_citation_score(
                citation_present=citation_present,
                mention_present=mention_present,
                mention_position=mention_position,
                mention_sentiment=mention_sentiment,
                mention_in_title=mention_in_title,
            )
            rows.append({
                "jobId": job_id, "projectId": project_id, "sessionId": session_id,
                "snapshotDate": snapshot_date,
                "entityType": entity_type,
                "entityId": entity_id,
                "entityName": entity_name, "llmModel": str(model_name),
                "topicCluster": topic or "",
                "citationPresent": citation_present,
                "mentionPresent": mention_present,
                "mentionPosition": mention_position,
                "mentionSentiment": round(mention_sentiment, 3),
                "mentionInTitle": mention_in_title,
                "citationScore": round(citation_score, 2),
                "citedUrl": cited_urls[0] if cited_urls else None,
                "rankPercentile": model_stats.get("rank_percentile"),
                "benchmarkScore": entity.get("benchmark_score"),
                "visibilityScore": entity.get("visibility_score"),
                "shareOfVoice": entity.get("share_of_voice"),
                "rankPosition": entity.get("rank_position"),
                "promptCount": prompt_count,
                "scoreDelta": entity.get("score_delta", 0.0),
                "rankMove": entity.get("rank_move", 0),
                "createdAt": datetime.utcnow(),
            })

    if not rows:
        return
    try:
        for row in rows:
            mongo_manager.db.cbm_citation_snapshots.update_one(
                {"projectId": row["projectId"], "snapshotDate": row["snapshotDate"],
                 "entityName": row["entityName"], "llmModel": row["llmModel"],
                 "jobId": row["jobId"]},
                {"$set": row, "$setOnInsert": {"insertedAt": datetime.utcnow()}},
                upsert=True,
            )
        logger.info(f"Wrote {len(rows)} cbm_citation_snapshots for job {job_id}")
    except Exception as e:
        logger.warning(f"cbm_citation_snapshots write failed for job {job_id}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# SOP §5.1 Table 4 — competitor cited URLs writer
# ─────────────────────────────────────────────────────────────────────────────

def _url_to_page_title(url: str) -> str:
    """Derive a readable page title from a URL path as fallback."""
    if not url:
        return ""
    try:
        from urllib.parse import urlparse
        path = urlparse(url).path.rstrip("/")
        if not path or path == "/":
            return ""
        slug = path.split("/")[-1]
        slug = re.sub(r"\.\w+$", "", slug)
        title = slug.replace("-", " ").replace("_", " ").strip()
        return title.title() if title else ""
    except Exception:
        return ""


def _write_competitor_cited_urls(
    job_id: str, project_id: str, session_id: str,
    comparison: Dict[str, Any],
) -> None:
    from .competitor_ai_intelligence import _tag_content_type
    today = date.today().isoformat()
    rows_to_write: List[Dict[str, Any]] = []

    for entity in (comparison.get("competitors") or []):
        if not isinstance(entity, dict) or not entity.get("name"):
            continue
        entity_name = str(entity["name"]).strip()
        competitor_id = str(entity.get("entity_id") or "") or None
        url_model_map: Dict[str, List[str]] = {}
        for model_name, model_stats in (entity.get("per_model") or {}).items():
            if not isinstance(model_stats, dict):
                continue
            for cited_url in (model_stats.get("cited_urls") or []):
                url_model_map.setdefault(cited_url, [])
                if model_name not in url_model_map[cited_url]:
                    url_model_map[cited_url].append(model_name)
        for cited_url, cited_by_models in url_model_map.items():
            content_type = _tag_content_type(cited_url, "")
            page_title = _url_to_page_title(cited_url)
            for model_name in cited_by_models:
                rows_to_write.append({
                    "jobId": job_id, "projectId": project_id, "sessionId": session_id,
                    "competitorId": competitor_id,
                    "competitorName": entity_name, "citedUrl": cited_url,
                    "llmModel": model_name, "contentType": content_type,
                    "pageTitle": page_title, "lastSeen": today,
                })

    if not rows_to_write:
        return
    try:
        for row in rows_to_write:
            mongo_manager.db.cbm_competitor_cited_urls.update_one(
                {"projectId": row["projectId"], "competitorName": row["competitorName"],
                 "citedUrl": row["citedUrl"], "llmModel": row["llmModel"]},
                {
                    "$set": {"contentType": row["contentType"], "lastSeen": row["lastSeen"],
                             "pageTitle": row["pageTitle"], "competitorId": row["competitorId"],
                             "sessionId": row["sessionId"], "jobId": row["jobId"]},
                    "$setOnInsert": {"firstSeen": today, "insertedAt": datetime.utcnow(),
                                    "projectId": row["projectId"],
                                    "competitorName": row["competitorName"],
                                    "citedUrl": row["citedUrl"], "llmModel": row["llmModel"]},
                    "$inc": {"citationCount": 1},
                },
                upsert=True,
            )
        logger.info(f"Wrote {len(rows_to_write)} cbm_competitor_cited_urls for job {job_id}")
    except Exception as e:
        logger.warning(f"cbm_competitor_cited_urls write failed for job {job_id}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# SOP §5.2 cbm-alert-svc — rank/score change alerts
# ─────────────────────────────────────────────────────────────────────────────

def _write_cbm_alerts(
    job_id: str, project_id: str, session_id: str,
    leaderboard_deltas: Dict[str, Dict[str, Any]],
    comparison: Dict[str, Any],
) -> None:
    brand_block = comparison.get("brand") or {}
    comp_blocks = comparison.get("competitors") or []
    all_entities = ([brand_block] if brand_block else []) + list(comp_blocks)

    alerts = []
    for entity in all_entities:
        if not isinstance(entity, dict) or not entity.get("name"):
            continue
        name = str(entity["name"]).strip()
        d = leaderboard_deltas.get(name) or {}
        score_delta = float(d.get("score_delta") or 0)
        rank_move = int(d.get("rank_move") or 0)
        if abs(rank_move) < 2 and abs(score_delta) < 10:
            continue
        alert_type = "improvement" if (score_delta >= 10 or rank_move >= 2) else (
            "drop" if score_delta <= -10 else "rank_change"
        )
        # SOP §6.3: derive alertLevel from score_delta magnitude
        if abs(score_delta) >= 10:
            alert_level = "high"
        elif abs(score_delta) >= 5:
            alert_level = "medium"
        else:
            alert_level = "low"
        message = (
            f"{name} improved {'+' if score_delta >= 0 else ''}{score_delta:.1f}pts "
            f"and moved {'up' if rank_move > 0 else 'down'} {abs(rank_move)} rank position(s)."
            if alert_type == "improvement" else
            f"{name} dropped {abs(score_delta):.1f}pts "
            f"and moved {'down' if rank_move < 0 else 'up'} {abs(rank_move)} rank position(s)."
        )
        alerts.append({
            "jobId": job_id, "projectId": project_id, "sessionId": session_id,
            "entityName": name, "alertType": alert_type, "message": message,
            "scoreDelta": score_delta, "rankMove": rank_move,
            "currentRank": entity.get("rank_position"),
            "benchmarkScore": entity.get("benchmark_score"),
            "alertLevel": alert_level,
            "firedAt": datetime.utcnow(), "status": "unread",
        })

    if not alerts:
        return
    try:
        for alert in alerts:
            mongo_manager.db.cbm_alerts.update_one(
                {"projectId": alert["projectId"], "jobId": alert["jobId"],
                 "entityName": alert["entityName"]},
                {"$set": alert, "$setOnInsert": {"insertedAt": datetime.utcnow()}},
                upsert=True,
            )
        logger.info(f"Wrote {len(alerts)} cbm_alerts for job {job_id}")
    except Exception as e:
        logger.warning(f"cbm_alerts write failed for job {job_id}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# NEW — persist D7/AIVS™ result to cbm_aivs_d7 collection
# ─────────────────────────────────────────────────────────────────────────────

def _write_d7_aivs_result(
    job_id: str, project_id: str, session_id: str,
    d7_output: Dict[str, Any],
) -> None:
    """
    One document per project, upserted on projectId.
    Historical trend is tracked via d7_delta and d7_delta_direction fields.

    Field naming: uses snake_case keys for D7 fields to match what
    compute_competitive_aivs_delta() reads via _fetch_previous_d7().
    """
    try:
        pb = d7_output.get("param_breakdown") or {}
        mongo_manager.db.cbm_aivs_d7.update_one(
            {"projectId": project_id},
            {
                "$set": {
                    "projectId":            project_id,
                    "sessionId":            session_id,
                    "jobId":                job_id,
                    "generatedAt":          datetime.utcnow(),
                    "d7_score":             d7_output.get("d7_score"),
                    "d7_grade":             d7_output.get("d7_grade"),
                    "d7_delta":             d7_output.get("d7_delta"),
                    "d7_delta_direction":   d7_output.get("d7_delta_direction"),
                    "aivs_d7_contribution": d7_output.get("aivs_d7_contribution"),
                    "aivs_d7_delta":        d7_output.get("aivs_d7_delta"),
                    "projected_aivs_score": d7_output.get("projected_aivs_score"),
                    "previous_d7_score":    d7_output.get("previous_d7_score"),
                    "grade_change":         d7_output.get("grade_change"),
                    "alert_level":          d7_output.get("alert_level"),
                    "param_breakdown": {
                        "sov":     {"score": (pb.get("sov") or {}).get("score"),
                                    "raw_pct": (pb.get("sov") or {}).get("raw_pct")},
                        "gaps":    {"score": (pb.get("gaps") or {}).get("score"),
                                    "count": (pb.get("gaps") or {}).get("count")},
                        "overlap": {"score": (pb.get("overlap") or {}).get("score"),
                                    "overlap_pct": (pb.get("overlap") or {}).get("overlap_pct")},
                    },
                },
                "$setOnInsert": {"insertedAt": datetime.utcnow()},
            },
            upsert=True,
        )
        logger.info(
            f"cbm_aivs_d7 written: project={project_id} "
            f"d7={d7_output.get('d7_score')} grade={d7_output.get('d7_grade')} "
            f"delta={d7_output.get('d7_delta')} alert={d7_output.get('alert_level')}"
        )
    except Exception as e:
        logger.warning(f"cbm_aivs_d7 write failed for job {job_id}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN RUNNER
# ─────────────────────────────────────────────────────────────────────────────

async def run_module_f_competitor_ai_intelligence(
    job_id: str,
    url: str,
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
    source_job_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    job_id      — the NEW job being processed.  Used as the key for ALL writes
                  (cbm_citation_snapshots, module_f upsert, alerts, etc.) so that
                  each invocation produces a distinct set of documents enabling
                  job-to-job comparison in wins/losses.

    source_job_id — the upstream job whose module_e / context data we read from
                    (e.g. the original crawl or the previous module_F run that
                    was used as a cache source).  When absent, falls back to job_id.
    """

    mongo_manager.connect()

    # lookup_id is used for READ-only operations: resolving session/project from
    # the jobs collection and finding the module_e document with competitor context.
    lookup_id = source_job_id or job_id

    if not session_id or not project_id:
        job_doc = mongo_manager.db.jobs.find_one(
            {"$or": [{"id": lookup_id}, {"jobId": lookup_id}]},
            {"sessionId": 1, "session_id": 1, "projectId": 1, "project_id": 1},
        ) or {}
        session_id = session_id or job_doc.get("sessionId") or job_doc.get("session_id")
        project_id = project_id or job_doc.get("projectId") or job_doc.get("project_id")

    session_id = str(session_id).strip() if session_id else ""
    project_id = str(project_id).strip() if project_id else ""

    plan = _extract_plan_from_project(project_id)

    # Look up module_e using the source/lookup job id (the upstream context job).
    # The session fallback ensures we always find a module_e doc even when
    # lookup_id is a crawl job that has no direct module_e entry.
    module_e_match = [{"jobId": lookup_id}]
    if session_id:
        module_e_match.append({"sessionId": session_id})

    module_e_pipeline = [
        {"$match": {"$or": module_e_match}},
        {"$addFields": {"_p": {"$cond": [{"$eq": ["$jobId", lookup_id]}, 0, 1]}}},
        {"$sort": {"_p": 1, "createdAt": -1}},
        {"$limit": 1},
        {"$project": {"_p": 0}},
    ]
    module_e_doc = next(mongo_manager.module_e.aggregate(module_e_pipeline), {}) or {}

    # Resolve module_e_job_id early — used as the onboarding job key for both
    # brand_competitive_landscape and brand_prompts lookups.
    module_e_job_id = str(module_e_doc.get("jobId") or lookup_id)

    # Source 1 (preferred): onboarding competitive landscape (Stage 7 — single source of truth)
    competitors = _fetch_competitors_from_onboarding(module_e_job_id, lookup_id)
    if competitors:
        logger.info(
            f"Using {len(competitors)} competitors from brand_competitive_landscape "
            f"(onboarding) for job {job_id}"
        )
    else:
        # Source 2 (fallback): Module E competitor_mentions
        competitors = _extract_competitors_from_module_e(module_e_doc)
        if competitors:
            logger.info(
                f"Falling back to {len(competitors)} competitors from module_e for job {job_id}"
            )

    # brand_name: prefer onboarding profile (most accurate), fall back to Module E
    brand_name = (
        _fetch_brand_name_from_onboarding(module_e_job_id, lookup_id)
        or _extract_brand_name_from_module_e(module_e_doc)
    )
    topic = _extract_topic_from_module_e(module_e_doc)

    if not competitors:
        logger.warning(f"No competitors found for job {job_id} (session {session_id})")
        result = {
            "job_id": job_id, "session_id": session_id,
            "project_id": project_id, "url": url,
            "error": "No competitors found. Complete brand onboarding (Stage 7) to populate the competitive landscape.",
            "created_at": datetime.utcnow().isoformat(),
        }
        mongo_manager.db.module_f.update_one(
            {"jobId": job_id},
            {
                "$set": {"jobId": job_id, "sessionId": session_id,
                         "projectId": project_id, **result, "updatedAt": datetime.utcnow()},
                "$setOnInsert": {"createdAt": datetime.utcnow()},
            },
            upsert=True,
        )
        return result

    # SOP §2 Step 1 — fetch competitor_config for aliases + display_order + entity IDs
    competitor_configs = _fetch_competitor_config(project_id)

    # SOP §4 — resolve user role for MOAT 4 personalization
    role = _extract_role_from_context(project_id, session_id)

    analyzer = CompetitorAIIntelligence(plan=plan)

    # Step 1 — Visibility leaderboard (SOP §3 Screen 1 + 2)
    comparison = await analyzer.compare_visibility_against_competitors(
        url=url, competitors=competitors, brand_name=brand_name, topic=topic,
        competitor_configs=competitor_configs,
    )

    # Step 2 — Prompt win/loss (SOP §3 Screen 3)
    topic_for_prompts = (comparison or {}).get("topic") or topic

    # Prefer topic-grouped prompts from brand_onboarding brand_prompts collection.
    # This is the canonical source: prompts are generated per-topic during brand
    # onboarding (pipeline.py stage4_prompts) and stored in brand_prompts with a
    # `topic` field.  We need the exact job_id the module_e document was written
    # under so we can locate the matching brand_prompts docs.
    topic_groups, prompt_to_topic, topic_flat_prompts = _fetch_topic_grouped_prompts(
        lookup_id=lookup_id,
        session_id=session_id,
        module_e_job_id=module_e_job_id,
    )

    if topic_flat_prompts:
        prompts = topic_flat_prompts
        logger.info(
            f"Using {len(prompts)} prompts from brand_prompts collection "
            f"({len(topic_groups)} topics) for job {job_id}"
        )
    else:
        # Legacy fallback: read from module_e document fields
        prompts = _extract_prompts_from_module_e(module_e_doc, topic_for_prompts)
        logger.info(
            f"No brand_prompts docs found — falling back to module_e "
            f"({len(prompts)} prompts) for job {job_id}"
        )

    competitor_wins = await analyzer.analyze_competitor_prompt_wins(
        prompts=prompts, competitors=competitors, brand_name=brand_name, url=url,
    )

    # Tag each detailed_result with its topic using the prompt→topic lookup
    if prompt_to_topic and competitor_wins.get("detailed_results"):
        for _r in competitor_wins["detailed_results"]:
            _p = str(_r.get("prompt") or "").strip()
            _r["topic"] = prompt_to_topic.get(_p, "")

    # Build topic_wins: [{topic, prompts_total, results: [...]}]
    # Only topics that have at least one analyzed result are included.
    topic_wins: List[Dict[str, Any]] = []
    if topic_groups:
        results_by_topic: Dict[str, List[Dict[str, Any]]] = {}
        for _r in (competitor_wins.get("detailed_results") or []):
            _t = str(_r.get("topic") or "").strip()
            if _t:
                results_by_topic.setdefault(_t, [])
                results_by_topic[_t].append(_r)

        for _grp in topic_groups:
            _t = _grp["topic"]
            topic_wins.append({
                "topic": _t,
                "prompts_total": len(_grp["prompts"]),
                "results": results_by_topic.get(_t, []),
            })

    # Step 3 — Gap analysis (SOP §3 Screen 5)
    gap_analysis = analyzer.compute_gap_analysis(
        prompt_results=competitor_wins.get("detailed_results") or [],
        competitors=competitors,
    )

    # Step 4 — Source influence + cited URLs (SOP §3 Screen 4)
    source_analysis = await analyzer.analyze_competitor_sources(
        competitors=competitors, topic=topic_for_prompts,
    )

    # Step 5 — Metric recommendations
    recommendations = await analyzer.generate_metric_recommendations(
        visibility_data=comparison, win_rate_data=competitor_wins,
        gap_data=gap_analysis, source_data=source_analysis,
    )

    # Step 6 — Emerging trends (SOP §3 Screen 6)
    emerging_trends: Dict[str, Any] = {}
    prev_doc: Optional[Dict[str, Any]] = None
    try:
        if session_id:
            prev_doc = mongo_manager.db.module_f.find_one(
                {"sessionId": session_id, "jobId": {"$ne": job_id}},
                sort=[("createdAt", -1)],
            )
        emerging_trends = analyzer.compute_emerging_trends(
            current_compare=comparison, current_wins=competitor_wins, prev_doc=prev_doc,
        )
    except Exception as e:
        logger.warning(f"Emerging trends failed for job {job_id}: {e}")

    # Step 7 — Attach score_delta + rank_move to leaderboard entities
    leaderboard_deltas = _compute_leaderboard_deltas(comparison, session_id, job_id)

    def _attach_deltas(entity: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not isinstance(entity, dict):
            return entity
        name = str(entity.get("name") or "").strip()
        d = leaderboard_deltas.get(name) or {}
        return {**entity, "score_delta": d.get("score_delta", 0.0),
                "rank_move": d.get("rank_move", 0)}

    if isinstance(comparison, dict):
        comparison["brand"] = _attach_deltas(comparison.get("brand"))
        comparison["competitors"] = [
            _attach_deltas(c) for c in (comparison.get("competitors") or [])
        ]

    # Step 8 — Write citation snapshots
    prompt_count = int(
        (competitor_wins.get("summary") or {}).get("total_prompts") or 0
    )
    _write_citation_snapshots(
        job_id=job_id, project_id=project_id, session_id=session_id,
        topic=topic_for_prompts or "", comparison=comparison,
        prompt_count=prompt_count,
    )

    # Step 8b — Write competitor cited URLs
    _write_competitor_cited_urls(
        job_id=job_id, project_id=project_id, session_id=session_id,
        comparison=comparison,
    )

    # Step 8c — Fire rank/score alerts
    _write_cbm_alerts(
        job_id=job_id, project_id=project_id, session_id=session_id,
        leaderboard_deltas=leaderboard_deltas, comparison=comparison,
    )

    # Step 9 — MOAT 4 Recommendation Engine
    from .module_f_recommendation_engine import generate_moat7_recommendations

    moat4_output: Dict[str, Any] = {}
    try:
        prev_doc_ts = (prev_doc or {}).get("createdAt")
        if prev_doc_ts:
            try:
                prev_dt = datetime.fromisoformat(str(prev_doc_ts).replace("Z", "+00:00"))
                days_since = max(0, (datetime.utcnow() - prev_dt.replace(tzinfo=None)).days)
            except Exception:
                days_since = 7
        else:
            days_since = 7

        moat4_output = generate_moat7_recommendations(
            comparison=comparison, competitor_wins=competitor_wins,
            gap_analysis=gap_analysis, source_analysis=source_analysis,
            emerging_trends=emerging_trends or {}, plan=plan,
            role=role, days_since_last_run=days_since,
        )
        logger.info(
            f"MOAT 4 recommendations: {len(moat4_output.get('all_actions', []))} actions "
            f"| delta_class={moat4_output.get('delta_class')} | plan={plan}"
        )
    except Exception as e:
        logger.warning(f"MOAT 4 recommendation engine failed for job {job_id}: {e}")

    # ─────────────────────────────────────────────────────────────────────────
    # Step 10 — AIVS™ D7: Competitive Citation Gap Score
    #
    # Converts all MOAT 7 output → D7 score → feeds MOAT 3 (AIVS™ engine).
    #
    # Reads:
    #   brand_cited_domains   from MOAT 1/5 (D7 Param 3 — source overlap)
    #   previous_d7           from cbm_aivs_d7 (for delta computation)
    #   d1_d6_contribution    from projects collection (for projected AIVS™)
    #
    # Writes:
    #   cbm_aivs_d7           one doc per project (upserted)
    #   cbm_alerts            AIVS D7 alert if alert_level is high/medium
    # ─────────────────────────────────────────────────────────────────────────
    d7_aivs_output: Dict[str, Any] = {}
    try:
        from .moat7_aivs_bridge import run_d7_pipeline

        brand_cited_domains = _fetch_brand_cited_domains(project_id, session_id)
        previous_d7 = _fetch_previous_d7(project_id, job_id)

        proj_data = mongo_manager.db.projects.find_one(
            {"$or": [{"id": project_id}, {"projectId": project_id}]},
            {"aivsScore": 1, "d1_d6_contribution": 1},
        ) or {}

        d7_aivs_output = run_d7_pipeline(
            comparison=comparison,
            gap_analysis=gap_analysis,
            source_analysis=source_analysis,
            brand_cited_domains=brand_cited_domains,
            previous_d7_result=previous_d7,
            previous_full_aivs=proj_data.get("aivsScore"),
            d1_d6_score=proj_data.get("d1_d6_contribution"),
        )

        # Persist D7 result
        _write_d7_aivs_result(
            job_id=job_id, project_id=project_id, session_id=session_id,
            d7_output=d7_aivs_output,
        )

        # Fire AIVS D7 alert if significant change
        alert_level = d7_aivs_output.get("alert_level", "none")
        d7_delta = d7_aivs_output.get("d7_delta")
        if alert_level in ("high", "medium") and d7_delta is not None:
            try:
                brand_name_alert = str(
                    (comparison.get("brand") or {}).get("name") or "Brand"
                )
                direction = "improved" if d7_delta > 0 else "dropped"
                mongo_manager.db.cbm_alerts.update_one(
                    {"projectId": project_id, "jobId": job_id, "entityName": "__aivs_d7__"},
                    {
                        "$set": {
                            "jobId": job_id, "projectId": project_id,
                            "sessionId": session_id, "entityName": "__aivs_d7__",
                            "alertType": "improvement" if d7_delta > 0 else "drop",
                            "message": (
                                f"AIVS™ D7 {direction} "
                                f"{'+' if d7_delta > 0 else ''}{d7_delta:.1f}pts "
                                f"for {brand_name_alert}. "
                                f"D7: {d7_aivs_output.get('d7_score')} "
                                f"({d7_aivs_output.get('d7_grade')})."
                            ),
                            "scoreDelta": d7_delta, "rankMove": 0,
                            "benchmarkScore": d7_aivs_output.get("d7_score"),
                            "firedAt": datetime.utcnow(), "status": "unread",
                            "alertLevel": alert_level,
                        },
                        "$setOnInsert": {"insertedAt": datetime.utcnow()},
                    },
                    upsert=True,
                )
            except Exception as ae:
                logger.warning(f"D7 AIVS alert write failed: {ae}")

        logger.info(
            f"AIVS™ D7: score={d7_aivs_output.get('d7_score')} "
            f"grade={d7_aivs_output.get('d7_grade')} "
            f"delta={d7_aivs_output.get('d7_delta')} "
            f"contribution={d7_aivs_output.get('aivs_d7_contribution')} "
            f"alert={d7_aivs_output.get('alert_level')}"
        )

    except Exception as e:
        logger.warning(f"AIVS™ D7 pipeline failed for job {job_id}: {e}")

    # Build and persist result
    feature_flags = PLAN_FEATURE_FLAGS.get(plan, PLAN_FEATURE_FLAGS["agency"])

    result = {
        "job_id":     job_id,
        "session_id": session_id,
        "project_id": project_id,
        "plan":       plan,
        "role":       role,
        "url":        url,
        "feature_flags":          feature_flags,
        "compare_visibility_against_competitors": comparison,
        "competitor_wins":        competitor_wins,
        "topic_wins":             topic_wins if topic_wins else None,
        "gap_analysis":           gap_analysis,
        "source_analysis":        source_analysis,
        "metric_recommendations": recommendations,
        "moat4_recommendations":  moat4_output,
        "emerging_trends":        emerging_trends if emerging_trends else None,
        "d7_aivs_output":         d7_aivs_output if d7_aivs_output else None,
        "created_at":             datetime.utcnow().isoformat(),
    }

    mongo_manager.db.module_f.update_one(
        {"jobId": job_id},
        {
            "$set": {
                "jobId": job_id, "sessionId": session_id,
                "projectId": project_id, **result, "updatedAt": datetime.utcnow(),
            },
            "$setOnInsert": {"createdAt": datetime.utcnow()},
        },
        upsert=True,
    )

    logger.info(
        "Module F competitor AI intelligence persisted",
        extra={"job_id": job_id, "plan": plan, "competitors": len(competitors)},
    )

    return result


# runner.py
 
import logging
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
    """
    SOP §6 — look up subscription plan for this project.
    Returns: free | pro | agency | enterprise. Defaults to agency.
    """
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
 
 
def _extract_prompts_from_module_e(
    doc: Dict[str, Any],
    topic: Optional[str] = None,
) -> List[str]:
    prompts: List[str] = []
    ranking = doc.get("ranking") or {}
    if ranking.get("generated_prompts"):
        prompts = ranking["generated_prompts"]
    if not prompts:
        cc = doc.get("content_consistency") or {}
        prompts = cc.get("generated_prompts") or cc.get("prompts") or []
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
# SOP §3 Screen 1 — 7-day score_delta + rank_move calculator
# ─────────────────────────────────────────────────────────────────────────────
 
def _compute_leaderboard_deltas(
    current_comparison: Dict[str, Any],
    session_id: str,
    job_id: str,
) -> Dict[str, Dict[str, Any]]:
    """
    For each entity compute:
      score_delta = current benchmark_score - previous benchmark_score
      rank_move   = previous rank_position - current rank_position
                    (positive = moved up the leaderboard)
    Returns dict keyed by entity name.
    """
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
# SOP §2 Step 4 / §5.1 Table 2 — daily citation snapshot writer
# ─────────────────────────────────────────────────────────────────────────────
 
def _write_citation_snapshots(
    job_id: str,
    project_id: str,
    session_id: str,
    topic: str,
    comparison: Dict[str, Any],
) -> None:
    """
    SOP §5.1 Table 2 — cbm_citation_snapshots.
    One document per entity × llm_model. Upserted on
    (projectId, snapshotDate, entityName, llmModel) so same-day re-runs
    are idempotent (last write wins).
    """
    snapshot_date = date.today().isoformat()
    brand_block   = comparison.get("brand") or {}
    comp_blocks   = comparison.get("competitors") or []
    all_entities  = ([brand_block] if brand_block else []) + list(comp_blocks)
 
    rows = []
    for entity in all_entities:
        if not isinstance(entity, dict) or not entity.get("name"):
            continue
        entity_name = str(entity["name"]).strip()
        entity_type = str(entity.get("entity_type") or "competitor")
        per_model   = entity.get("per_model") or {}
 
        for model_name, model_stats in per_model.items():
            if not isinstance(model_stats, dict):
                continue
            rows.append({
                "jobId":           job_id,
                "projectId":       project_id,
                "sessionId":       session_id,
                "snapshotDate":    snapshot_date,
                "entityType":      entity_type,
                "entityName":      entity_name,
                "llmModel":        str(model_name),
                "topicCluster":    topic or "",
                "mentionPresent":  int(model_stats.get("mentions") or 0) > 0,
                "mentionPosition": model_stats.get("rank"),
                "rankPercentile":  model_stats.get("rank_percentile"),
                "benchmarkScore":  entity.get("benchmark_score"),
                "visibilityScore": entity.get("visibility_score"),
                "shareOfVoice":    entity.get("share_of_voice"),
                "rankPosition":    entity.get("rank_position"),
                "scoreDelta":      entity.get("score_delta", 0.0),
                "rankMove":        entity.get("rank_move", 0),
                "createdAt":       datetime.utcnow(),
            })
 
    if not rows:
        return
    try:
        for row in rows:
            mongo_manager.db.cbm_citation_snapshots.update_one(
                {
                    "projectId":    row["projectId"],
                    "snapshotDate": row["snapshotDate"],
                    "entityName":   row["entityName"],
                    "llmModel":     row["llmModel"],
                },
                {"$set": row, "$setOnInsert": {"insertedAt": datetime.utcnow()}},
                upsert=True,
            )
        logger.info(f"Wrote {len(rows)} cbm_citation_snapshots for job {job_id}")
    except Exception as e:
        logger.warning(f"cbm_citation_snapshots write failed for job {job_id}: {e}")
 
 
# ─────────────────────────────────────────────────────────────────────────────
# SOP §5.1 Table 4 — cbm_competitor_cited_urls writer
# Populates Screen 4 (Competitor Cited URL Tracker)
# ─────────────────────────────────────────────────────────────────────────────
 
def _write_competitor_cited_urls(
    job_id: str,
    project_id: str,
    session_id: str,
    comparison: Dict[str, Any],
) -> None:
    """
    SOP §5.1 Table 4 — cbm_competitor_cited_urls.
    For each competitor entity, upsert every URL that was cited in LLM
    responses, incrementing citation_count and updating last_seen.
    Auto-tags content_type from URL path + page title.
    """
    from .competitor_ai_intelligence import _tag_content_type  # local import avoids circular
 
    today = date.today().isoformat()
    comp_blocks = comparison.get("competitors") or []
 
    rows_to_write: List[Dict[str, Any]] = []
 
    for entity in comp_blocks:
        if not isinstance(entity, dict) or not entity.get("name"):
            continue
        entity_name = str(entity["name"]).strip()
        per_model = entity.get("per_model") or {}
 
        # Collect all cited URLs across models, tracking which models cited each
        url_model_map: Dict[str, List[str]] = {}
        for model_name, model_stats in per_model.items():
            if not isinstance(model_stats, dict):
                continue
            for cited_url in (model_stats.get("cited_urls") or []):
                url_model_map.setdefault(cited_url, [])
                if model_name not in url_model_map[cited_url]:
                    url_model_map[cited_url].append(model_name)
 
        for cited_url, cited_by_models in url_model_map.items():
            content_type = _tag_content_type(cited_url, "")
            for model_name in cited_by_models:
                rows_to_write.append({
                    "jobId":        job_id,
                    "projectId":    project_id,
                    "sessionId":    session_id,
                    "competitorName": entity_name,
                    "citedUrl":     cited_url,
                    "llmModel":     model_name,
                    "contentType":  content_type,
                    "lastSeen":     today,
                })
 
    if not rows_to_write:
        return
    try:
        for row in rows_to_write:
            mongo_manager.db.cbm_competitor_cited_urls.update_one(
                {
                    "projectId":      row["projectId"],
                    "competitorName": row["competitorName"],
                    "citedUrl":       row["citedUrl"],
                    "llmModel":       row["llmModel"],
                },
                {
                    "$set":      {"contentType": row["contentType"], "lastSeen": row["lastSeen"],
                                  "sessionId": row["sessionId"], "jobId": row["jobId"]},
                    "$setOnInsert": {"firstSeen": today, "insertedAt": datetime.utcnow(),
                                     "projectId": row["projectId"],
                                     "competitorName": row["competitorName"],
                                     "citedUrl":       row["citedUrl"],
                                     "llmModel":       row["llmModel"]},
                    "$inc":      {"citationCount": 1},
                },
                upsert=True,
            )
        logger.info(f"Wrote {len(rows_to_write)} cbm_competitor_cited_urls for job {job_id}")
    except Exception as e:
        logger.warning(f"cbm_competitor_cited_urls write failed for job {job_id}: {e}")
 
 
# ─────────────────────────────────────────────────────────────────────────────
# SOP §5.2 cbm-alert-svc — rank change and score drop alert writer
# Fires when rank changes ≥ ±2 positions OR score changes ≥ ±10 pts
# ─────────────────────────────────────────────────────────────────────────────
 
def _write_cbm_alerts(
    job_id: str,
    project_id: str,
    session_id: str,
    leaderboard_deltas: Dict[str, Dict[str, Any]],
    comparison: Dict[str, Any],
) -> None:
    """
    SOP §5.2 cbm-alert-svc equivalent.
    Writes an alert document to cbm_alerts for any entity that crossed
    the rank-change (±2) or score-change (±10) threshold this run.
    Alerts are upserted per (projectId, jobId, entityName) so re-runs
    on the same job don't create duplicate alerts.
    """
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
 
        # Threshold: ±2 rank positions OR ±10 benchmark pts
        if abs(rank_move) < 2 and abs(score_delta) < 10:
            continue
 
        if score_delta >= 10 or rank_move >= 2:
            alert_type = "improvement"
            message = (
                f"{name} improved {'+' if score_delta >= 0 else ''}{score_delta:.1f}pts "
                f"and moved {'up' if rank_move > 0 else 'down'} {abs(rank_move)} rank position(s)."
            )
        else:
            alert_type = "drop" if score_delta <= -10 else "rank_change"
            message = (
                f"{name} dropped {abs(score_delta):.1f}pts "
                f"and moved {'down' if rank_move < 0 else 'up'} {abs(rank_move)} rank position(s)."
            )
 
        alerts.append({
            "jobId":          job_id,
            "projectId":      project_id,
            "sessionId":      session_id,
            "entityName":     name,
            "alertType":      alert_type,
            "message":        message,
            "scoreDelta":     score_delta,
            "rankMove":       rank_move,
            "currentRank":    entity.get("rank_position"),
            "benchmarkScore": entity.get("benchmark_score"),
            "firedAt":        datetime.utcnow(),
            "status":         "unread",
        })
 
    if not alerts:
        return
    try:
        for alert in alerts:
            mongo_manager.db.cbm_alerts.update_one(
                {
                    "projectId":  alert["projectId"],
                    "jobId":      alert["jobId"],
                    "entityName": alert["entityName"],
                },
                {
                    "$set": alert,
                    "$setOnInsert": {"insertedAt": datetime.utcnow()},
                },
                upsert=True,
            )
        logger.info(f"Wrote {len(alerts)} cbm_alerts for job {job_id}")
    except Exception as e:
        logger.warning(f"cbm_alerts write failed for job {job_id}: {e}")
 
 
# ─────────────────────────────────────────────────────────────────────────────
# MAIN RUNNER
# ─────────────────────────────────────────────────────────────────────────────
 
async def run_module_f_competitor_ai_intelligence(
    job_id: str,
    url: str,
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
 
    mongo_manager.connect()
 
    # Resolve session_id / project_id from jobs collection if not passed
    if not session_id or not project_id:
        job_doc = mongo_manager.db.jobs.find_one(
            {"$or": [{"id": job_id}, {"jobId": job_id}]},
            {"sessionId": 1, "session_id": 1, "projectId": 1, "project_id": 1},
        ) or {}
        session_id = session_id or job_doc.get("sessionId") or job_doc.get("session_id")
        project_id = project_id or job_doc.get("projectId") or job_doc.get("project_id")
 
    session_id = str(session_id).strip() if session_id else ""
    project_id = str(project_id).strip() if project_id else ""
 
    # SOP §6 — resolve plan for competitor limit enforcement
    plan = _extract_plan_from_project(project_id)
 
    # Fetch Module E document — jobId match takes priority over sessionId
    module_e_match = [{"jobId": job_id}]
    if session_id:
        module_e_match.append({"sessionId": session_id})
 
    module_e_pipeline = [
        {"$match": {"$or": module_e_match}},
        {"$addFields": {"_p": {"$cond": [{"$eq": ["$jobId", job_id]}, 0, 1]}}},
        {"$sort": {"_p": 1, "createdAt": -1}},
        {"$limit": 1},
        {"$project": {"_p": 0}},
    ]
    module_e_doc = next(mongo_manager.module_e.aggregate(module_e_pipeline), {}) or {}
 
    competitors = _extract_competitors_from_module_e(module_e_doc)
    brand_name  = _extract_brand_name_from_module_e(module_e_doc)
    topic       = _extract_topic_from_module_e(module_e_doc)
 
    # Guard: no competitors
    if not competitors:
        logger.warning(f"No competitors found for job {job_id} (session {session_id})")
        result = {
            "job_id": job_id, "session_id": session_id,
            "project_id": project_id, "url": url,
            "error": "No competitors found. Run Module E competitor analysis first.",
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
 
    # SOP §6: plan passed so _enforce_competitor_limit fires inside analyze methods
    analyzer = CompetitorAIIntelligence(plan=plan)
 
    # Step 1 — Visibility leaderboard (SOP §3 Screen 1 + 2)
    comparison = await analyzer.compare_visibility_against_competitors(
        url=url,
        competitors=competitors,
        brand_name=brand_name,
        topic=topic,
    )
 
    # Step 2 — Prompt win/loss (SOP §3 Screen 3)
    topic_for_prompts = (comparison or {}).get("topic") or topic
    prompts = _extract_prompts_from_module_e(module_e_doc, topic_for_prompts)
 
    competitor_wins = await analyzer.analyze_competitor_prompt_wins(
        prompts=prompts,
        competitors=competitors,
        brand_name=brand_name,
        url=url,
    )
 
    # Step 3 — Gap analysis (SOP §3 Screen 5)
    gap_analysis = analyzer.compute_gap_analysis(
        prompt_results=competitor_wins.get("detailed_results") or [],
        competitors=competitors,
    )
 
    # Step 4 — Source influence + cited URLs (SOP §3 Screen 4)
    source_analysis = await analyzer.analyze_competitor_sources(
        competitors=competitors,
        topic=topic_for_prompts,
    )
 
    # Step 5 — Metric recommendations
    recommendations = await analyzer.generate_metric_recommendations(
        visibility_data=comparison,
        win_rate_data=competitor_wins,
        gap_data=gap_analysis,
        source_data=source_analysis,
    )
 
    # Step 6 — Emerging trends (SOP §3 Screen 6)
    emerging_trends: Dict[str, Any] = {}
    try:
        prev_doc = None
        if session_id:
            prev_doc = mongo_manager.db.module_f.find_one(
                {"sessionId": session_id, "jobId": {"$ne": job_id}},
                sort=[("createdAt", -1)],
            )
        emerging_trends = analyzer.compute_emerging_trends(
            current_compare=comparison,
            current_wins=competitor_wins,
            prev_doc=prev_doc,
        )
    except Exception as e:
        logger.warning(f"Emerging trends failed for job {job_id}: {e}")
 
    # Step 7 — Attach score_delta + rank_move to leaderboard entities (SOP Screen 1)
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
 
    # Step 8 — Write daily snapshots to cbm_citation_snapshots (SOP §5.1 Table 2)
    _write_citation_snapshots(
        job_id=job_id,
        project_id=project_id,
        session_id=session_id,
        topic=topic_for_prompts or "",
        comparison=comparison,
    )
 
    # Step 8b — Write competitor cited URLs to cbm_competitor_cited_urls (SOP §5.1 Table 4)
    _write_competitor_cited_urls(
        job_id=job_id,
        project_id=project_id,
        session_id=session_id,
        comparison=comparison,
    )
 
    # Step 8c — Fire cbm alerts for significant rank/score changes (SOP §5.2 cbm-alert-svc)
    _write_cbm_alerts(
        job_id=job_id,
        project_id=project_id,
        session_id=session_id,
        leaderboard_deltas=leaderboard_deltas,
        comparison=comparison,
    )
 
    # Step 9 — MOAT 4 Recommendation Engine (SOP §2-§6)
    # Runs the full 5-layer architecture:
    #   L1 Score Delta Engine → L2 Impact Classifier → L3 IEU Priority Resolver
    #   → L4 Role Personalisation → L5 Plan-tier delivery limits
    from .module_f_recommendation_engine import generate_moat7_recommendations
 
    moat4_output: Dict[str, Any] = {}
    try:
        # Compute days since last run for urgency modifiers
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
            comparison=comparison,
            competitor_wins=competitor_wins,
            gap_analysis=gap_analysis,
            source_analysis=source_analysis,
            emerging_trends=emerging_trends or {},
            plan=plan,
            role="seo_manager",   # default; override per user role at API layer
            days_since_last_run=days_since,
        )
        logger.info(
            f"MOAT 4 recommendations generated: {len(moat4_output.get('all_actions', []))} actions "
            f"| delta_class={moat4_output.get('delta_class')} | plan={plan}"
        )
    except Exception as e:
        logger.warning(f"MOAT 4 recommendation engine failed for job {job_id}: {e}")
 
    # Build result
    result = {
        "job_id":     job_id,
        "session_id": session_id,
        "project_id": project_id,
        "plan":       plan,
        "url":        url,
        "compare_visibility_against_competitors": comparison,            # Screen 1 + 2
        "competitor_wins":        competitor_wins,                        # Screen 3
        "gap_analysis":           gap_analysis,                           # Screen 5
        "source_analysis":        source_analysis,                        # Screen 4 (source influence)
        "metric_recommendations": recommendations,                        # metric why+fix (tooltip context)
        "moat4_recommendations":  moat4_output,                           # MOAT 4 full engine output
        "emerging_trends":        emerging_trends if emerging_trends else None,   # Screen 6
        # cbm_citation_snapshots, cbm_competitor_cited_urls, cbm_alerts are
        # written to their own collections — not embedded in this document.
        "created_at":             datetime.utcnow().isoformat(),
    }
 
    mongo_manager.db.module_f.update_one(
        {"jobId": job_id},
        {
            "$set": {
                "jobId":     job_id,
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
        extra={"job_id": job_id, "plan": plan, "competitors": len(competitors)},
    )
 
    return result
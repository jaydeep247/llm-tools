# module_f_recommendation_engine.py
#
# MOAT 4 — Recommendation Engine
# Scoped to MOAT 7 (Competitive Citation Benchmarking Engine) data only.
#
# Implements the full 5-layer architecture from SOP §2:
#   L1  Score Delta Engine        — detects COMPETITOR_THREAT, CRITICAL_DROP, etc.
#   L2  Impact Classifier         — scores each issue 0-10 by MOAT 7 impact rules
#   L3  Priority Resolver         — IEU matrix: Priority = (I×0.5) + (E_inv×0.3) + (U×0.2)
#   L4  Role Personalization      — filters/reformats per CXO/CMO/SEO/Content/Analyst
#   L5  Delivery Engine           — plan-tier limits + structured output objects

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

logger = logging.getLogger("module_f_recommendation_engine")


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS — IEU calibrated to MOAT 7 data sources (SOP §3.2)
# ─────────────────────────────────────────────────────────────────────────────

PLAN_REC_LIMITS: Dict[str, int] = {
    "free": 3,
    "pro": 10,
    "agency": 25,
    "enterprise": 999,
}

DELTA_CLASSES = {
    "COMPETITOR_THREAT": "competitor_threat",
    "CRITICAL_DROP":     "critical_drop",
    "SIGNIFICANT_DROP":  "significant_drop",
    "PLATEAU":           "plateau",
    "IMPROVEMENT":       "improvement",
    "STABLE":            "stable",
}


# ─────────────────────────────────────────────────────────────────────────────
# L1 — SCORE DELTA ENGINE
# Detects delta class from MOAT 7 comparison + emerging_trends data
# ─────────────────────────────────────────────────────────────────────────────

def _classify_delta(
    brand_score_delta: float,
    brand_vis_delta: float,
    max_competitor_gain: float,
    any_prompt_flipped_to_competitor: bool,
    days_since_last_run: int,
    brand_win_rate: float,
) -> str:
    """
    SOP §2.3 — map observed deltas to a delta class.
    Priority order: COMPETITOR_THREAT > CRITICAL_DROP > SIGNIFICANT_DROP >
                    PLATEAU > IMPROVEMENT > STABLE
    """
    # COMPETITOR THREAT: any competitor gained >10pts OR prompt flipped to them
    if max_competitor_gain >= 10 or any_prompt_flipped_to_competitor:
        return DELTA_CLASSES["COMPETITOR_THREAT"]
    # CRITICAL DROP: brand benchmark drops >15pts
    if brand_score_delta <= -15:
        return DELTA_CLASSES["CRITICAL_DROP"]
    # SIGNIFICANT DROP: brand benchmark or visibility drops 8-15pts
    if brand_score_delta <= -8 or brand_vis_delta <= -8:
        return DELTA_CLASSES["SIGNIFICANT_DROP"]
    # IMPROVEMENT: brand gained >5pts
    if brand_score_delta >= 5:
        return DELTA_CLASSES["IMPROVEMENT"]
    # PLATEAU: flat for 21+ days and still losing prompts
    if days_since_last_run >= 21 and brand_win_rate < 50:
        return DELTA_CLASSES["PLATEAU"]
    return DELTA_CLASSES["STABLE"]


# ─────────────────────────────────────────────────────────────────────────────
# L2 + L3 — IMPACT CLASSIFIER + PRIORITY RESOLVER
# Each issue type has calibrated I, E_raw, U_base values (SOP §3.2)
# Priority = (I × 0.50) + ((11 - E_raw) × 0.30) + (U × 0.20)
# ─────────────────────────────────────────────────────────────────────────────

def _priority_score(impact: float, effort_raw: float, urgency: float) -> float:
    """IEU formula from SOP §3.1"""
    effort_inv = 11.0 - effort_raw
    return round((impact * 0.50) + (effort_inv * 0.30) + (urgency * 0.20), 2)


def _urgency_modifiers(delta_class: str, score_delta: float, days_stale: int) -> float:
    """SOP §3.3 urgency multipliers applied to base urgency."""
    mod = 0.0
    if delta_class == DELTA_CLASSES["COMPETITOR_THREAT"]:
        mod += 3.0   # competitor AIVS surpassed client
    if score_delta < 0:
        mod += 2.0   # client score dropped this week
    if days_stale >= 21:
        mod += 2.0   # data stale
    return mod


def _build_issues(
    comparison: Dict[str, Any],
    competitor_wins: Dict[str, Any],
    gap_analysis: List[Dict[str, Any]],
    source_analysis: Dict[str, Any],
    emerging_trends: Dict[str, Any],
    delta_class: str,
    brand_score_delta: float,
    days_since_last_run: int,
) -> List[Dict[str, Any]]:
    """
    L2 — Build the raw issue registry from MOAT 7 data.
    Each issue: {title, detail, module, impact, effort_raw, urgency, affected, role_visibility}
    """
    issues: List[Dict[str, Any]] = []
    brand = comparison.get("brand") or {}
    competitors = comparison.get("competitors") or []
    brand_name = str(brand.get("name") or "Brand")
    summary = (competitor_wins.get("summary") or {})
    detailed = (competitor_wins.get("detailed_results") or [])
    sources = (source_analysis.get("competitor_source_analysis") or [])
    comp_changes = (emerging_trends.get("competitor_changes") or [])

    u_mod = _urgency_modifiers(delta_class, brand_score_delta, days_since_last_run)

    # ── Issue 1: Uncontested HIGH★ prompts (Screen 5) ─────────────────────
    # Impact=9, Effort=5 (new page), Urgency=7+mod — highest ROI
    for gap in gap_analysis:
        comp_name = gap.get("competitor", "competitor")
        for opp in (gap.get("opportunities") or []):
            if opp.get("rank") is None and (opp.get("opportunityScore") or 0) >= 90:
                prompt_text = str(opp.get("prompt") or "").strip()
                if not prompt_text:
                    continue
                issues.append({
                    "rec_id":         str(uuid4()),
                    "module":         "competitor",
                    "action_title":   f"Create page targeting: \"{prompt_text}\"",
                    "action_detail":  (
                        f"{comp_name} has zero presence on this query — it is uncontested territory. "
                        f"Create a dedicated page with a direct answer, FAQ block, and comparison section. "
                        f"Format: answer-first intro → 3-5 key points → FAQ (5+ Q&A pairs) → CTA. "
                        f"Add Organization + FAQ schema."
                    ),
                    "affected_urls":  [],
                    "impact":         9.0,
                    "effort_raw":     5.0,
                    "urgency":        min(10.0, 7.0 + u_mod),
                    "role_visibility": ["cxo", "cmo", "seo_manager", "content_manager"],
                    "gap_type":       "uncontested",
                    "competitor":     comp_name,
                })
                if len([i for i in issues if i.get("gap_type") == "uncontested"]) >= 3:
                    break

    # ── Issue 2: Priority Fix prompts — competitor wins by ≥30pts (Screen 3) ─
    # Impact=9, Effort=7, Urgency=8+mod
    seen_comps_for_comparison: set = set()
    for r in detailed:
        if r.get("winner") != "competitor":
            continue
        gap_score = float(r.get("coverage_gap_score") or 0)
        winner_name = str(r.get("winner_name") or "").strip()
        prompt_text = str(r.get("prompt") or "").strip()
        if gap_score < 30 or not winner_name or not prompt_text:
            continue

        issues.append({
            "rec_id":         str(uuid4()),
            "module":         "competitor",
            "action_title":   f"Target prompt: \"{prompt_text}\"",
            "action_detail":  (
                f"{winner_name} outranks {brand_name} by {gap_score:.0f}pts on this query. "
                f"Rewrite or create a page with: answer-first intro, structured comparison table vs {winner_name}, "
                f"FAQ block with 5+ Q&A pairs, entity-rich body (mention: features, use cases, pricing signals). "
                f"Ensure the page is linked from your homepage nav or main services hub."
            ),
            "affected_urls":  [],
            "impact":         9.0,
            "effort_raw":     7.0,
            "urgency":        min(10.0, 8.0 + u_mod),
            "role_visibility": ["cmo", "seo_manager", "content_manager"],
            "gap_type":       "priority_fix",
            "competitor":     winner_name,
        })

        # Also create a comparison page issue for each unique competitor (once)
        if winner_name not in seen_comps_for_comparison:
            seen_comps_for_comparison.add(winner_name)
            issues.append({
                "rec_id":         str(uuid4()),
                "module":         "competitor",
                "action_title":   f"Create comparison page: {brand_name} vs {winner_name}",
                "action_detail":  (
                    f"{winner_name} is winning {gap_score:.0f}pts ahead of you on competitive prompts. "
                    f"Build a dedicated /vs/{winner_name.lower().replace(' ', '-')} page with: "
                    f"feature comparison table, pricing comparison, use-case fit matrix, "
                    f"customer testimonial block, and FAQ (5+ Q&A). Add HowTo + FAQ schema. "
                    f"Target keywords: \"{brand_name} vs {winner_name}\", \"{winner_name} alternative\"."
                ),
                "affected_urls":  [f"/vs/{winner_name.lower().replace(' ', '-')}"],
                "impact":         8.0,
                "effort_raw":     7.0,
                "urgency":        min(10.0, 7.0 + u_mod),
                "role_visibility": ["cmo", "seo_manager", "content_manager"],
                "gap_type":       "comparison_page",
                "competitor":     winner_name,
            })
        if len([i for i in issues if i.get("gap_type") == "priority_fix"]) >= 3:
            break

    # ── Issue 3: Competitor AIVS surged (Screen 1 + emerging trends) ──────
    # SOP §3.3: +3 urgency on competitor threat
    for change in comp_changes:
        if (change.get("status") in ("rising", "new")
                and float(change.get("delta_visibility") or 0) >= 5):
            comp_name = str(change.get("name") or "").strip()
            delta_v = float(change.get("delta_visibility") or 0)
            issues.append({
                "rec_id":         str(uuid4()),
                "module":         "competitor",
                "action_title":   f"Respond to {comp_name}'s +{delta_v:.0f}pt visibility surge",
                "action_detail":  (
                    f"{comp_name} gained {delta_v:.0f}pts of AI visibility this period — they are rising. "
                    f"Audit their top-cited pages and identify what content type drove the gain. "
                    f"Replicate the structure (FAQ block, comparison table, or guide format) on your equivalent pages. "
                    f"Publish within 14 days before the gain compounds."
                ),
                "affected_urls":  [],
                "impact":         8.0,
                "effort_raw":     6.0,
                "urgency":        min(10.0, 8.0 + u_mod + 3.0),  # +3 competitor surge
                "role_visibility": ["cxo", "cmo", "seo_manager"],
                "gap_type":       "competitor_surge",
                "competitor":     comp_name,
            })

    # ── Issue 4: Low brand win rate (<30%) (Screen 3 summary) ─────────────
    brand_win_rate = float(summary.get("brand_win_rate") or 0)
    total_prompts = int(summary.get("total_prompts") or 0)
    if brand_win_rate < 30 and total_prompts >= 3:
        issues.append({
            "rec_id":         str(uuid4()),
            "module":         "competitor",
            "action_title":   f"Improve answer quality on {total_prompts} tracked prompts",
            "action_detail":  (
                f"Brand win rate is {brand_win_rate:.0f}% ({int(summary.get('brand_wins',0))}/{total_prompts} prompts). "
                f"Audit your worst-performing pages: ensure each has an answer-first intro (first 150 words answer the query directly), "
                f"a structured list or table, entity coverage (brand name + product/feature entities), "
                f"and a clear FAQ block. Priority: fix the 3 prompts with the highest gap score first."
            ),
            "affected_urls":  [],
            "impact":         8.0,
            "effort_raw":     6.0,
            "urgency":        min(10.0, 7.0 + u_mod),
            "role_visibility": ["cmo", "seo_manager", "content_manager"],
            "gap_type":       "win_rate",
            "competitor":     None,
        })

    # ── Issue 5: High-DA citation source competitor gets that you don't (Screen 4)
    # Impact=8, Effort=7, Urgency=6+mod
    if sources:
        top_source = max(sources, key=lambda s: float(s.get("source_domain_influence_score") or 0))
        top_cites = (top_source.get("citation_frequency") or [])
        if top_cites:
            top_domain = top_cites[0].get("domain", "")
            comp_name = top_source.get("competitor", "top competitor")
            avg_da = float(top_source.get("average_domain_authority") or 0)
            if avg_da >= 60:
                issues.append({
                    "rec_id":         str(uuid4()),
                    "module":         "competitor",
                    "action_title":   f"Earn citation from {top_domain} (DA {avg_da:.0f})",
                    "action_detail":  (
                        f"{comp_name} is cited by {top_domain} (DA {avg_da:.0f}) — a high-authority source "
                        f"that AI models trust. To earn a citation here: "
                        f"(1) Create a data-backed asset or original research targeting their editorial topics. "
                        f"(2) Pitch their editorial team with a unique data angle. "
                        f"(3) Get listed in their tool/resource directory if one exists. "
                        f"Even one high-DA citation from {top_domain} adds significant AI citation trust weight."
                    ),
                    "affected_urls":  [],
                    "impact":         8.0,
                    "effort_raw":     8.0,
                    "urgency":        min(10.0, 6.0 + u_mod),
                    "role_visibility": ["cmo", "seo_manager"],
                    "gap_type":       "citation_gap",
                    "competitor":     comp_name,
                })

    # ── Issue 6: Brand visibility very low (<40) ──────────────────────────
    brand_vis = float(brand.get("visibility_score") or 0)
    if brand_vis < 40:
        issues.append({
            "rec_id":         str(uuid4()),
            "module":         "competitor",
            "action_title":   f"Add FAQ schema to top landing pages (visibility: {brand_vis:.0f}/100)",
            "action_detail":  (
                f"Brand AI visibility is {brand_vis:.0f}/100 — below the competitive threshold. "
                f"The fastest lift action: add FAQ schema (JSON-LD) to your 5 most-visited pages. "
                f"Each FAQ block should contain 5-8 Q&A pairs that directly match tracked prompts. "
                f"Estimated lift: +3-6pts AI visibility within 2 crawl cycles. "
                f"No-code action: content team can execute with a schema plugin or CMS field."
            ),
            "affected_urls":  [],
            "impact":         7.0,
            "effort_raw":     3.0,   # low effort = high effort_inv → rises in ranking
            "urgency":        min(10.0, 7.0 + u_mod),
            "role_visibility": ["seo_manager", "content_manager"],
            "gap_type":       "schema",
            "competitor":     None,
        })

    # ── Issue 7: Score dropped vs previous run (Screen 1 delta) ───────────
    if brand_score_delta < -5:
        issues.append({
            "rec_id":         str(uuid4()),
            "module":         "competitor",
            "action_title":   f"Recover from -{abs(brand_score_delta):.0f}pt benchmark score drop",
            "action_detail":  (
                f"Benchmark score dropped {abs(brand_score_delta):.0f}pts vs the previous run. "
                f"Root cause: check which prompts flipped from 'brand wins' to 'competitor wins' since last run. "
                f"For each flipped prompt: (1) verify the page still exists and is indexed, "
                f"(2) ensure the entity match is strong (brand name, product name both present), "
                f"(3) check if a competitor published a new page targeting that query. "
                f"Re-run analysis in 7 days after making content updates."
            ),
            "affected_urls":  [],
            "impact":         9.0,
            "effort_raw":     5.0,
            "urgency":        min(10.0, 9.0 + u_mod),  # elevated: active drop
            "role_visibility": ["cxo", "cmo", "seo_manager"],
            "gap_type":       "score_drop",
            "competitor":     None,
        })

    # ── Issue 8: Near-uncontested prompts (rank 4-6) — easy to own ────────
    near_uncontested: List[Dict[str, Any]] = []
    for gap in gap_analysis:
        for opp in (gap.get("opportunities") or []):
            rank = opp.get("rank")
            if rank is not None and 4 <= rank <= 6:
                near_uncontested.append({
                    "prompt": opp.get("prompt", ""),
                    "competitor": gap.get("competitor", ""),
                    "rank": rank,
                })
    if near_uncontested:
        top_near = near_uncontested[0]
        issues.append({
            "rec_id":         str(uuid4()),
            "module":         "competitor",
            "action_title":   f"Improve ranking for near-uncontested prompt: \"{top_near['prompt'][:60]}\"",
            "action_detail":  (
                f"{top_near['competitor']} ranks #{top_near['rank']} on this query — weak hold. "
                f"You can overtake with a targeted content refresh: "
                f"add a dedicated H2 section answering the query directly, "
                f"include 3+ supporting data points, and add a FAQ block with this prompt as the first question. "
                f"Internal link from 2+ related pages. Effort: 1-2 hours. "
                f"Total near-uncontested prompts available: {len(near_uncontested)}."
            ),
            "affected_urls":  [],
            "impact":         7.0,
            "effort_raw":     4.0,
            "urgency":        min(10.0, 6.0 + u_mod),
            "role_visibility": ["seo_manager", "content_manager"],
            "gap_type":       "near_uncontested",
            "competitor":     top_near["competitor"],
        })

    # ── Issue 9: Entity consistency (always included as P3) ───────────────
    issues.append({
        "rec_id":         str(uuid4()),
        "module":         "competitor",
        "action_title":   "Strengthen entity consistency across all pages",
        "action_detail":  (
            f"Ensure '{brand_name}' appears consistently across: site title tags, meta descriptions, "
            f"about/home page body text, Google Business Profile, Wikipedia (if applicable), "
            f"Crunchbase/LinkedIn company page, and any cited press mentions. "
            f"Inconsistent entity signals are a primary reason AI models fail to cite a brand reliably. "
            f"Effort: 2-4 hours audit + fixes. Impact compounds across all AI models simultaneously."
        ),
        "affected_urls":  [],
        "impact":         6.0,
        "effort_raw":     3.0,
        "urgency":        min(10.0, 5.0 + u_mod),
        "role_visibility": ["seo_manager", "content_manager"],
        "gap_type":       "entity_consistency",
        "competitor":     None,
    })

    # ── Issue 10: Model-specific gap (SOP §3 Screen 2) ────────────────────
    # Detect models where brand ranks significantly worse than on its best model.
    # e.g. brand is #1 on Perplexity but #4 on ChatGPT → generate targeted action.
    brand_per_model = (comparison.get("brand") or {}).get("per_model") or {}
    model_ranks: List[Tuple[str, int]] = []
    for mdl, stats in brand_per_model.items():
        rank = stats.get("rank")
        if isinstance(rank, int) and rank > 0:
            model_ranks.append((mdl, rank))

    if len(model_ranks) >= 2:
        model_ranks.sort(key=lambda x: x[1])   # ascending: best rank first
        best_model, best_rank = model_ranks[0]
        worst_model, worst_rank = model_ranks[-1]
        rank_spread = worst_rank - best_rank
        if rank_spread >= 2:
            issues.append({
                "rec_id":         str(uuid4()),
                "module":         "competitor",
                "action_title":   f"Close {rank_spread}-rank gap on {worst_model} (rank #{worst_rank} vs #{best_rank} on {best_model})",
                "action_detail":  (
                    f"Brand ranks #{best_rank} on {best_model} but #{worst_rank} on {worst_model} — "
                    f"a {rank_spread}-position gap. This is a model-specific citation pattern issue. "
                    f"To improve {worst_model} specifically: "
                    f"(1) Check which content types {worst_model} prefers citing (guides vs comparisons vs tools). "
                    f"(2) Publish a page in that format targeting your top 3 prompt queries. "
                    f"(3) Ensure your brand appears in {worst_model}'s trusted sources — "
                    f"earn citations from domains {worst_model} already cites in your niche. "
                    f"(4) Add structured data that {worst_model} is known to favour (FAQ, HowTo, or Product schema)."
                ),
                "affected_urls":  [],
                "impact":         7.5,
                "effort_raw":     6.0,
                "urgency":        min(10.0, 6.0 + u_mod),
                "role_visibility": ["cmo", "seo_manager", "content_manager"],
                "gap_type":       "model_gap",
                "competitor":     None,
                "model_detail":   {
                    "best_model":  best_model,
                    "best_rank":   best_rank,
                    "worst_model": worst_model,
                    "worst_rank":  worst_rank,
                    "rank_spread": rank_spread,
                },
            })

    return issues


# ─────────────────────────────────────────────────────────────────────────────
# L3 — PRIORITY RESOLVER: apply IEU formula, sort, deduplicate
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_priorities(issues: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for issue in issues:
        issue["priority_score"] = _priority_score(
            issue["impact"], issue["effort_raw"], issue["urgency"]
        )
    issues.sort(key=lambda x: -x["priority_score"])

    # Deduplicate by action title prefix
    seen: set = set()
    unique: List[Dict[str, Any]] = []
    for issue in issues:
        key = issue["action_title"][:50].lower()
        if key not in seen:
            seen.add(key)
            unique.append(issue)
    return unique


# ─────────────────────────────────────────────────────────────────────────────
# L4 — ROLE PERSONALIZATION (SOP §4)
# ─────────────────────────────────────────────────────────────────────────────

def _filter_by_role(issues: List[Dict[str, Any]], role: str) -> List[Dict[str, Any]]:
    """Filter and limit issue list by user role."""
    role_lower = role.lower().replace(" ", "_")
    return [i for i in issues if role_lower in (i.get("role_visibility") or [])]


def _format_for_role(
    issues: List[Dict[str, Any]],
    role: str,
    delta_class: str,
    brand_name: str,
    brand_vis: float,
    brand_score_delta: float,
    brand_win_rate: float,
) -> Dict[str, Any]:
    """
    SOP §4.1-4.4 — role-specific output format.
    CXO: 3-item executive brief  
    CMO: 5-item content priority brief
    SEO Manager: sprint-ready backlog (10 items)
    Content Manager: content brief with entity guidance
    Analyst: trend analysis with data
    """
    role_lower = role.lower().replace(" ", "_")

    top_items = issues[:10]  # cap before role-specific limit

    def _fmt_item(issue: Dict[str, Any], idx: int) -> Dict[str, Any]:
        return {
            "index":          idx + 1,
            "rec_id":         issue["rec_id"],
            "module":         issue["module"],
            "action_title":   issue["action_title"],
            "action_detail":  issue["action_detail"],
            "affected_urls":  issue["affected_urls"],
            "impact_score":   issue["impact"],
            "effort_score":   round(11.0 - issue["effort_raw"], 1),  # inverted for display
            "urgency_score":  issue["urgency"],
            "priority_score": issue["priority_score"],
            "gap_type":       issue.get("gap_type"),
            "competitor":     issue.get("competitor"),
            "status":         "pending",
        }

    if role_lower == "cxo":
        # SOP §4.2 — CXO card: 3-item executive brief
        top3 = top_items[:3]
        return {
            "role":        "cxo",
            "format":      "executive_brief",
            "headline":    f"AI Visibility Brief — {brand_name}",
            "summary":     (
                f"Benchmark score change: {'+' if brand_score_delta >= 0 else ''}{brand_score_delta:.1f}pts. "
                f"Visibility: {brand_vis:.0f}/100. "
                f"Win rate: {brand_win_rate:.0f}% of tracked prompts. "
                f"Delta class: {delta_class.replace('_', ' ').title()}."
            ),
            "top_risk":    top3[0]["action_title"] if top3 else "No critical issues detected",
            "actions":     [_fmt_item(i, idx) for idx, i in enumerate(top3)],
        }

    if role_lower == "cmo":
        # SOP §4.1 — CMO: 5-item content priority brief
        top5 = top_items[:5]
        return {
            "role":    "cmo",
            "format":  "content_priority_brief",
            "headline": f"Content Investment Priorities — {brand_name}",
            "summary":  (
                f"Win rate {brand_win_rate:.0f}% | Visibility {brand_vis:.0f}/100 | "
                f"Delta: {'+' if brand_score_delta >= 0 else ''}{brand_score_delta:.1f}pts"
            ),
            "actions": [_fmt_item(i, idx) for idx, i in enumerate(top5)],
        }

    if role_lower == "seo_manager":
        # SOP §4.3 — Sprint backlog: 10 items, verb-first, with URLs + effort hrs
        effort_hrs_map = {1.0: 1, 2.0: 1, 3.0: 2, 4.0: 3, 5.0: 4, 6.0: 8, 7.0: 16, 8.0: 24, 9.0: 40, 10.0: 60}
        sprint_items = []
        for idx, issue in enumerate(top_items[:10]):
            item = _fmt_item(issue, idx)
            item["effort_hours"] = effort_hrs_map.get(issue["effort_raw"], 8)
            item["dependency"] = "developer" if issue["effort_raw"] >= 8 else "content_team"
            sprint_items.append(item)
        return {
            "role":    "seo_manager",
            "format":  "sprint_backlog",
            "headline": f"Sprint Backlog — Competitive Citation Benchmarking",
            "summary":  f"{len(sprint_items)} actions | Delta: {delta_class.replace('_', ' ').title()}",
            "actions": sprint_items,
        }

    if role_lower == "content_manager":
        # SOP §4.4 — Content briefs: execution-ready with entity + structure guidance
        content_items = [i for i in top_items if i.get("gap_type") in
                         ("uncontested", "priority_fix", "comparison_page", "near_uncontested", "win_rate")][:7]
        return {
            "role":    "content_manager",
            "format":  "content_brief",
            "headline": f"Content Actions — {brand_name}",
            "summary":  f"{len(content_items)} content tasks ready to execute",
            "actions": [_fmt_item(i, idx) for idx, i in enumerate(content_items)],
        }

    # Analyst — trend analysis with full data
    return {
        "role":    role_lower or "analyst",
        "format":  "trend_analysis",
        "headline": f"Recommendation Data — {brand_name}",
        "summary":  f"{len(top_items)} issues ranked by IEU priority score",
        "actions": [_fmt_item(i, idx) for idx, i in enumerate(top_items)],
    }


# ─────────────────────────────────────────────────────────────────────────────
# L5 — DELIVERY ENGINE (plan-tier limits + final output object)
# ─────────────────────────────────────────────────────────────────────────────

def generate_moat7_recommendations(
    comparison: Dict[str, Any],
    competitor_wins: Dict[str, Any],
    gap_analysis: List[Dict[str, Any]],
    source_analysis: Dict[str, Any],
    emerging_trends: Dict[str, Any],
    plan: str = "agency",
    role: str = "seo_manager",
    days_since_last_run: int = 7,
) -> Dict[str, Any]:
    """
    Master entry point.
    Call from runner.py after all MOAT 7 steps complete.

    Returns:
        {
            delta_class,
            role_output,       ← role-formatted recommendations
            all_actions,       ← full ranked list (for UI consumption)
            generated_at,
        }
    """
    brand = comparison.get("brand") or {}
    # score_delta is attached by runner._attach_deltas() after leaderboard delta
    # computation. If not present (first run), fall back to 0.
    brand_score_delta = float(brand.get("score_delta") or 0)
    brand_vis_delta = float(brand.get("score_delta") or 0)  # proxy until trend history builds
    brand_win_rate = float((competitor_wins.get("summary") or {}).get("brand_win_rate") or 0)
    brand_vis = float(brand.get("visibility_score") or 0)
    brand_name = str(brand.get("name") or "Brand")

    comp_changes = (emerging_trends.get("competitor_changes") or [])
    max_competitor_gain = max(
        (float(c.get("delta_visibility") or 0) for c in comp_changes if
         float(c.get("delta_visibility") or 0) > 0),
        default=0.0,
    )
    any_flip = any(
        sw.get("to") == "competitor"
        for sw in (emerging_trends.get("prompt_swings") or [])
    )

    # L1 — Delta classification
    delta_class = _classify_delta(
        brand_score_delta, brand_vis_delta, max_competitor_gain,
        any_flip, days_since_last_run, brand_win_rate,
    )

    # L2 — Build issue registry
    issues = _build_issues(
        comparison, competitor_wins, gap_analysis,
        source_analysis, emerging_trends,
        delta_class, brand_score_delta, days_since_last_run,
    )

    # L3 — Priority sort (IEU)
    ranked_issues = _resolve_priorities(issues)

    # L5 — Apply plan tier limit
    limit = PLAN_REC_LIMITS.get(plan.lower(), 10)
    ranked_issues = ranked_issues[:limit]

    # L4 — Role personalisation
    role_filtered = _filter_by_role(ranked_issues, role)
    role_output = _format_for_role(
        role_filtered, role, delta_class,
        brand_name, brand_vis, brand_score_delta, brand_win_rate,
    )

    return {
        "delta_class":   delta_class,
        "role_output":   role_output,
        "all_actions":   [
            {
                "rec_id":         i["rec_id"],
                "module":         i["module"],
                "action_title":   i["action_title"],
                "action_detail":  i["action_detail"],
                "affected_urls":  i["affected_urls"],
                "impact_score":   i["impact"],
                "effort_score":   round(11.0 - i["effort_raw"], 1),
                "urgency_score":  i["urgency"],
                "priority_score": i["priority_score"],
                "gap_type":       i.get("gap_type"),
                "competitor":     i.get("competitor"),
                "role_visibility": i.get("role_visibility"),
                "status":         "pending",
                "created_at":     datetime.utcnow().isoformat(),
            }
            for i in ranked_issues
        ],
        "generated_at": datetime.utcnow().isoformat(),
    }
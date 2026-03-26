"""
C8 — Page-Level Improvement Actions

Aggregates all gaps from C1–C7 and produces:
  Field 1: Number of recommended actions (de-duplicated)
  Field 2: Priority (High/Medium/Low) — derived from AIVS dimension weights
  Field 3: Predicted improvement in LLM-Friendliness Score (delta simulation)
"""

import logging
from typing import Any, Dict, List

logger = logging.getLogger("module_c.c8")


# ═════════════════════════════════════════════════════════════════════════════
#  Pre-computed improvement deltas per action type
# ═════════════════════════════════════════════════════════════════════════════

IMPROVEMENT_DELTAS = {
    "add_faqpage_schema":          {"component": "schema_score", "delta": 14.0},
    "add_organization_schema":     {"component": "schema_score", "delta": 14.0},
    "add_article_schema":          {"component": "schema_score", "delta": 14.0},
    "add_howto_schema":            {"component": "schema_score", "delta": 14.0},
    "add_product_schema":          {"component": "schema_score", "delta": 14.0},
    "add_breadcrumblist_schema":   {"component": "schema_score", "delta": 14.0},
    "add_webpage_schema":          {"component": "schema_score", "delta": 14.0},
    "fix_schema_validation_error": {"component": "schema_score", "delta": 20.0},
    "add_faq_section":             {"component": "structure_score", "delta": 20.0},
    "add_comparison_table":        {"component": "structure_score", "delta": 20.0},
    "add_numbered_list":           {"component": "structure_score", "delta": 15.0},
    "add_tldr":                    {"component": "structure_score", "delta": 15.0},
    "add_critical_entity":         {"component": "content_score", "delta": 8.0},
    "answer_unanswered_question":  {"component": "content_score", "delta": 10.0},
    "add_author_attribution":      {"component": "content_score", "delta": 10.0},
    "add_publication_date":        {"component": "content_score", "delta": 10.0},
    "add_external_citations":      {"component": "content_score", "delta": 10.0},
    "fix_noindex_error":           {"component": "tech_hygiene", "delta": 25.0},
    "fix_canonical":               {"component": "tech_hygiene", "delta": 25.0},
    "add_internal_links":          {"component": "tech_hygiene", "delta": 25.0},
    "add_llms_txt":                {"component": "crawl_access", "delta": 30.0},
    "convert_js_to_static":        {"component": "crawl_access", "delta": 30.0},
    "allow_ai_bots":               {"component": "crawl_access", "delta": 20.0},
    "improve_page_speed":          {"component": "crawl_access", "delta": 15.0},
}

# Weights for the LLM Friendliness composite formula
COMPONENT_WEIGHTS = {
    "crawl_access":    0.15,
    "schema_score":    0.25,
    "content_score":   0.35,
    "tech_hygiene":    0.15,
    "structure_score": 0.10,
}


# ═════════════════════════════════════════════════════════════════════════════
#  Field 1 — Generate actions from C1–C7 outputs
# ═════════════════════════════════════════════════════════════════════════════

def _generate_actions(
    c1_output: Dict[str, Any],
    c3_output: Dict[str, Any],
    c4_output: Dict[str, Any],
    c6_output: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Aggregate all gaps from C1–C7 into de-duplicated action list."""
    actions: List[Dict[str, Any]] = []
    seen: set = set()

    def _add(action_type: str, description: str, aivs_dim: str, dim_weight: float,
             category: str, competitor_has_it: bool = False):
        key = (action_type, description[:80])
        if key in seen:
            return
        seen.add(key)
        actions.append({
            "action_type": action_type,
            "action": description,
            "category": category,
            "aivs_dimension": aivs_dim,
            "dimension_weight": dim_weight,
            "competitor_has_it": competitor_has_it,
        })

    # ── From C1 — Schema gaps ────────────────────────────────────────────
    missing_types = c1_output.get("structured_data", {}).get("missing_types", [])
    schema_type_to_action = {
        "FAQPage": "add_faqpage_schema",
        "Organization": "add_organization_schema",
        "Article": "add_article_schema",
        "HowTo": "add_howto_schema",
        "Product": "add_product_schema",
        "BreadcrumbList": "add_breadcrumblist_schema",
        "WebPage": "add_webpage_schema",
    }
    for mt in missing_types:
        at = schema_type_to_action.get(mt)
        if at:
            _add(at, f"Add {mt} schema markup", "D2", 0.15, "structured_data")

    if c1_output.get("structured_data", {}).get("error_count", 0) > 0:
        _add("fix_schema_validation_error", "Fix JSON-LD schema validation errors",
             "D2", 0.15, "structured_data")

    # ── From C1 — Crawl access ───────────────────────────────────────────
    crawl = c1_output.get("sub_scores", {}).get("crawl_access", {})
    if crawl.get("bots_allowed", 4) < 4:
        _add("allow_ai_bots", "Unblock AI bots (GPTBot, ClaudeBot, etc.) in robots.txt",
             "D1", 0.12, "crawl_access")
    if crawl.get("js_rendered", False):
        _add("convert_js_to_static", "Serve static HTML (not JS-rendered) for LLM crawlers",
             "D1", 0.12, "crawl_access")
    if crawl.get("speed_pts", 30) < 15:
        _add("improve_page_speed", "Improve page response time to < 1.2s",
             "D1", 0.12, "crawl_access")

    # ── From C1 — E-E-A-T gaps ───────────────────────────────────────────
    content = c1_output.get("sub_scores", {}).get("content", {})
    if content.get("eeat_score", 100) < 80:
        if content.get("eeat_score", 100) < 40:
            _add("add_author_attribution", "Add author name and bio to page",
                 "D3", 0.18, "eeat")
            _add("add_publication_date", "Add publication/last-updated date",
                 "D3", 0.18, "eeat")
        _add("add_external_citations", "Add outbound links to authoritative studies/sources",
             "D3", 0.18, "eeat")

    # ── From C1 — Structure gaps ─────────────────────────────────────────
    structure = c1_output.get("sub_scores", {}).get("structure", {})
    if structure.get("signal_count", 0) < 3:
        found = set(structure.get("signals_found", []))
        if "faq" not in found:
            _add("add_faq_section", "Add FAQ section with question-format H2/H3 headings",
                 "D3", 0.18, "content_structure")
        if "comparison_table" not in found:
            _add("add_comparison_table", "Add comparison table",
                 "D3", 0.18, "content_structure")
        if "tldr" not in found:
            _add("add_tldr", "Add TL;DR or Key Takeaways summary block",
                 "D3", 0.18, "content_structure")

    # ── From C1 — Tech hygiene gaps ──────────────────────────────────────
    tech = c1_output.get("sub_scores", {}).get("tech_hygiene", {})
    if not tech.get("canonical_ok", True):
        _add("fix_canonical", "Fix canonical tag to be self-referential",
             "D6", 0.10, "tech_hygiene")
    if tech.get("has_noindex", False):
        _add("fix_noindex_error", "Remove noindex directive from page",
             "D6", 0.10, "tech_hygiene")
    if tech.get("internal_link_count", 10) < 3:
        _add("add_internal_links", "Add internal links (target ≥ 3 per page)",
             "D6", 0.10, "tech_hygiene")

    # ── From C3 — Missing entities ───────────────────────────────────────
    critical_missing = c3_output.get("critical_missing", [])
    for ent in critical_missing[:5]:
        _add(
            "add_critical_entity",
            f'Add content referencing "{ent.get("name", "")}" ({ent.get("type", "")})',
            "D3", 0.18, "entity_coverage",
        )

    # ── From C4 — Unanswered questions ───────────────────────────────────
    missing_qs = c4_output.get("missing_questions", [])
    for q in missing_qs[:5]:
        _add("answer_unanswered_question", f'Add content answering: "{q}"',
             "D3", 0.18, "answer_completeness")

    return actions


# ═════════════════════════════════════════════════════════════════════════════
#  Field 2 — Priority assignment (AIVS-weight-derived, NOT opinion)
# ═════════════════════════════════════════════════════════════════════════════

def _assign_priority(action: Dict[str, Any]) -> str:
    """
    HIGH: dim_weight >= 0.15 OR answer_completeness/entity_coverage OR competitor has it
    MEDIUM: dim_weight 0.12–0.14 OR important entities
    LOW: D6 (10%) or minor
    """
    dim_weight = action.get("dimension_weight", 0)
    category = action.get("category", "")

    # HIGH
    if action.get("competitor_has_it", False):
        return "High"
    if dim_weight >= 0.15:
        return "High"
    if category in ("answer_completeness", "entity_coverage"):
        return "High"

    # MEDIUM
    if 0.12 <= dim_weight < 0.15:
        return "Medium"

    # LOW
    return "Low"


# ═════════════════════════════════════════════════════════════════════════════
#  Field 3 — Predicted improvement delta
# ═════════════════════════════════════════════════════════════════════════════

def _predict_improvement(
    actions: List[Dict[str, Any]],
    current_sub_scores: Dict[str, Dict[str, Any]],
) -> float:
    """
    Simulate applying all actions and recompute composite.
    Returns the predicted delta in LLM-Friendliness Score.
    """
    # Extract current component scores
    simulated = {
        "crawl_access":    current_sub_scores.get("crawl_access", {}).get("total", 50),
        "schema_score":    current_sub_scores.get("schema", {}).get("total", 50),
        "content_score":   current_sub_scores.get("content", {}).get("total", 50),
        "tech_hygiene":    current_sub_scores.get("tech_hygiene", {}).get("total", 50),
        "structure_score": current_sub_scores.get("structure", {}).get("total", 50),
    }

    for action in actions:
        action_type = action.get("action_type", "")
        delta_info = IMPROVEMENT_DELTAS.get(action_type)
        if delta_info:
            component = delta_info["component"]
            if component in simulated:
                simulated[component] = min(100, simulated[component] + delta_info["delta"])

    predicted = sum(
        simulated[comp] * weight
        for comp, weight in COMPONENT_WEIGHTS.items()
    )

    current = sum(
        current_sub_scores.get(
            comp.replace("_score", ""), current_sub_scores.get(comp, {})
        ).get("total", 50) * weight
        if isinstance(current_sub_scores.get(comp.replace("_score", ""), current_sub_scores.get(comp, {})), dict)
        else 50 * weight
        for comp, weight in COMPONENT_WEIGHTS.items()
    )

    # Simpler current calculation
    current_vals = {
        "crawl_access":    current_sub_scores.get("crawl_access", {}).get("total", 50),
        "schema_score":    current_sub_scores.get("schema", {}).get("total", 50),
        "content_score":   current_sub_scores.get("content", {}).get("total", 50),
        "tech_hygiene":    current_sub_scores.get("tech_hygiene", {}).get("total", 50),
        "structure_score": current_sub_scores.get("structure", {}).get("total", 50),
    }
    current_composite = sum(current_vals[c] * w for c, w in COMPONENT_WEIGHTS.items())

    return round(predicted - current_composite, 1)


# ═════════════════════════════════════════════════════════════════════════════
#  Run C8
# ═════════════════════════════════════════════════════════════════════════════

def run_c8(
    c1_output: Dict[str, Any],
    c3_output: Dict[str, Any],
    c4_output: Dict[str, Any],
    c6_output: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Run C8 Page-Level Improvement Actions.

    Args:
        c1_output: Output from run_c1().
        c3_output: Output from run_c3().
        c4_output: Output from run_c4().
        c6_output: Output from run_c6().

    Returns:
        actions list with priority and predicted improvement.
    """
    actions = _generate_actions(c1_output, c3_output, c4_output, c6_output)

    # Assign priority
    for action in actions:
        action["priority"] = _assign_priority(action)

    # Sort: High → Medium → Low
    priority_order = {"High": 0, "Medium": 1, "Low": 2}
    actions.sort(key=lambda a: priority_order.get(a["priority"], 3))

    # Predicted improvement
    sub_scores = c1_output.get("sub_scores", {})
    predicted_delta = _predict_improvement(actions, sub_scores)

    high_count = sum(1 for a in actions if a["priority"] == "High")
    medium_count = sum(1 for a in actions if a["priority"] == "Medium")
    low_count = sum(1 for a in actions if a["priority"] == "Low")

    return {
        "total_actions": len(actions),
        "high_priority": high_count,
        "medium_priority": medium_count,
        "low_priority": low_count,
        "predicted_llm_friendliness_delta": predicted_delta,
        "current_llm_friendliness": c1_output.get("llm_friendliness_score", 0),
        "predicted_llm_friendliness": round(
            c1_output.get("llm_friendliness_score", 0) + predicted_delta, 1
        ),
        "actions": actions,
    }

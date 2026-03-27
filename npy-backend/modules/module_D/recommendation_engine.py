"""
Colytics AI — Recommendation Engine (Moat #4)
generate_prompt_recommendations() method for ClaudeService

Implements the full IEU (Impact × Effort × Urgency) matrix from
Moat #4 SOP, consuming scores produced by SOP-002 Prompt Monitoring Layer.

Priority Formula (from Moat #4 Section 3.1):
    Priority Score = (Impact × 0.50) + (Effort_Inverted × 0.30) + (Urgency × 0.20)
    Effort_Inverted = 11 - Effort_Raw  (low effort = high score)
    Final range: 0–10, ranked descending.

Add this method to your existing ClaudeService class in contentAnylsisMatrix.py
"""

from typing import Dict, List, Optional
import logging


# ---------------------------------------------------------------------------
# IEU Rule Library  (Moat #4 Section 3.2)
# Each rule maps a condition on the prompt metrics to an action card.
# Fields: module, condition_key, condition_fn, action_title, action_detail,
#         impact_range, effort_raw, base_urgency, roles
# ---------------------------------------------------------------------------

_IEU_RULES = [
    {
        "rule_id": "PROMPT_ZERO_VISIBILITY",
        "module": "prompt_intel",
        "action_title": "Add direct answer block to this page",
        "action_detail": (
            "Prompt visibility is critically low (<25). "
            "Restructure the page with a clear FAQ or TL;DR block at the top "
            "that directly answers this prompt. Use H2 headings that echo the "
            "exact query language. Add schema markup for FAQPage or HowTo."
        ),
        "impact_raw": 9,
        "effort_raw": 4,
        "base_urgency": 8,
        "roles": ["SEO Manager", "Content Manager"],
        "condition": lambda m: m.get("prompt_visibility_score", 100) < 25,
    },
    {
        "rule_id": "PROMPT_LOW_VISIBILITY",
        "module": "prompt_intel",
        "action_title": "Improve intent match for this prompt",
        "action_detail": (
            "Visibility score is low (25–50). Add topical depth: include "
            "supporting facts, named entities, and clear definitions. "
            "Strengthen internal links from high-authority pages to this URL. "
            "Target at least 3 semantic variants of this prompt in headings."
        ),
        "impact_raw": 7,
        "effort_raw": 5,
        "base_urgency": 6,
        "roles": ["SEO Manager", "Content Manager"],
        "condition": lambda m: 25 <= m.get("prompt_visibility_score", 100) < 50,
    },
    {
        "rule_id": "PROMPT_LOW_CTR",
        "module": "prompt_intel",
        "action_title": "Rewrite page snippet for higher click-through",
        "action_detail": (
            "CTR is below 5%. The AI snippet for this prompt is not compelling. "
            "Rewrite the meta description and opening paragraph to include a "
            "concise direct answer in the first 25 words. "
            "Add a numbered list or stat that stands out in AI-generated summaries."
        ),
        "impact_raw": 6,
        "effort_raw": 3,
        "base_urgency": 5,
        "roles": ["Content Manager", "SEO Manager"],
        "condition": lambda m: m.get("ctr_percent", 100) < 5,
    },
    {
        "rule_id": "PROMPT_LOW_ENGAGEMENT",
        "module": "content",
        "action_title": "Add expert signals and credibility markers",
        "action_detail": (
            "Engagement score is below 40. AI models deprioritise pages without "
            "credibility signals. Add: author byline with credentials, at least "
            "2 citations to authoritative sources, original data or a statistic, "
            "and a structured comparison table if the prompt is commercial/comparative."
        ),
        "impact_raw": 7,
        "effort_raw": 5,
        "base_urgency": 5,
        "roles": ["Content Manager", "CMO"],
        "condition": lambda m: m.get("engagement_score", 100) < 40,
    },
    {
        "rule_id": "PROMPT_VISIBILITY_DROPPING",
        "module": "prompt_intel",
        "action_title": "Investigate and reverse visibility decline",
        "action_detail": (
            "Visibility has dropped since the last measurement. Check: "
            "(1) was the page recently edited and key entities removed? "
            "(2) did a competitor publish a stronger answer? "
            "(3) is the page indexed and crawlable? "
            "Run a content gap analysis against the top-cited competitor for this prompt."
        ),
        "impact_raw": 8,
        "effort_raw": 6,
        "base_urgency": 9,
        "roles": ["SEO Manager", "CMO"],
        "condition": lambda m: (
            m.get("visibility_change") is not None
            and m.get("visibility_change", 0) < -5
        ),
    },
    {
        "rule_id": "PROMPT_NO_TRACKING",
        "module": "prompt_intel",
        "action_title": "Start tracking this prompt immediately",
        "action_detail": (
            "No tracking history exists for this prompt. "
            "Without a baseline you cannot measure improvement. "
            "Add it to your tracked prompt list now — this costs 0 effort "
            "and is the prerequisite for all other prompt recommendations."
        ),
        "impact_raw": 6,
        "effort_raw": 1,
        "base_urgency": 8,
        "roles": ["SEO Manager", "Analyst"],
        "condition": lambda m: m.get("visibility_change") is None,
    },
    {
        "rule_id": "PROMPT_HIGH_TRAFFIC_LOW_RANK",
        "module": "prompt_intel",
        "action_title": "Prioritise this high-opportunity prompt in next sprint",
        "action_detail": (
            "Traffic estimate is meaningful but visibility is mid-range (50–70). "
            "This prompt is winnable with focused effort. "
            "Commission a content expansion: add a 200-word section directly "
            "answering this prompt, include 2–3 supporting facts with sources, "
            "and reformat as a scannable FAQ entry."
        ),
        "impact_raw": 8,
        "effort_raw": 5,
        "base_urgency": 6,
        "roles": ["Content Manager", "SEO Manager", "CMO"],
        "condition": lambda m: (
            m.get("traffic_estimate", 0) > 5
            and 50 <= m.get("prompt_visibility_score", 0) < 70
        ),
    },
    {
        "rule_id": "PROMPT_AMPLIFY_WIN",
        "module": "prompt_intel",
        "action_title": "Amplify what is working — replicate this page structure",
        "action_detail": (
            "Visibility score is strong (>75) and improving. "
            "Document the structure of this page (heading pattern, entity density, "
            "schema type, content format) and apply it to your 5 next-highest "
            "priority prompt targets. Do not change this page — protect what is working."
        ),
        "impact_raw": 7,
        "effort_raw": 4,
        "base_urgency": 4,
        "roles": ["Content Manager", "SEO Manager", "CMO"],
        "condition": lambda m: (
            m.get("prompt_visibility_score", 0) > 75
            and (m.get("visibility_change") or 0) > 3
        ),
    },
]


# ---------------------------------------------------------------------------
# Urgency multiplier logic  (Moat #4 Section 3.3)
# ---------------------------------------------------------------------------

def _compute_urgency_multiplier(metrics: Dict, account_context: Dict) -> float:
    """
    Apply urgency boosts from Moat #4 Section 3.3.
    Returns an additive modifier (0–5) applied to base_urgency.
    """
    boost = 0.0

    # Citation score dropped >15%
    citation_drop = account_context.get("citation_score_drop_pct", 0)
    if citation_drop > 15:
        boost += 4.0

    # Client score dropped in past 7 days
    if account_context.get("aivs_dropped_7d", False):
        boost += 2.0

    # Competitor AIVS gained >10pts this week
    if account_context.get("competitor_gained_pts", 0) > 10:
        boost += 3.0

    # Zero actions completed in 14 days
    if account_context.get("days_since_last_action", 0) >= 14:
        boost += 2.0

    # Prompt tracking count is 0
    if account_context.get("total_tracked_prompts", 1) == 0:
        boost += 3.0

    # Last crawl >21 days ago
    if account_context.get("days_since_crawl", 0) > 21:
        boost += 2.0

    return min(boost, 5.0)  # cap so urgency never exceeds 10+5=15→clamped to 10


def _clamp(v: float, lo: float = 0.0, hi: float = 10.0) -> float:
    return max(lo, min(hi, float(v)))


def _ieu_score(impact: float, effort_raw: float, urgency: float) -> float:
    """
    Moat #4 Priority Formula:
        Priority = (Impact × 0.50) + (Effort_Inverted × 0.30) + (Urgency × 0.20)
        Effort_Inverted = 11 - Effort_Raw
    """
    effort_inv = _clamp(11.0 - effort_raw)
    return _clamp(
        (impact * 0.50) + (effort_inv * 0.30) + (urgency * 0.20)
    )


# ---------------------------------------------------------------------------
# Main method — add to ClaudeService
# ---------------------------------------------------------------------------

def generate_prompt_recommendations(
    self,
    job_id: str,
    url: str,
    prompt_metrics: List[Dict],
    account_context: Optional[Dict] = None,
    user_role: str = "SEO Manager",
    plan_tier: str = "pro",
) -> Dict:
    """
    Generate IEU-ranked recommendation action cards for a set of tracked prompts.

    Args:
        job_id:           MongoDB job identifier
        url:              Page URL being analysed
        prompt_metrics:   List of per-prompt metric dicts from
                          calculate_prompt_tracking_metrics().
                          Each dict must contain:
                            prompt, prompt_visibility_score, ctr_percent,
                            engagement_score, traffic_estimate,
                            visibility_change (float | None)
        account_context:  Optional dict with urgency signals:
                            citation_score_drop_pct, aivs_dropped_7d,
                            competitor_gained_pts, days_since_last_action,
                            total_tracked_prompts, days_since_crawl
        user_role:        One of CXO | CMO | SEO Manager |
                          Content Manager | Analyst
        plan_tier:        free | pro | agency | enterprise

    Returns:
        {
          "recommendations": [ ...ranked action cards... ],
          "summary": { total, critical, delta_class, top_module },
          "plan_limit_applied": int,
          "role_filter_applied": str,
        }

    Priority formula: (Impact×0.50) + (Effort_Inverted×0.30) + (Urgency×0.20)
    Fully implements Moat #4 SOP Sections 3.1, 3.2, 3.3, 4.1, 6.2.
    """
    if account_context is None:
        account_context = {}

    # Plan tier delivery limits (Moat #4 Section 6.2)
    tier_limits = {"free": 3, "pro": 10, "agency": 25, "enterprise": 999}
    plan_limit = tier_limits.get(plan_tier, 10)

    urgency_boost = _compute_urgency_multiplier({}, account_context)

    all_cards = []

    for pm in (prompt_metrics or []):
        prompt_text = pm.get("prompt", "Unknown prompt")

        for rule in _IEU_RULES:
            try:
                if not rule["condition"](pm):
                    continue
            except Exception:
                continue

            # Role filter (Moat #4 Section 4.1)
            if user_role not in rule["roles"] and user_role != "CXO":
                # CXO sees everything (strategic summary) — others see role-scoped
                continue

            impact = float(rule["impact_raw"])
            effort_raw = float(rule["effort_raw"])
            urgency = _clamp(float(rule["base_urgency"]) + urgency_boost)

            priority = _ieu_score(impact, effort_raw, urgency)

            # Severity label
            if priority >= 8:
                severity = "CRITICAL"
            elif priority >= 6:
                severity = "HIGH"
            elif priority >= 4:
                severity = "MEDIUM"
            else:
                severity = "LOW"

            card = {
                "recommendation_id": f"{job_id}_{rule['rule_id']}_{hash(prompt_text) % 100000:05d}",
                "prompt": prompt_text,
                "module": rule["module"],
                "action_title": rule["action_title"],
                "action_detail": rule["action_detail"],
                "affected_url": url,
                "impact_score": round(impact, 1),
                "effort_score": round(effort_raw, 1),
                "urgency_score": round(urgency, 1),
                "priority_score": round(priority, 2),
                "severity": severity,
                "role_visibility": rule["roles"],
                "metrics_snapshot": {
                    "prompt_visibility_score": pm.get("prompt_visibility_score"),
                    "ctr_percent": pm.get("ctr_percent"),
                    "engagement_score": pm.get("engagement_score"),
                    "traffic_estimate": pm.get("traffic_estimate"),
                    "visibility_change": pm.get("visibility_change"),
                },
                "status": "pending",
                "trigger_event": (
                    "delta_drop" if (pm.get("visibility_change") or 0) < -5
                    else "plateau" if pm.get("visibility_change") == 0
                    else "improvement" if (pm.get("visibility_change") or 0) > 3
                    else "standard"
                ),
            }
            all_cards.append(card)

    # Deduplicate: if same rule fires for multiple prompts, keep highest priority
    seen_rules: Dict[str, Dict] = {}
    for card in all_cards:
        key = f"{card['module']}_{card['action_title']}"
        if key not in seen_rules or card["priority_score"] > seen_rules[key]["priority_score"]:
            seen_rules[key] = card
        else:
            # Still attach the additional prompt to the existing card
            existing = seen_rules[key]
            if "additional_prompts" not in existing:
                existing["additional_prompts"] = []
            existing["additional_prompts"].append(card["prompt"])

    ranked = sorted(seen_rules.values(), key=lambda c: c["priority_score"], reverse=True)

    # Apply plan tier limit
    ranked = ranked[:plan_limit]

    # Delta classification for summary (Moat #4 Section 2.3)
    aivs_drop = account_context.get("aivs_drop_pts", 0)
    if aivs_drop > 15 or account_context.get("citation_score_drop_pct", 0) > 20:
        delta_class = "CRITICAL DROP"
    elif aivs_drop > 8:
        delta_class = "SIGNIFICANT DROP"
    elif aivs_drop > 2:
        delta_class = "SLOW EROSION"
    elif account_context.get("competitor_gained_pts", 0) > 10:
        delta_class = "COMPETITOR THREAT"
    elif account_context.get("aivs_gain_pts", 0) > 5:
        delta_class = "IMPROVEMENT SIGNAL"
    else:
        delta_class = "PLATEAU"

    critical_count = sum(1 for c in ranked if c["severity"] == "CRITICAL")
    top_module = ranked[0]["module"] if ranked else None

    # Persist to MongoDB
    try:
        from utils.mongo import mongo_manager
        from datetime import datetime
        mongo_manager.connect()
        doc = {
            "jobId": job_id,
            "url": url,
            "recommendations": ranked,
            "summary": {
                "total": len(ranked),
                "critical": critical_count,
                "delta_class": delta_class,
                "top_module": top_module,
                "plan_limit": plan_limit,
                "role_filter": user_role,
            },
            "updatedAt": datetime.utcnow(),
        }
        mongo_manager.db.recommendations.update_one(
            {"jobId": job_id, "url": url},
            {"$set": doc, "$setOnInsert": {"createdAt": datetime.utcnow()}},
            upsert=True,
        )
    except Exception as exc:
        logging.warning("Could not persist recommendations to MongoDB: %s", exc)

    return {
        "recommendations": ranked,
        "summary": {
            "total": len(ranked),
            "critical": critical_count,
            "delta_class": delta_class,
            "top_module": top_module,
        },
        "plan_limit_applied": plan_limit,
        "role_filter_applied": user_role,
    }


# ---------------------------------------------------------------------------
# HOW TO ADD THIS TO YOUR ClaudeService CLASS
# ---------------------------------------------------------------------------
# In contentAnylsisMatrix.py, inside the ClaudeService class, add:
#
#   from recommendation_engine import generate_prompt_recommendations
#   ClaudeService.generate_prompt_recommendations = generate_prompt_recommendations
#
# OR simply paste the generate_prompt_recommendations function directly
# into the ClaudeService class body.
#
# USAGE EXAMPLE:
#
#   ai_service = ClaudeService()
#
#   # After calculate_prompt_tracking_metrics() runs:
#   tracking_result = ai_service.calculate_prompt_tracking_metrics(
#       job_id=job_id, url=url, prompts=prompts
#   )
#
#   account_ctx = {
#       "aivs_drop_pts": 6,
#       "citation_score_drop_pct": 8,
#       "competitor_gained_pts": 0,
#       "days_since_last_action": 5,
#       "total_tracked_prompts": len(prompts),
#       "days_since_crawl": 3,
#   }
#
#   recs = ai_service.generate_prompt_recommendations(
#       job_id=job_id,
#       url=url,
#       prompt_metrics=tracking_result["metrics"],
#       account_context=account_ctx,
#       user_role="SEO Manager",
#       plan_tier="pro",
#   )
#
#   # recs["recommendations"] → list of ranked IEU action cards
#   # recs["summary"]["delta_class"] → e.g. "SLOW EROSION"
#   # recs["summary"]["critical"] → count of CRITICAL priority items
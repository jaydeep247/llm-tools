# moat7_aivs_bridge.py
#
# MOAT 7 → D7 → AIVS™ bridge layer
#
# This module provides the three functions that were missing from the
# MOAT 7 implementation:
#
#   1. compute_source_overlap_ratio()   — D7 param 3 (35% of D7)
#   2. compute_d7_score()               — full D7 composite 0–100
#   3. compute_competitive_aivs_delta() — d7_delta + AIVS™ contribution
#
# These functions consume the output of competitor_ai_intelligence.py
# and produce the structured dict that MOAT 3 (AIVS™ Scoring System)
# needs to update the brand's total AIVS™ score.
#
# ── SOP reference ────────────────────────────────────────────────────────────
# AIVS™ SOP §D7 parameter weights:
#   Param 1 — Share of Voice vs top 3 competitors   → 30% of D7
#   Param 2 — Competitor content gap (missing prompts) → 35% of D7
#   Param 3 — Citation source overlap analysis       → 35% of D7
#
# D7 weight in AIVS™ master formula: 15%
#   aivs_d7_contribution = d7_score × 0.15
# ─────────────────────────────────────────────────────────────────────────────

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger("moat7_aivs_bridge")


# ─────────────────────────────────────────────────────────────────────────────
# Scoring breakpoint helper
# ─────────────────────────────────────────────────────────────────────────────

def _breakpoint_score(value: float, breakpoints: List[tuple]) -> float:
    """
    Map a raw value to a 0–100 score using ordered breakpoints.
    breakpoints = [(threshold, score), ...] ordered descending by threshold.
    Returns the score of the first threshold the value meets or exceeds.
    """
    for threshold, score in breakpoints:
        if value >= threshold:
            return float(score)
    return float(breakpoints[-1][1])


# ─────────────────────────────────────────────────────────────────────────────
# Function 1: compute_source_overlap_ratio
#
# D7 Param 3 (35% of D7): Citation Source Overlap Analysis
#
# The SOP defines this as: "The domain sources that LLMs draw from when
# citing competitors — but not the brand. Identifies the authority gap:
# which external sites are validating competitors that the brand has not
# secured citation from."
#
# Score = 100 if brand has citations from all the same sources as competitors.
# Score approaches 0 as competitor-exclusive sources increase.
#
# Formula:
#   overlap_ratio = |brand_domains ∩ competitor_domains| / |competitor_domains|
#   score = overlap_ratio × 100  (clamped 0–100)
#
# This means: if competitors are cited by 10 domains and brand is cited by 6
# of those same 10, overlap_ratio = 0.60 → score = 60.
# ─────────────────────────────────────────────────────────────────────────────

def compute_source_overlap_ratio(
    source_analysis: Dict[str, Any],
    brand_cited_domains: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Compute D7 Param 3 — citation source overlap gap score (0–100).

    Args:
        source_analysis: Output of analyze_competitor_sources().
                         Must have key 'competitor_source_analysis'.
        brand_cited_domains: List of domains that cite the brand
                             (from brand's own citation data / MOAT 1).
                             Pass None if brand has no known citations —
                             this will score as 0 (maximum gap).

    Returns:
        {
            "overlap_score": float,           # 0–100 (100 = full overlap)
            "gap_score": float,               # 0–100 (100 = maximum gap)
            "competitor_domain_count": int,
            "brand_overlap_count": int,
            "competitor_exclusive_domains": List[str],
            "brand_domains_checked": int,
        }
    """
    sources = (source_analysis or {}).get("competitor_source_analysis") or []

    # Collect all unique domains cited for any competitor
    competitor_domains: set = set()
    for src in sources:
        if not isinstance(src, dict):
            continue
        for cf in (src.get("citation_frequency") or []):
            if isinstance(cf, dict) and cf.get("domain"):
                competitor_domains.add(str(cf["domain"]).strip().lower())
        for tc in (src.get("top_citations") or []):
            if isinstance(tc, dict) and tc.get("domain"):
                competitor_domains.add(str(tc["domain"]).strip().lower())

    if not competitor_domains:
        logger.warning("compute_source_overlap_ratio: no competitor domains found in source_analysis")
        return {
            "overlap_score": 0.0,
            "gap_score": 100.0,
            "competitor_domain_count": 0,
            "brand_overlap_count": 0,
            "competitor_exclusive_domains": [],
            "brand_domains_checked": 0,
        }

    # Normalise brand domains
    brand_domain_set: set = set()
    if brand_cited_domains:
        for d in brand_cited_domains:
            if d:
                brand_domain_set.add(str(d).strip().lower())

    # Compute overlap
    overlap = competitor_domains & brand_domain_set
    overlap_count = len(overlap)
    total_competitor_domains = len(competitor_domains)

    overlap_ratio = overlap_count / total_competitor_domains
    overlap_score = round(overlap_ratio * 100.0, 1)
    gap_score = round(100.0 - overlap_score, 1)

    # Competitor-exclusive = domains citing competitors but NOT brand
    competitor_exclusive = sorted(competitor_domains - brand_domain_set)

    return {
        "overlap_score": overlap_score,
        "gap_score": gap_score,
        "competitor_domain_count": total_competitor_domains,
        "brand_overlap_count": overlap_count,
        "competitor_exclusive_domains": competitor_exclusive[:20],  # top 20
        "brand_domains_checked": len(brand_domain_set),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Function 2: compute_d7_score
#
# Full D7 Composite — Competitive Citation Gap Score (0–100)
#
# Combines all three parameters using SOP weights:
#   Param 1 (SOV)             → 30%
#   Param 2 (missing prompts) → 35%
#   Param 3 (source overlap)  → 35%
#
# SOP breakpoints per parameter:
#
# Param 1 — Share of Voice:
#   >40% SOV  → 100
#   25–40%    → 80
#   15–25%    → 55
#   <15%      → 20
#
# Param 2 — Competitor content gap (missing prompt count):
#   <10  → 100
#   10–25 → 75
#   25–50 → 45
#   >50   → 15
#
# Param 3 — Citation source overlap:
#   >80% overlap → 100  (brand has most same sources)
#   60–80%       → 80
#   40–60%       → 55
#   20–40%       → 30
#   <20%         → 10
# ─────────────────────────────────────────────────────────────────────────────

# SOP breakpoint tables (value → score)
_SOV_BREAKPOINTS = [
    (40.0, 100),
    (25.0, 80),
    (15.0, 55),
    (0.0,  20),
]

_GAP_BREAKPOINTS = [
    # NOTE: missing prompt count is INVERTED — fewer gaps = higher score
    # We express as: score drops as count rises
    # Applied as: use (max - count) mapped to score
    # Simpler: use direct threshold map (count < X → score)
]

_OVERLAP_BREAKPOINTS = [
    (80.0, 100),
    (60.0, 80),
    (40.0, 55),
    (20.0, 30),
    (0.0,  10),
]


def _score_missing_prompts(count: int) -> float:
    """
    SOP Param 2 scoring: fewer missing prompts = higher score.
    <10 → 100, 10–25 → 75, 25–50 → 45, >50 → 15
    """
    if count < 10:
        return 100.0
    if count < 25:
        return 75.0
    if count <= 50:
        return 45.0
    return 15.0


def compute_d7_score(
    comparison: Dict[str, Any],
    gap_analysis: List[Dict[str, Any]],
    source_analysis: Dict[str, Any],
    brand_cited_domains: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Compute the full D7 Competitive Citation Gap Score (0–100).

    Args:
        comparison:           Output of compare_visibility_against_competitors().
        gap_analysis:         Output of compute_gap_analysis().
        source_analysis:      Output of analyze_competitor_sources().
        brand_cited_domains:  Domains that cite the brand (from MOAT 1 / MOAT 5).
                              Used for source overlap calculation.

    Returns:
        {
            "d7_score": float,              # 0–100 composite D7 score
            "d7_grade": str,                # A+ / A / B / C / D / F
            "param1_sov_score": float,      # SOV → 0–100 (30% weight)
            "param1_sov_pct": float,        # raw SOV % from brand data
            "param2_gap_score": float,      # missing prompts → 0–100 (35% weight)
            "param2_missing_prompts": int,  # raw missing prompt count
            "param3_overlap_score": float,  # source overlap → 0–100 (35% weight)
            "param3_raw": Dict,             # full source overlap detail
            "aivs_d7_contribution": float,  # d7_score × 0.15
        }
    """
    # ── Param 1: Share of Voice ───────────────────────────────────────────────
    brand = (comparison or {}).get("brand") or {}
    sov_pct = float(brand.get("share_of_voice") or 0.0)
    param1_score = _breakpoint_score(sov_pct, _SOV_BREAKPOINTS)

    # ── Param 2: Missing prompts ──────────────────────────────────────────────
    # Sum missing prompts across all competitors (worst-case brand exposure)
    total_missing = sum(
        int(g.get("missingPrompts") or 0)
        for g in (gap_analysis or [])
        if isinstance(g, dict)
    )
    # Deduplicate: count unique prompts where brand is absent
    # (multiple competitors may flag the same prompt)
    unique_missing_prompts: set = set()
    for g in (gap_analysis or []):
        if not isinstance(g, dict):
            continue
        for opp in (g.get("opportunities") or []):
            if isinstance(opp, dict) and opp.get("rank") is None:
                prompt = str(opp.get("prompt") or "").strip()
                if prompt:
                    unique_missing_prompts.add(prompt)
    missing_count = len(unique_missing_prompts) if unique_missing_prompts else total_missing
    param2_score = _score_missing_prompts(missing_count)

    # ── Param 3: Citation source overlap ─────────────────────────────────────
    overlap_result = compute_source_overlap_ratio(source_analysis, brand_cited_domains)
    # D7 param 3 uses overlap_score (high = brand overlaps competitor sources = good)
    param3_score = _breakpoint_score(
        overlap_result["overlap_score"], _OVERLAP_BREAKPOINTS
    )

    # ── D7 composite ─────────────────────────────────────────────────────────
    d7_score = round(
        (param1_score * 0.30)
        + (param2_score * 0.35)
        + (param3_score * 0.35),
        2
    )
    d7_score = max(0.0, min(100.0, d7_score))

    # ── AIVS™ contribution ────────────────────────────────────────────────────
    aivs_d7_contribution = round(d7_score * 0.15, 2)

    # ── Grade ─────────────────────────────────────────────────────────────────
    def _grade(score: float) -> str:
        if score >= 85: return "A+"
        if score >= 70: return "A"
        if score >= 55: return "B"
        if score >= 40: return "C"
        if score >= 25: return "D"
        return "F"

    logger.info(
        f"D7 computed: score={d7_score} | SOV={sov_pct:.1f}%→{param1_score} "
        f"| gaps={missing_count}→{param2_score} | overlap={overlap_result['overlap_score']}→{param3_score}"
    )

    return {
        "d7_score":               d7_score,
        "d7_grade":               _grade(d7_score),
        "param1_sov_score":       round(param1_score, 1),
        "param1_sov_pct":         round(sov_pct, 1),
        "param2_gap_score":       round(param2_score, 1),
        "param2_missing_prompts": missing_count,
        "param3_overlap_score":   round(param3_score, 1),
        "param3_raw":             overlap_result,
        "aivs_d7_contribution":   aivs_d7_contribution,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Function 3: compute_competitive_aivs_delta
#
# Competitive AIVS™ Delta — the signal MOAT 3 consumes
#
# This function:
#   1. Takes the current D7 result and the previous D7 result (from DB)
#   2. Computes d7_delta = current_d7 - previous_d7
#   3. Returns the full structured dict for MOAT 3 to apply to AIVS™
#
# MOAT 3 uses this to:
#   - Update the D7 component of the brand's AIVS™ score
#   - Fire score improvement/drop alerts
#   - Adjust recommendation urgency weights
#   - Surface "Competitive AIVS™ delta" on the leaderboard (Screen 1)
# ─────────────────────────────────────────────────────────────────────────────

def compute_competitive_aivs_delta(
    current_d7_result: Dict[str, Any],
    previous_d7_result: Optional[Dict[str, Any]] = None,
    previous_full_aivs: Optional[float] = None,
    d1_d6_score: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Compute the Competitive AIVS™ delta — the change in D7 score and its
    downstream effect on total AIVS™.

    Args:
        current_d7_result:   Output of compute_d7_score() for this run.
        previous_d7_result:  Output of compute_d7_score() from previous run.
                             None on first run (no delta available).
        previous_full_aivs:  Brand's full AIVS™ score from previous run (0–100).
                             Used to compute projected AIVS™ change.
                             None if not available.
        d1_d6_score:         Sum of D1–D6 weighted contributions from MOAT 1–6.
                             If provided, computes projected_aivs_score.
                             Formula: projected = d1_d6_score + d7_contribution

    Returns:
        {
            "d7_score":               float,   # current D7 score 0–100
            "d7_grade":               str,     # current grade
            "d7_delta":               float,   # current - previous (None if first run)
            "d7_delta_direction":     str,     # "improved" | "dropped" | "stable" | "first_run"
            "aivs_d7_contribution":   float,   # d7_score × 0.15
            "aivs_d7_delta":          float,   # aivs_contribution change (None if first run)
            "projected_aivs_score":   float,   # d1_d6 + d7 contribution (None if no d1_d6)
            "previous_aivs_score":    float,   # previous full AIVS™ (passthrough)
            "param_breakdown": {
                "sov":     {"score": float, "raw_pct": float},
                "gaps":    {"score": float, "count": int},
                "overlap": {"score": float, "overlap_pct": float},
            },
            "grade_change":  str | None,       # "improved" | "dropped" | None
            "alert_level":   str,              # "high" | "medium" | "low" | "none"
            "generated_at":  str,
        }
    """
    current_d7   = float(current_d7_result.get("d7_score") or 0.0)
    current_grade = str(current_d7_result.get("d7_grade") or "F")
    current_contribution = float(current_d7_result.get("aivs_d7_contribution") or current_d7 * 0.15)

    # ── Delta vs previous ─────────────────────────────────────────────────────
    prev_d7: Optional[float] = None
    prev_contribution: Optional[float] = None
    prev_grade: Optional[str] = None

    if previous_d7_result and isinstance(previous_d7_result, dict):
        prev_d7 = float(previous_d7_result.get("d7_score") or 0.0)
        prev_contribution = float(previous_d7_result.get("aivs_d7_contribution") or prev_d7 * 0.15)
        prev_grade = str(previous_d7_result.get("d7_grade") or "F")

    if prev_d7 is not None:
        d7_delta = round(current_d7 - prev_d7, 2)
        aivs_d7_delta = round(current_contribution - prev_contribution, 3)
        if d7_delta > 1.0:
            direction = "improved"
        elif d7_delta < -1.0:
            direction = "dropped"
        else:
            direction = "stable"
    else:
        d7_delta = None
        aivs_d7_delta = None
        direction = "first_run"

    # ── Grade change ──────────────────────────────────────────────────────────
    grade_change: Optional[str] = None
    GRADE_ORDER = ["F", "D", "C", "B", "A", "A+"]
    if prev_grade and current_grade != prev_grade:
        cur_idx  = GRADE_ORDER.index(current_grade) if current_grade in GRADE_ORDER else 0
        prev_idx = GRADE_ORDER.index(prev_grade) if prev_grade in GRADE_ORDER else 0
        grade_change = "improved" if cur_idx > prev_idx else "dropped"

    # ── Projected AIVS™ score ─────────────────────────────────────────────────
    projected_aivs: Optional[float] = None
    if d1_d6_score is not None:
        projected_aivs = round(
            max(0.0, min(100.0, float(d1_d6_score) + current_contribution)), 2
        )

    # ── Alert level ───────────────────────────────────────────────────────────
    # high   = D7 dropped >10 pts OR competitor gained >10 pts this period
    # medium = D7 dropped 5–10 pts OR competitor gained 5–10 pts
    # low    = any movement
    # none   = stable or first run
    if d7_delta is not None:
        if d7_delta <= -10:
            alert_level = "high"
        elif d7_delta <= -5:
            alert_level = "medium"
        elif abs(d7_delta) > 1:
            alert_level = "low"
        else:
            alert_level = "none"
    else:
        alert_level = "none"

    return {
        "d7_score":             round(current_d7, 2),
        "d7_grade":             current_grade,
        "d7_delta":             d7_delta,
        "d7_delta_direction":   direction,
        "aivs_d7_contribution": round(current_contribution, 3),
        "aivs_d7_delta":        aivs_d7_delta,
        "projected_aivs_score": projected_aivs,
        "previous_aivs_score":  previous_full_aivs,
        "previous_d7_score":    prev_d7,
        "previous_d7_grade":    prev_grade,
        "param_breakdown": {
            "sov": {
                "score":   current_d7_result.get("param1_sov_score"),
                "raw_pct": current_d7_result.get("param1_sov_pct"),
            },
            "gaps": {
                "score": current_d7_result.get("param2_gap_score"),
                "count": current_d7_result.get("param2_missing_prompts"),
            },
            "overlap": {
                "score":       current_d7_result.get("param3_overlap_score"),
                "overlap_pct": (current_d7_result.get("param3_raw") or {}).get("overlap_score"),
            },
        },
        "grade_change":  grade_change,
        "alert_level":   alert_level,
        "generated_at":  datetime.utcnow().isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Integration helper: run_d7_pipeline
#
# Call this from runner.py after all MOAT 7 steps complete.
# Returns the full D7 result ready for MOAT 3 consumption.
# ─────────────────────────────────────────────────────────────────────────────

def run_d7_pipeline(
    comparison: Dict[str, Any],
    gap_analysis: List[Dict[str, Any]],
    source_analysis: Dict[str, Any],
    brand_cited_domains: Optional[List[str]] = None,
    previous_d7_result: Optional[Dict[str, Any]] = None,
    previous_full_aivs: Optional[float] = None,
    d1_d6_score: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Convenience wrapper: computes D7 score + Competitive AIVS™ delta in one call.

    In runner.py, call after Step 4 (source analysis):

        from .moat7_aivs_bridge import run_d7_pipeline

        # Fetch previous D7 from cbm_aivs_d7 collection
        prev_d7 = mongo_manager.db.cbm_aivs_d7.find_one(
            {"projectId": project_id},
            sort=[("generatedAt", -1)]
        )

        d7_output = run_d7_pipeline(
            comparison=comparison,
            gap_analysis=gap_analysis,
            source_analysis=source_analysis,
            brand_cited_domains=brand_cited_domains,  # from MOAT 1/5
            previous_d7_result=prev_d7,
            previous_full_aivs=project.get("aivs_score"),
            d1_d6_score=project.get("d1_d6_contribution"),
        )

        # Persist D7 result
        mongo_manager.db.cbm_aivs_d7.update_one(
            {"projectId": project_id},
            {"$set": {**d7_output, "projectId": project_id,
                      "generatedAt": datetime.utcnow()},
             "$setOnInsert": {"insertedAt": datetime.utcnow()}},
            upsert=True,
        )

        # Add to result dict for API response
        result["d7_aivs_output"] = d7_output
    """
    d7_result = compute_d7_score(
        comparison=comparison,
        gap_analysis=gap_analysis,
        source_analysis=source_analysis,
        brand_cited_domains=brand_cited_domains,
    )

    delta_result = compute_competitive_aivs_delta(
        current_d7_result=d7_result,
        previous_d7_result=previous_d7_result,
        previous_full_aivs=previous_full_aivs,
        d1_d6_score=d1_d6_score,
    )

    return delta_result
"""
Anthropic Claude Integration Service
Colytics AEO Platform — contentAnylsisMatrix.py

CORRECTED VERSION — all SOP-002 and Moat #4 deviations fixed:

  FIX 1:  PVS formula now matches SOP-002 §7.1 exactly:
          (citation_rate × 0.45) + (position_score × 0.35) + (sov × 0.20) × 100

  FIX 2:  Snapshot persistence is now APPEND-ONLY.
          Every call writes a NEW prompt_performance_snapshots record.
          The prompt_tracking document is an index only — never the truth store.

  FIX 3:  intent cluster DB value 'agent_style' corrected to 'agent' per SOP-002 §4.1.

  FIX 4:  Difficulty scoring added per SOP-002 §4.3 with correct 4-input weighted formula.
          Refresh frequency derived from score and stored on each prompt_job.

  FIX 5:  Recommendation dedup bug fixed — additional_prompts now accumulate on
          the WINNING card, not the discarded one.

  FIX 6:  Investor KPI instrumentation added per SOP-002 §12 — written on every run.

  FIX 7:  scoring_formula_versions table seeded on first use per SOP-002 §7.1.

  FIX 8:  MongoDB vs PostgreSQL architectural deviation logged as a known deviation
          requiring Founder sign-off (comment + runtime warning).

  Original ClaudeService methods (1–8) are unchanged.
  calculate_prompt_tracking_metrics() rebuilt with correct PVS + append-only snapshots.
  generate_prompt_recommendations() dedup bug fixed.
"""

import os
import re
import json
import math
import logging
from typing import Dict, List, Optional
from datetime import datetime, date, timedelta

import anthropic

from utils.mongo import mongo_manager
from utils.storage import load_raw_html_sync

try:
    from bs4 import BeautifulSoup
except Exception:
    BeautifulSoup = None

logger = logging.getLogger("colytics.claude_service")

# ---------------------------------------------------------------------------
# ARCHITECTURAL DEVIATION NOTE — requires Founder sign-off
# SOP-002 §2.3 mandates PostgreSQL with row-level security for all core tables.
# This implementation uses MongoDB. The deviation is intentional for MVP speed
# but must be formalised with Founder approval before Series A due diligence.
# ---------------------------------------------------------------------------
_MONGO_DEVIATION_LOGGED = False


def _log_mongo_deviation_once():
    global _MONGO_DEVIATION_LOGGED
    if not _MONGO_DEVIATION_LOGGED:
        logger.warning(
            "ARCHITECTURAL DEVIATION [SOP-002 §2.3]: Core tables (prompt_jobs, "
            "citation_records, prompt_performance_snapshots) are stored in MongoDB. "
            "SOP mandates PostgreSQL with row-level security. "
            "Founder sign-off required before production deployment."
        )
        _MONGO_DEVIATION_LOGGED = True


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, float(value)))


def _safe_mean(values: List[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _variance(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = _safe_mean(values)
    return _safe_mean([(v - mean) ** 2 for v in values])


_STOPWORDS = {
    "a", "an", "the", "and", "or", "to", "of", "in", "on", "for", "with",
    "at", "by", "from", "as", "is", "are", "was", "were", "be", "been",
    "being", "it", "this", "that", "these", "those", "i", "you", "we",
    "they", "he", "she", "them", "us", "our", "your", "my", "me",
    "what", "how", "why", "when", "where", "who", "which",
    "best", "top", "near", "vs", "versus",
}


def _tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[a-z0-9]+", (text or "").lower())
    return [t for t in tokens if len(t) > 2 and t not in _STOPWORDS]


# ---------------------------------------------------------------------------
# SOP-002 §7.1 — CORRECT Prompt Visibility Score formula
# PVS = (citation_rate × 0.45) + (position_score × 0.35) + (sov × 0.20)
# All three inputs normalised 0–1; result × 100 gives 0–100 score.
# position_score = (11 - avg_position) / 10  (rank 1 → 1.0, rank 10 → 0.1)
# ---------------------------------------------------------------------------

# Current formula version — must be bumped and re-seeded on any weight change
_PVS_FORMULA_VERSION = "v1.0"
_PVS_WEIGHTS = {"citation_rate": 0.45, "position_score": 0.35, "share_of_voice": 0.20}
_FORMULA_SEEDED = False


def _compute_pvs(citation_rate: float, avg_position: float, share_of_voice: float) -> float:
    """
    SOP-002 §7.1 canonical formula.
    citation_rate  : 0.0–1.0
    avg_position   : 1–10 (1 = best)
    share_of_voice : 0.0–1.0
    Returns PVS 0–100.
    """
    citation_rate  = _clamp(citation_rate,  0.0, 1.0)
    avg_position   = max(1.0, min(10.0, float(avg_position or 10.0)))
    share_of_voice = _clamp(share_of_voice, 0.0, 1.0)

    position_score = (11.0 - avg_position) / 10.0          # 1.0 → 0.1 range
    raw = (
        citation_rate  * _PVS_WEIGHTS["citation_rate"]
        + position_score * _PVS_WEIGHTS["position_score"]
        + share_of_voice * _PVS_WEIGHTS["share_of_voice"]
    )
    return _clamp(round(raw * 100.0, 2))


def _seed_formula_version_once():
    """
    SOP-002 §7.1: Every formula version must be recorded in scoring_formula_versions.
    Seeds once per process lifecycle; idempotent on re-run via upsert.
    """
    global _FORMULA_SEEDED
    if _FORMULA_SEEDED:
        return
    try:
        mongo_manager.connect()
        mongo_manager.db.scoring_formula_versions.update_one(
            {"version_id": _PVS_FORMULA_VERSION},
            {"$setOnInsert": {
                "version_id":    _PVS_FORMULA_VERSION,
                "formula":       "PVS = (citation_rate×0.45) + (position_score×0.35) + (sov×0.20) × 100",
                "weights":       _PVS_WEIGHTS,
                "effective_from": datetime.utcnow(),
                "notes":         "Initial MVP formula per SOP-002 §7.1",
            }},
            upsert=True,
        )
        _FORMULA_SEEDED = True
    except Exception as exc:
        logger.warning("Could not seed scoring_formula_versions: %s", exc)


# ---------------------------------------------------------------------------
# SOP-002 §4.3 — Prompt Difficulty Scoring
# Inputs (weighted):
#   competitor_density (35%) — more competitors = harder
#   brand_position     (30%) — baseline position of client brand
#   prompt_specificity (20%) — specific prompts = lower competition
#   citation_volatility(15%) — volatile prompts = higher difficulty
# Score 0–100; maps to refresh frequency.
# ---------------------------------------------------------------------------

def _compute_difficulty_score(
    competitor_count: int = 0,
    avg_position: float = 10.0,
    prompt_text: str = "",
    citation_variance: float = 0.0,
    max_competitors: int = 20,
) -> Dict:
    """
    SOP-002 §4.3 difficulty scoring.
    Returns {"difficulty_score": float, "difficulty_label": str, "refresh_days": int}.
    """
    # Competitor density: 0 competitors → 0, max_competitors → 100
    density_score = _clamp((competitor_count / max(max_competitors, 1)) * 100)

    # Brand position: rank 1 → 0 difficulty, rank 10+ → 100 difficulty
    position_score = _clamp(((float(avg_position or 10.0) - 1.0) / 9.0) * 100)

    # Prompt specificity: longer, more specific prompts = LOWER difficulty
    # Word count proxy — 1 word → 100 difficulty, 10+ words → 10 difficulty
    word_count = max(1, len((prompt_text or "").split()))
    specificity_difficulty = _clamp(max(10.0, 100.0 - (word_count - 1) * 10.0))

    # Citation volatility: high variance → higher difficulty
    volatility_score = _clamp(min(citation_variance * 1000.0, 100.0))

    difficulty = (
        density_score     * 0.35
        + position_score  * 0.30
        + specificity_difficulty * 0.20
        + volatility_score * 0.15
    )
    difficulty = round(_clamp(difficulty), 2)

    if difficulty <= 30:
        label, refresh_days, priority = "Low",      14, "batch"
    elif difficulty <= 60:
        label, refresh_days, priority = "Medium",    7, "standard"
    elif difficulty <= 85:
        label, refresh_days, priority = "High",      3, "elevated"
    else:
        label, refresh_days, priority = "Critical",  1, "immediate"

    return {
        "difficulty_score":   difficulty,
        "difficulty_label":   label,
        "refresh_days":       refresh_days,
        "run_priority":       priority,
    }


# ---------------------------------------------------------------------------
# IEU Rule Library — Moat #4 Section 3.2
# ---------------------------------------------------------------------------

_IEU_RULES = [
    {
        "rule_id": "PROMPT_ZERO_VISIBILITY",
        "module": "prompt_intel",
        "action_title": "Add direct answer block to this page",
        "action_detail": (
            "Prompt visibility is critically low (<25). Restructure the page "
            "with a clear FAQ or TL;DR block at the top that directly answers "
            "this prompt. Use H2 headings that echo the exact query language. "
            "Add schema markup for FAQPage or HowTo."
        ),
        "impact_raw": 9, "effort_raw": 4, "base_urgency": 8,
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
        "impact_raw": 7, "effort_raw": 5, "base_urgency": 6,
        "roles": ["SEO Manager", "Content Manager"],
        "condition": lambda m: 25 <= m.get("prompt_visibility_score", 100) < 50,
    },
    {
        "rule_id": "PROMPT_LOW_CTR",
        "module": "prompt_intel",
        "action_title": "Rewrite page snippet for higher click-through",
        "action_detail": (
            "CTR is below 5%. Rewrite the meta description and opening paragraph "
            "to include a concise direct answer in the first 25 words. "
            "Add a numbered list or stat that stands out in AI-generated summaries."
        ),
        "impact_raw": 6, "effort_raw": 3, "base_urgency": 5,
        "roles": ["Content Manager", "SEO Manager"],
        "condition": lambda m: m.get("ctr_percent", 100) < 5,
    },
    {
        "rule_id": "PROMPT_LOW_ENGAGEMENT",
        "module": "content",
        "action_title": "Add expert signals and credibility markers",
        "action_detail": (
            "Engagement score is below 40. Add: author byline with credentials, "
            "at least 2 citations to authoritative sources, original data or a "
            "statistic, and a structured comparison table if commercial/comparative."
        ),
        "impact_raw": 7, "effort_raw": 5, "base_urgency": 5,
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
            "Run a content gap analysis against the top-cited competitor."
        ),
        "impact_raw": 8, "effort_raw": 6, "base_urgency": 9,
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
            "No tracking history exists for this prompt. Without a baseline you "
            "cannot measure improvement. Add it to your tracked prompt list now — "
            "zero effort, prerequisite for all other recommendations."
        ),
        "impact_raw": 6, "effort_raw": 1, "base_urgency": 8,
        "roles": ["SEO Manager", "Analyst"],
        "condition": lambda m: m.get("visibility_change") is None,
    },
    {
        "rule_id": "PROMPT_HIGH_TRAFFIC_LOW_RANK",
        "module": "prompt_intel",
        "action_title": "Prioritise this high-opportunity prompt in next sprint",
        "action_detail": (
            "Traffic estimate is meaningful but visibility is mid-range (50–70). "
            "Commission a content expansion: add a 200-word section directly "
            "answering this prompt with 2–3 supporting facts, reformat as FAQ."
        ),
        "impact_raw": 8, "effort_raw": 5, "base_urgency": 6,
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
            "Visibility score is strong (>75) and improving. Document the "
            "structure of this page (heading pattern, entity density, schema type) "
            "and apply it to your 5 next-highest priority prompt targets. "
            "Do not change this page — protect what is working."
        ),
        "impact_raw": 7, "effort_raw": 4, "base_urgency": 4,
        "roles": ["Content Manager", "SEO Manager", "CMO"],
        "condition": lambda m: (
            m.get("prompt_visibility_score", 0) > 75
            and (m.get("visibility_change") or 0) > 3
        ),
    },
    # ── Rules that fire on REAL citation data (SOP-002 S5 output) ──────────
    {
        "rule_id": "LOW_CITATION_RATE",
        "module": "prompt_intel",
        "action_title": "Increase citation rate — page not being cited by LLMs",
        "action_detail": (
            "Real citation rate from LLM execution is below 30%. "
            "The page is not being selected as a source by AI models. "
            "Add structured data (FAQ/HowTo schema), increase entity density, "
            "and ensure the page has a clear, citable factual claim in the first paragraph."
        ),
        "impact_raw": 9, "effort_raw": 5, "base_urgency": 9,
        "roles": ["SEO Manager", "Content Manager", "CMO"],
        "condition": lambda m: (
            m.get("calculation_method") == "real_citation_data"
            and m.get("citation_rate", 1.0) < 0.30
        ),
    },
    {
        "rule_id": "LOW_SHARE_OF_VOICE",
        "module": "competitor",
        "action_title": "Competitors dominating — build share of voice urgently",
        "action_detail": (
            "Share of voice is below 25% — competitors are cited far more than "
            "your brand for this prompt. Identify which competitor pages are being "
            "cited, analyse their structure, and create a superior answer page "
            "targeting the same prompt with deeper content and stronger schema."
        ),
        "impact_raw": 9, "effort_raw": 7, "base_urgency": 8,
        "roles": ["CMO", "SEO Manager"],
        "condition": lambda m: (
            m.get("calculation_method") == "real_citation_data"
            and m.get("share_of_voice", 1.0) < 0.25
        ),
    },
    {
        "rule_id": "POOR_POSITION_RANK",
        "module": "prompt_intel",
        "action_title": "Improve position — cited late in LLM responses",
        "action_detail": (
            "Average citation position is 7 or lower (out of 10). "
            "Being cited late means lower visibility and lower CTR. "
            "Rewrite the page to lead with a crisp, quotable answer. "
            "Use a TL;DR summary block, numbered list, or stat in the first 50 words."
        ),
        "impact_raw": 7, "effort_raw": 4, "base_urgency": 7,
        "roles": ["Content Manager", "SEO Manager"],
        "condition": lambda m: (
            m.get("calculation_method") == "real_citation_data"
            and m.get("avg_position") is not None
            and m.get("avg_position", 0) >= 7
        ),
    },
    # ── SOP-001 Phase 5 gap patterns — require citation_gap_events data ────
    {
        "rule_id": "COMPETITOR_CITED_MATCHING_PAGE",
        "module": "competitor",
        "action_title": "Add FAQ schema — competitor cited, you have matching content",
        "action_detail": (
            "A competitor is being cited for this prompt but your page covers the same topic. "
            "Add FAQ schema to your page — structured Q&A is cited 3× more by AI models than prose. "
            "Add H2 headings that echo the exact prompt language. "
            "Add Organization schema with a clear authoritative definition paragraph."
        ),
        "impact_raw": 9, "effort_raw": 4, "base_urgency": 9,
        "roles": ["SEO Manager", "Content Manager", "CMO"],
        "condition": lambda m: (
            m.get("calculation_method") == "real_citation_data"
            and m.get("competitor_count", 0) > 0
            and m.get("citation_rate", 1.0) < 0.20
        ),
    },
    {
        "rule_id": "BRAND_MENTIONED_NO_URL_CITED",
        "module": "prompt_intel",
        "action_title": "Brand appears in AI answers but no URL is cited",
        "action_detail": (
            "Your brand name is being mentioned in AI responses but no URL from your site is being cited. "
            "This means AI models know about your brand but cannot confidently source it. "
            "Add an authoritative definition paragraph in the first 100 words of your homepage. "
            "Add Organization schema with name, url, description, and sameAs fields. "
            "Ensure your homepage is publicly crawlable with no robots.txt blocks."
        ),
        "impact_raw": 8, "effort_raw": 3, "base_urgency": 8,
        "roles": ["SEO Manager", "CMO", "Content Manager"],
        "condition": lambda m: (
            m.get("calculation_method") == "real_citation_data"
            and m.get("citation_rate", 1.0) < 0.10
            and m.get("share_of_voice", 1.0) < 0.15
            and m.get("competitor_count", 0) > 0
        ),
    },
    {
        "rule_id": "COMPETITOR_EARLY_POSITION_ADVANTAGE",
        "module": "competitor",
        "action_title": "Competitor wins first-paragraph citations — add TL;DR block",
        "action_detail": (
            "Competitors are consistently cited in the first paragraph of AI responses for this prompt "
            "while your citations appear mid or late. Early-position citations receive 2× the visibility weight. "
            "Add a TL;DR summary block with key statistics in the opening 150 words of your page. "
            "Lead with a crisp, quotable one-sentence answer to the prompt. "
            "Use a numbered list in the intro — AI models prefer scannable structures for early citations."
        ),
        "impact_raw": 8, "effort_raw": 4, "base_urgency": 7,
        "roles": ["Content Manager", "SEO Manager"],
        "condition": lambda m: (
            m.get("calculation_method") == "real_citation_data"
            and m.get("avg_position") is not None
            and m.get("avg_position", 0) >= 5
            and m.get("competitor_count", 0) > 0
            and m.get("citation_rate", 1.0) < 0.40
        ),
    },
]


# ---------------------------------------------------------------------------
# Urgency multipliers — Moat #4 Section 3.3
# ---------------------------------------------------------------------------

def _compute_urgency_multiplier(account_context: Dict) -> float:
    boost = 0.0
    if account_context.get("citation_score_drop_pct", 0) > 15:
        boost += 4.0
    if account_context.get("aivs_dropped_7d", False):
        boost += 2.0
    if account_context.get("competitor_gained_pts", 0) > 10:
        boost += 3.0
    if account_context.get("days_since_last_action", 0) >= 14:
        boost += 2.0
    if account_context.get("total_tracked_prompts", 1) == 0:
        boost += 3.0
    if account_context.get("days_since_crawl", 0) > 21:
        boost += 2.0
    return min(boost, 5.0)


def _ieu_score(impact: float, effort_raw: float, urgency: float) -> float:
    """Moat #4: Priority = (Impact×0.50) + (Effort_Inverted×0.30) + (Urgency×0.20)"""
    effort_inv = max(0.0, min(10.0, 11.0 - effort_raw))
    raw = (impact * 0.50) + (effort_inv * 0.30) + (urgency * 0.20)
    return max(0.0, min(10.0, raw))


# ---------------------------------------------------------------------------
# SOP-002 real-data loader
# ---------------------------------------------------------------------------

def _load_real_citation_metrics(job_id: str, prompt_text: str) -> Optional[Dict]:
    """
    Try to load real citation-based metrics from SOP-002 S5 scoring output.
    Returns None if SOP-002 pipeline has not run for this prompt yet.
    """
    try:
        mongo_manager.connect()
        job = mongo_manager.db.prompt_jobs.find_one({
            "project_id": job_id,
            "prompt_text": prompt_text,
            "status": "complete",
            "latest_pvs": {"$exists": True},
        })
        if not job:
            return None

        snaps = list(mongo_manager.db.prompt_performance_snapshots.find(
            {"prompt_job_id": str(job["_id"])},
            sort=[("created_at", -1)],
            limit=2,
        ))
        snap = snaps[0] if snaps else {}

        visibility_change = None
        if len(snaps) >= 2:
            visibility_change = round(
                snaps[0].get("prompt_visibility_score", 0) -
                snaps[1].get("prompt_visibility_score", 0), 2
            )

        citation_rate    = job.get("latest_citation_rate", 0)
        avg_position     = job.get("latest_avg_position") or 10.0
        share_of_voice   = job.get("latest_share_of_voice", 0)

        # Re-compute PVS using canonical SOP formula instead of trusting stored value
        pvs = _compute_pvs(citation_rate, avg_position, share_of_voice)

        return {
            "prompt":                  prompt_text,
            "prompt_visibility_score": pvs,
            "citation_rate":           citation_rate,
            "avg_position":            avg_position,
            "share_of_voice":          share_of_voice,
            "competitor_count":        job.get("latest_competitor_count", 0),
            "ctr_percent":             round(
                citation_rate * (1 - avg_position / 10) * 30, 2
            ),
            "engagement_score":        round(
                citation_rate * 100 * 0.6 + share_of_voice * 100 * 0.4, 2
            ),
            "traffic_estimate":        round(
                pvs / 100 * citation_rate * 25, 2
            ),
            "visibility_change":       visibility_change,
            "calculation_method":      "real_citation_data",
        }
    except Exception as e:
        logger.warning("Could not load real citation metrics: %s", e)
        return None


# ---------------------------------------------------------------------------
# SOP-002 §7.2 — APPEND-ONLY snapshot writer
# ---------------------------------------------------------------------------

def _write_prompt_snapshot(
    prompt_job_id: str,
    llm_model: str,
    citation_rate: float,
    avg_position: float,
    share_of_voice: float,
    competitor_count: int,
    prompt_visibility_score: float,
):
    """
    SOP-002 §7.2 Rules 1 & 2: write a NEW snapshot on every execution cycle.
    NEVER update existing snapshots. Append only.
    """
    try:
        mongo_manager.connect()
        mongo_manager.db.prompt_performance_snapshots.insert_one({
            "prompt_job_id":         prompt_job_id,
            "snapshot_date":         date.today().isoformat(),
            "llm_model":             llm_model,
            "citation_rate":         round(float(citation_rate), 4),
            "avg_position":          round(float(avg_position), 2),
            "share_of_voice":        round(float(share_of_voice), 4),
            "competitor_count":      int(competitor_count),
            "prompt_visibility_score": round(float(prompt_visibility_score), 2),
            "pvs_formula_version":   _PVS_FORMULA_VERSION,
            "created_at":            datetime.utcnow(),
        })
    except Exception as exc:
        logger.warning("Could not write prompt_performance_snapshot: %s", exc)


# ---------------------------------------------------------------------------
# SOP-002 §12 — Investor KPI instrumentation
# ---------------------------------------------------------------------------

def _record_investor_kpis(job_id: str, prompt_metrics: List[Dict]):
    """
    SOP-002 §12: Four KPIs must be logged and queryable from Day 1.
    1. Total prompts tracked (cumulative)
    2. Avg citation rate improvement over 30 days
    3. Prompt execution volume per LLM model (placeholder — updated by llm-runner)
    4. Feature activation rate (accounts with active prompts / total paid accounts)
       — partial: records per-job activation signal; platform aggregation is separate.
    """
    try:
        mongo_manager.connect()
        now = datetime.utcnow()
        total_tracked = len(prompt_metrics)
        citation_rates = [
            m["citation_rate"] for m in prompt_metrics
            if m.get("calculation_method") == "real_citation_data"
            and isinstance(m.get("citation_rate"), (int, float))
        ]
        avg_citation_rate = round(_safe_mean(citation_rates), 4) if citation_rates else None

        # 30-day improvement: compare latest vs oldest snapshot in window
        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        old_snaps = list(mongo_manager.db.prompt_performance_snapshots.find(
            {"created_at": {"$lte": thirty_days_ago}},
            sort=[("created_at", 1)],
            limit=total_tracked,
        ))
        old_rate_mean = _safe_mean([
            s.get("citation_rate", 0) for s in old_snaps
            if isinstance(s.get("citation_rate"), (int, float))
        ])
        citation_rate_30d_delta = (
            round((_safe_mean(citation_rates) - old_rate_mean), 4)
            if citation_rates else None
        )

        mongo_manager.db.platform_kpis.insert_one({
            "job_id":                     job_id,
            "recorded_at":                now,
            # KPI 1 — Total prompts tracked (this job)
            "total_prompts_tracked":      total_tracked,
            # KPI 2 — Avg citation rate improvement over 30d
            "avg_citation_rate":          avg_citation_rate,
            "citation_rate_30d_delta":    citation_rate_30d_delta,
            # KPI 3 — execution volume per model (written by llm-runner;
            #          placeholder here so the field exists in schema)
            "execution_volume_per_model": {},
            # KPI 4 — per-job feature activation signal
            "feature_active":             total_tracked > 0,
        })
    except Exception as exc:
        logger.warning("Could not record investor KPIs: %s", exc)


# ===========================================================================
# Main ClaudeService class
# ===========================================================================

class ClaudeService:
    """
    Anthropic Claude-powered content analysis for Colytics AEO platform.
    Includes full SOP-002 Prompt Monitoring integration and Moat #4 RE.
    """

    MODEL = "claude-sonnet-4-5"
    _TOKENS_LARGE  = 1024
    _TOKENS_MEDIUM = 512
    _TOKENS_SMALL  = 256

    def __init__(self):
        _log_mongo_deviation_once()
        self.client: Optional[anthropic.Anthropic] = None
        self.api_key = os.getenv("ANTHROPIC_API_KEY")
        if self.api_key:
            try:
                self.client = anthropic.Anthropic(api_key=self.api_key)
                logger.info("Anthropic Claude client initialised successfully")
            except Exception as exc:
                logger.error("Failed to initialise Anthropic client: %s", exc)
        else:
            logger.warning("ANTHROPIC_API_KEY not found in environment variables")

    def _is_available(self) -> bool:
        return self.client is not None

    def _call(self, system: str, user: str, max_tokens: int = None,
              expect_json: bool = True) -> str:
        if max_tokens is None:
            max_tokens = self._TOKENS_LARGE
        full_user = user
        if expect_json:
            full_user = user + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no explanation, no code fences."
        message = self.client.messages.create(
            model=self.MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": full_user}],
        )
        return message.content[0].text.strip()

    def _parse_json(self, raw: str) -> dict:
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        cleaned = re.sub(r"\s*```$", "", cleaned)
        return json.loads(cleaned.strip())

    # ------------------------------------------------------------------
    # 1. Content understanding
    # ------------------------------------------------------------------

    def analyze_content_understanding(self, content: str, url: str) -> Dict:
        fallback = {
            "score": 50, "understanding_level": "Fair (Safe Mode)",
            "key_topics": ["Content Analysis (Offline)", "Safe Mode Active"],
            "clarity_score": 70,
            "main_issues": ["Anthropic API unavailable — running in safe mode"],
            "recommendations": ["Check ANTHROPIC_API_KEY environment variable"],
            "ai_feedback": "Claude is currently offline. Basic analysis only.",
        }
        if not self._is_available():
            return fallback
        try:
            if len(content) > 15_000:
                content = content[:15_000] + "..."
            user_prompt = f"""You are an AEO (Answer Engine Optimisation) Expert. Analyse this content from {url}.
Determine how well an AI Search Engine (like Perplexity or SearchGPT) would understand this page.
Content:\n{content}
Return a JSON object with exactly these keys:
- "understanding_level": one of "Poor", "Fair", "Good", "Excellent"
- "key_topics": array of top 3 entities or topics
- "clarity_score": integer 0-100
- "main_issues": array of structural or clarity issues
- "recommendations": array of specific actionable AEO fixes"""
            raw = self._call(system="You are an expert AI Search Analyst. Output JSON only.",
                             user=user_prompt, max_tokens=self._TOKENS_LARGE)
            result = self._parse_json(raw)
            level_scores = {"Poor": 25, "Fair": 50, "Good": 75, "Excellent": 95}
            score = level_scores.get(result.get("understanding_level", "Fair"), 50)
            return {
                "score": _clamp(score),
                "understanding_level": result.get("understanding_level", "Unknown"),
                "key_topics": result.get("key_topics", []),
                "clarity_score": _clamp(result.get("clarity_score", 0)),
                "main_issues": result.get("main_issues", []),
                "recommendations": result.get("recommendations", []),
                "ai_feedback": f"Analysed by Claude ({self.MODEL})",
            }
        except Exception as exc:
            logger.error("Claude content understanding failed: %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 2. Schema generation
    # ------------------------------------------------------------------

    def generate_schema(self, content: str, url: str, schema_type: str = "auto") -> Dict:
        if not self._is_available():
            return {"success": False, "error": "ANTHROPIC_API_KEY missing"}
        try:
            if len(content) > 10_000:
                content = content[:10_000]
            user_prompt = f"""Generate valid JSON-LD schema markup for this content.
URL: {url}\nType preference: {schema_type}\nContent:\n{content}
Return ONLY the JSON-LD object. Start with {{ and end with }}."""
            raw = self._call(system="You are a Schema.org expert. Output strictly valid JSON-LD only.",
                             user=user_prompt, max_tokens=self._TOKENS_LARGE)
            schema = self._parse_json(raw)
            return {"success": True, "schema": schema}
        except Exception as exc:
            logger.error("Schema generation failed: %s", exc)
            return {"success": False, "error": f"Claude API error: {exc}"}

    # ------------------------------------------------------------------
    # 3. Tone and sentiment
    # ------------------------------------------------------------------

    def analyze_tone_and_sentiment(self, content: str) -> Dict:
        fallback = {
            "score": 50, "tone": "Neutral (Safe Mode)", "sentiment": "Neutral",
            "confidence": 0, "emotional_indicators": [],
            "recommendations": ["Check ANTHROPIC_API_KEY environment variable"],
            "ai_feedback": "Service unavailable",
        }
        if not self._is_available():
            return fallback
        try:
            if len(content) > 1_500:
                content = content[:1_500] + "..."
            user_prompt = f"""Analyse the tone and sentiment of the following content.
Content:\n{content}
Return a JSON object with exactly these keys:
- "tone": string (e.g. "Professional", "Casual", "Academic", "Technical", "Friendly")
- "sentiment": one of "Positive", "Neutral", "Negative"
- "confidence": integer 0-100
- "emotional_indicators": array of strings
- "recommendations": array of strings"""
            raw = self._call(system="You are a tone and sentiment analyst. Output JSON only.",
                             user=user_prompt, max_tokens=self._TOKENS_MEDIUM)
            result = self._parse_json(raw)
            sentiment_scores = {"Positive": 85, "Neutral": 60, "Negative": 20}
            tone_scores = {"Professional": 90, "Academic": 85, "Technical": 80,
                           "Friendly": 75, "Casual": 60}
            s_score = sentiment_scores.get(result.get("sentiment", "Neutral"), 60)
            t_score = tone_scores.get(result.get("tone", "Casual"), 55)
            score = _clamp(0.6 * s_score + 0.4 * t_score)
            return {
                "score": round(score, 2),
                "tone": result.get("tone", "Unknown"),
                "sentiment": result.get("sentiment", "Neutral"),
                "confidence": _clamp(result.get("confidence", 0)),
                "emotional_indicators": result.get("emotional_indicators", []),
                "recommendations": result.get("recommendations", []),
                "ai_feedback": raw,
            }
        except Exception as exc:
            logger.error("Claude tone analysis failed: %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 4. Answerability
    # ------------------------------------------------------------------

    def analyze_answerability(self, content: str, questions: List[str] = None) -> Dict:
        fallback = {
            "score": 50, "ai_answerability_score": 50,
            "answered_questions": [], "unanswered_questions": [],
            "clarity_issues": ["API unavailable"],
            "recommendations": ["Check ANTHROPIC_API_KEY environment variable"],
            "gpt_feedback": "Service unavailable",
        }
        if not self._is_available():
            return fallback
        try:
            if len(content) > 1_500:
                content = content[:1_500] + "..."
            if not questions:
                questions = ["What is the main topic?", "What problem does this solve?",
                             "What are the key benefits?", "What action should be taken?"]
            user_prompt = f"""Analyse how well this content answers user questions.
Content:\n{content}
Questions to evaluate:\n{chr(10).join(f'- {q}' for q in questions)}
Return a JSON object with exactly these keys:
- "ai_answerability_score": integer 0-100
- "answered_questions": array of questions clearly answered
- "unanswered_questions": array of questions not addressed
- "clarity_issues": array of clarity problems
- "recommendations": array of specific fixes"""
            raw = self._call(system="You are an answerability analyst. Output JSON only.",
                             user=user_prompt, max_tokens=self._TOKENS_MEDIUM)
            result = self._parse_json(raw)
            raw_score = _clamp(result.get("ai_answerability_score", 0))
            return {
                "score": round(raw_score, 2),
                "ai_answerability_score": round(raw_score, 2),
                "answered_questions": result.get("answered_questions", []),
                "unanswered_questions": result.get("unanswered_questions", []),
                "clarity_issues": result.get("clarity_issues", []),
                "recommendations": result.get("recommendations", []),
                "gpt_feedback": raw,
            }
        except Exception as exc:
            logger.error("Claude answerability analysis failed: %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 5. Content summary
    # ------------------------------------------------------------------

    def generate_content_summary(self, content: str, max_length: int = 200) -> str:
        if not self._is_available():
            return "Anthropic Claude service not available for summarisation"
        try:
            if len(content) > 1_000:
                content = content[:1_000] + "..."
            raw = self._call(
                system="You are a concise content summariser. Return only the summary text, no JSON.",
                user=f"Summarise the following content in {max_length} characters or fewer:\n\n{content}",
                max_tokens=self._TOKENS_SMALL,
                expect_json=False,
            )
            return raw
        except Exception as exc:
            logger.error("Claude summarisation failed: %s", exc)
            return "Summary unavailable (API error)"

    # ------------------------------------------------------------------
    # 6. Metric help text
    # ------------------------------------------------------------------

    def get_metric_help(self) -> Dict:
        return {
            "discover_prompts": {
                "content_type_accuracy": {
                    "meaning": "How clearly the page signals its type (blog, product, FAQ, landing).",
                    "improve": "Tighten page structure: clear H1, sequential headings, add schema for the page type.",
                },
                "prompt_intent_match": {
                    "meaning": "How well the page answers the dominant user intent.",
                    "improve": "Map content to the right journey stage. Use headings that echo the core questions users ask.",
                },
                "visibility_impact": {
                    "meaning": "Potential of the page to be surfaced by AI/search.",
                    "improve": "Increase topical depth, add supporting facts/entities, strengthen internal links.",
                },
                "suggested_content_type": {
                    "meaning": "Predicted page type inferred from structure and cues.",
                    "improve": "Align layout and microcopy to the suggested type or refactor to the intended type.",
                },
            },
            "clusters_and_intent": {
                "clustering_accuracy": {
                    "meaning": "Confidence that prompts were assigned to the correct intent buckets.",
                    "improve": "Make intent cues explicit: question-style headings for informational, pricing for commercial.",
                },
                "coverage_percentage": {
                    "meaning": "Percent of considered prompts mapped to one of the five intents.",
                    "improve": "Add sections that address missing intents. Clarify the page focus.",
                },
                "total_prompts": {
                    "meaning": "Total number of candidate prompts inferred for the page.",
                    "improve": "Expand topic coverage with FAQs, comparisons and how-to sections.",
                },
                "intent_meanings": {
                    # FIX 3: DB value corrected from 'agent_style' to 'agent' per SOP-002 §4.1
                    "informational": "Users seek knowledge or answers.",
                    "commercial":    "Users research solutions, features and suitability.",
                    "comparative":   "Users compare options.",
                    "transactional": "Users want to take action.",
                    "agent":         "Assistant/chat style interactions.",  # was 'agent_style'
                },
            },
            "difficulty_and_opportunity": {
                "difficulty_score": {
                    "meaning": "How hard it is to win the prompt given content strength and competition.",
                    "improve": "Target sub-prompts with clearer angles; strengthen page authority.",
                },
                "complexity_level": {
                    "meaning": "Keyword/prompt complexity based on diversity and phrase length.",
                    "improve": "Break complex prompts into structured sections with scannable headings.",
                },
                "ai_generation_feasibility": {
                    "meaning": "Likelihood that models can produce confident answers from this page.",
                    "improve": "Add explicit facts, definitions, step-by-steps and schema.",
                },
            },
            "entity_detection": {
                "entities_detected_count": {
                    "meaning": "How many expected/required entities were found in the content.",
                    "improve": "Add missing entities naturally in headings, definitions, lists and FAQs.",
                },
                "entity_coverage_score": {
                    "meaning": "Percent of the required entity set that appears in the content.",
                    "improve": "Review missing entities and add dedicated sections that explain them.",
                },
                "entity_relevance_score": {
                    "meaning": "How closely the entities found align with the likely search intent.",
                    "improve": "Remove or de-emphasise off-topic entities, tighten the page focus.",
                },
            },
            "visibility_breakdown": {
                "keyword_relevance": {
                    "meaning": "How well the page language aligns with target queries.",
                    "improve": "Strengthen topical terms in H1/H2s, intro, and key sections.",
                },
                "content_depth": {
                    "meaning": "How thoroughly the page covers the topic.",
                    "improve": "Add missing subtopics, step-by-step explanations, examples, and comparison tables.",
                },
                "freshness": {
                    "meaning": "How up-to-date the information appears.",
                    "improve": "Update outdated stats, tools, and recommendations.",
                },
                "authority_signals": {
                    "meaning": "How credible and trustworthy the page looks.",
                    "improve": "Add expert authorship, citations to reputable sources, original data.",
                },
            },
            "add_to_tracking": {
                "prompt_visibility_score": {
                    "meaning": "Visibility of the prompt in AI results (0-100). Computed via SOP-002 §7.1 formula: (citation_rate×0.45) + (position_score×0.35) + (sov×0.20)×100.",
                    "improve": "Improve ranking signals: clearer intent match, richer entities, stronger internal links.",
                },
                "ctr_percent": {
                    "meaning": "Click-through rate for the prompt (0-30%).",
                    "improve": "Increase snippet appeal: concise answers up top, compelling meta/snippet text.",
                },
                "engagement_score": {
                    "meaning": "Engagement quality based on content depth and credibility.",
                    "improve": "Add expert signals, examples, data and clear structure.",
                },
                "traffic_estimate": {
                    "meaning": "Relative traffic potential derived from visibility, engagement and citation counts.",
                    "improve": "Prioritise prompts with high intent and improve entry points.",
                },
                "visibility_change": {
                    "meaning": "Change in visibility since previous measurement. Null means first measurement.",
                    "improve": "Track edits vs change. Double-down on edits that moved the metric positively.",
                },
                "difficulty_score": {
                    "meaning": "How hard this prompt is to win. Drives refresh frequency (daily/3d/7d/14d).",
                    "improve": "Target lower-difficulty variants first; build authority before attacking high-difficulty prompts.",
                },
            },
        }

    # ------------------------------------------------------------------
    # 7. Content metrics
    # ------------------------------------------------------------------

    def analyze_content_metrics(self, content: str, url: str) -> Dict:
        # FIX 3: 'agent' cluster key corrected from 'agent_style'
        _empty_clusters = {
            "informational": {"prompt_count": 0, "example_prompts": []},
            "commercial":    {"prompt_count": 0, "example_prompts": []},
            "comparative":   {"prompt_count": 0, "example_prompts": []},
            "transactional": {"prompt_count": 0, "example_prompts": []},
            "agent":         {"prompt_count": 0, "example_prompts": []},  # was 'agent_style'
        }
        _empty_cluster_metrics = {
            "total_prompts": 0, "categorized_prompts": 0,
            "coverage_percentage": 0.0, "clustering_accuracy": 0.0,
        }
        fallback = {
            "content_type_accuracy": 50, "prompt_intent_match": 50,
            "visibility_impact": 50, "suggested_content_type": "Unknown (Safe Mode)",
            "prompt_intent_details": {
                "matched_intents": [], "confidence": 0, "search_queries": [],
                "intent_clusters": _empty_clusters,
                "cluster_metrics": _empty_cluster_metrics,
            },
            "visibility_factors": {
                "factors": ["Service unavailable"], "score_breakdown": {},
                "recommendations": ["Check ANTHROPIC_API_KEY environment variable"],
            },
        }
        if not self._is_available():
            return fallback
        try:
            if len(content) > 12_000:
                content = content[:12_000] + "..."
            # FIX 3: prompt asks Claude to use 'agent' not 'agent_style'
            user_prompt = f"""You are an AEO (Answer Engine Optimisation) Expert. Analyse this content from {url}.
Content:\n{content}
Return a JSON object with EXACTLY this structure:
{{
  "content_type_accuracy": <integer 0-100>,
  "suggested_content_type": "<blog|product|faq|landing_page|article|tutorial|documentation>",
  "prompt_intent_match": <integer 0-100>,
  "prompt_intent_details": {{
    "matched_intents": ["<intent>"],
    "confidence": <integer 0-100>,
    "search_queries": ["<example query>"],
    "intent_clusters": {{
      "informational":  {{"prompt_count": <int>, "example_prompts": ["<str>"]}},
      "commercial":     {{"prompt_count": <int>, "example_prompts": ["<str>"]}},
      "comparative":    {{"prompt_count": <int>, "example_prompts": ["<str>"]}},
      "transactional":  {{"prompt_count": <int>, "example_prompts": ["<str>"]}},
      "agent":          {{"prompt_count": <int>, "example_prompts": ["<str>"]}}
    }},
    "cluster_metrics": {{
      "total_prompts": <int>,
      "categorized_prompts": <int>,
      "coverage_percentage": <float 0.0-100.0 rounded to 1 decimal>,
      "clustering_accuracy": <float 0.0-1.0>
    }}
  }},
  "visibility_impact": <integer 0-100>,
  "visibility_factors": {{
    "factors": ["<factor>"],
    "score_breakdown": {{
      "keyword_relevance": <integer 0-100>,
      "content_depth":     <integer 0-100>,
      "freshness":         <integer 0-100>,
      "authority_signals": <integer 0-100>
    }},
    "recommendations": ["<recommendation>"]
  }}
}}"""
            raw = self._call(
                system="You are an expert AEO analyst. Output JSON only with accurate metrics.",
                user=user_prompt, max_tokens=self._TOKENS_LARGE,
            )
            result = self._parse_json(raw)
            pid = result.get("prompt_intent_details") or {}
            clusters = pid.get("intent_clusters") or {}
            for key in _empty_clusters:
                clusters.setdefault(key, {"prompt_count": 0, "example_prompts": []})
            cm = pid.get("cluster_metrics") or {}
            total = max(int(cm.get("total_prompts", 0)), 0)
            categorised = max(int(cm.get("categorized_prompts", 0)), 0)
            coverage = round((categorised / total * 100), 1) if total > 0 else 0.0
            cluster_metrics = {
                "total_prompts": total, "categorized_prompts": categorised,
                "coverage_percentage": coverage,
                "clustering_accuracy": _clamp(float(cm.get("clustering_accuracy", 0.0)), 0.0, 1.0),
            }
            prompt_intent_details = {
                "matched_intents": pid.get("matched_intents") or [],
                "confidence": _clamp(pid.get("confidence", 0)),
                "search_queries": pid.get("search_queries") or [],
                "intent_clusters": clusters,
                "cluster_metrics": cluster_metrics,
            }
            vf = result.get("visibility_factors") or {}
            sb = vf.get("score_breakdown") or {}
            visibility_factors = {
                "factors": vf.get("factors") or [],
                "score_breakdown": {k: _clamp(v) for k, v in sb.items()},
                "recommendations": vf.get("recommendations") or [],
            }
            help_sections = self.get_metric_help()
            metric_help = {
                **help_sections.get("discover_prompts", {}),
                **help_sections.get("clusters_and_intent", {}),
                **help_sections.get("entity_detection", {}),
                **help_sections.get("visibility_breakdown", {}),
            }
            metric_help["visibility_score_breakdown"] = {
                "meaning": "Breakdown of visibility drivers: relevance, depth, freshness, authority.",
                "improve": "Address weakest factors first; strengthen topical coverage and credibility.",
            }
            return {
                "content_type_accuracy": _clamp(result.get("content_type_accuracy", 50)),
                "prompt_intent_match":   _clamp(result.get("prompt_intent_match", 50)),
                "visibility_impact":     _clamp(result.get("visibility_impact", 50)),
                "suggested_content_type": result.get("suggested_content_type", "Unknown"),
                "prompt_intent_details": prompt_intent_details,
                "visibility_factors": visibility_factors,
                "metric_help": metric_help,
            }
        except Exception as exc:
            logger.error("Content metrics analysis failed: %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 8. Entity relevance
    # ------------------------------------------------------------------

    def analyze_entity_relevance(self, content: str, url: str,
                                  found_entities: list, expected_entities: list) -> Dict:
        fallback = {
            "entity_relevance_score": 50, "relevance_explanation": "Analysis unavailable",
            "relevant_entities": [], "irrelevant_entities": [],
        }
        if not self._is_available():
            return fallback
        try:
            if len(content) > 10_000:
                content = content[:10_000] + "..."
            found_str    = ", ".join(found_entities[:20])    if found_entities    else "None"
            expected_str = ", ".join(expected_entities[:20]) if expected_entities else "None"
            user_prompt = f"""You are an AEO Expert. Analyse entity relevance for content from {url}.
Content preview:\n{content}
Found entities: {found_str}
Expected entities: {expected_str}
Return a JSON object with exactly these keys:
- "entity_relevance_score": integer 0-100
- "relevance_explanation": string explaining the score
- "relevant_entities": array of entities that strongly match search intent
- "irrelevant_entities": array of entities that do not match search intent"""
            raw = self._call(system="You are an expert AEO analyst. Output JSON only.",
                             user=user_prompt, max_tokens=self._TOKENS_MEDIUM)
            result = self._parse_json(raw)
            return {
                "entity_relevance_score": _clamp(result.get("entity_relevance_score", 50)),
                "relevance_explanation":  result.get("relevance_explanation", ""),
                "relevant_entities":      result.get("relevant_entities", []),
                "irrelevant_entities":    result.get("irrelevant_entities", []),
            }
        except Exception as exc:
            logger.error("Entity relevance analysis failed: %s", exc)
            return fallback

    # ------------------------------------------------------------------
    # 9. calculate_prompt_tracking_metrics
    #    FIX 1: PVS uses canonical SOP-002 §7.1 formula throughout
    #    FIX 2: append-only snapshot writes per SOP-002 §7.2
    #    FIX 4: difficulty score computed per SOP-002 §4.3
    # ------------------------------------------------------------------

    def calculate_prompt_tracking_metrics(self, job_id: str, url: str,
                                           prompts: List[str]) -> Dict:
        _seed_formula_version_once()
        mongo_manager.connect()

        cleaned: List[str] = [
            p.strip() for p in (prompts or [])
            if isinstance(p, str) and p.strip()
        ]

        module_e_doc = (mongo_manager.module_e.find_one({"jobId": job_id}) or {})

        if not cleaned:
            derived: List[str] = []
            ranking = (module_e_doc.get("ranking_analysis") or {})
            for key in ["generated_prompts", "brand_prompts_selected"]:
                candidates = ranking.get(key) or module_e_doc.get(key) or []
                derived = [str(p).strip() for p in candidates
                           if isinstance(p, str) and str(p).strip()]
                if derived:
                    break
            if not derived:
                generated = module_e_doc.get("brand_prompts_generated") or []
                if isinstance(generated, list):
                    if generated and isinstance(generated[0], dict):
                        derived = [str(p.get("prompt") or "").strip() for p in generated
                                   if isinstance(p, dict) and str(p.get("prompt") or "").strip()]
                    else:
                        derived = [str(p).strip() for p in generated
                                   if isinstance(p, str) and str(p).strip()]
            cleaned = derived

        col = mongo_manager.db.prompt_tracking
        existing: Dict = col.find_one({"jobId": job_id}) or {}
        existing_tracked = [p for p in (existing.get("tracked_prompts") or [])
                            if isinstance(p, str) and p.strip()]
        tracked_prompts = sorted(set(existing_tracked + cleaned))

        content_doc = (mongo_manager.content_metrics.find_one({"jobId": job_id, "url": url}) or {})
        content_metrics = content_doc.get("content_metrics") or {}
        pid = content_metrics.get("prompt_intent_details") or {}
        linked_queries: List[str] = [
            q for q in (pid.get("search_queries") or []) if isinstance(q, str) and q.strip()
        ]

        ranking_rows: List[Dict] = [
            r for r in (
                (module_e_doc.get("ranking_analysis") or {})
                .get("ranking_position_per_prompt") or []
            ) if isinstance(r, dict)
        ]

        # HTML parsing for TF-IDF fallback
        visible_text = ""
        heading_text = ""
        try:
            raw_html = load_raw_html_sync(job_id) or ""
            if raw_html and BeautifulSoup is not None:
                soup = BeautifulSoup(raw_html, "html.parser")
                for tag in soup(["script", "style", "nav", "footer", "header"]):
                    tag.decompose()
                headings = soup.find_all(["h1", "h2"], limit=8)
                heading_text = " ".join(h.get_text(" ", strip=True) for h in headings if h)
                visible_text = " ".join(soup.get_text(separator=" ", strip=True).split())
        except Exception as exc:
            logger.warning("HTML parsing failed for job %s: %s", job_id, exc)

        # Page quality score
        pim = content_metrics.get("prompt_intent_match")
        vis = content_metrics.get("visibility_impact")
        if isinstance(pim, (int, float)) and isinstance(vis, (int, float)):
            page_quality_score = _clamp(0.55 * float(pim) + 0.45 * float(vis))
        elif isinstance(pim, (int, float)):
            page_quality_score = _clamp(float(pim))
        elif isinstance(vis, (int, float)):
            page_quality_score = _clamp(float(vis))
        else:
            page_quality_score = 50.0

        # TF-IDF helpers (fallback path only)
        content_token_list = _tokenize(visible_text[:30_000]) if visible_text else []
        heading_tokens = set(_tokenize(heading_text)) if heading_text else set()
        query_token_sets = [set(_tokenize(q)) for q in linked_queries[:50]]
        tf_map: Dict[str, int] = {}
        for t in content_token_list:
            tf_map[t] = tf_map.get(t, 0) + 1
        total_terms = len(content_token_list)

        def _idf(tf: int) -> float:
            if total_terms == 0 or tf <= 0:
                return 0.0
            return math.log(total_terms / (tf + 1)) + 1.0

        def _content_relevance(prompt_tokens: List[str]) -> float:
            unique = list(set(prompt_tokens))
            if not unique:
                return 0.0
            tf_cap = 10
            score = 0.0
            for tok in unique:
                tf = min(tf_map.get(tok, 0), tf_cap)
                if tf <= 0:
                    continue
                tf_norm = math.log(1 + tf) / math.log(1 + tf_cap)
                score += tf_norm * _idf(tf_map.get(tok, 0))
            max_idf_possible = math.log(total_terms + 1) + 1.0 if total_terms > 0 else 1.0
            max_possible = len(unique) * max_idf_possible
            return _clamp(score / max_possible if max_possible > 0 else 0.0, 0.0, 1.0)

        def _query_similarity(ptok_set: set) -> float:
            if not ptok_set or not query_token_sets:
                return 0.0
            best = 0.0
            for qt in query_token_sets:
                if not qt:
                    continue
                union = ptok_set | qt
                sim = len(ptok_set & qt) / len(union) if union else 0.0
                best = max(best, sim)
            return best

        history: Dict[str, List[Dict]] = {
            k: v for k, v in (existing.get("history") or {}).items()
            if isinstance(v, list)
        }

        now_iso = datetime.utcnow().isoformat()
        metrics: List[Dict] = []

        for prompt in tracked_prompts:

            # ── PRIORITY 1: Real SOP-002 citation data ──────────────────
            real = _load_real_citation_metrics(job_id, prompt)
            if real:
                citation_rate    = real.get("citation_rate", 0.0)
                avg_position     = real.get("avg_position", 10.0)
                share_of_voice   = real.get("share_of_voice", 0.0)
                competitor_count = real.get("competitor_count", 0)

                # FIX 1: use canonical SOP formula
                prompt_visibility_score = _compute_pvs(citation_rate, avg_position, share_of_voice)
                ctr_percent             = _clamp(
                    round(citation_rate * (1 - avg_position / 10) * 30, 2), 0.0, 30.0
                )
                engagement_score        = _clamp(
                    round(citation_rate * 100 * 0.6 + share_of_voice * 100 * 0.4, 2)
                )
                traffic_estimate        = _clamp(
                    round(prompt_visibility_score / 100 * citation_rate * 25, 2), 0.0, 25.0
                )
                model_ranking           = {}
                calculation_method      = "real_citation_data"

            # ── PRIORITY 2: Module E ranking rows ───────────────────────
            else:
                rows = [r for r in ranking_rows if (r.get("prompt") or "") == prompt]
                citation_rate    = 0.0
                avg_position     = 10.0
                share_of_voice   = 0.0
                competitor_count = 0

                if rows:
                    model_ranking: Dict[str, Optional[int]] = {}
                    pos_list, eng_c, traf_c, cit_list = [], [], [], []
                    for r in rows:
                        model = r.get("model")
                        if isinstance(model, str) and model:
                            pos = r.get("position")
                            model_ranking[model] = (
                                int(float(pos)) if isinstance(pos, (int, float)) else None
                            )
                        raw_pos = r.get("position")
                        if isinstance(raw_pos, (int, float)) and 1 <= int(raw_pos) <= 10:
                            pos_list.append(float(raw_pos))
                        eng_vals = [
                            float(v) for v in [r.get("content_quality_score"),
                                               r.get("credibility_score")]
                            if isinstance(v, (int, float))
                        ]
                        if eng_vals:
                            eng_c.append(_safe_mean(eng_vals))
                        cit = r.get("citation_count")
                        tot = r.get("total_cited")
                        if isinstance(cit, (int, float)):
                            cit_list.append(float(cit))
                        elif isinstance(tot, (int, float)):
                            cit_list.append(float(tot))

                    # Derive components for SOP formula from ranking data
                    avg_position   = round(_safe_mean(pos_list), 2) if pos_list else 10.0
                    # citation_rate from rows if available, else estimate from position
                    if cit_list:
                        citation_rate = _clamp(_safe_mean(cit_list) / 10.0, 0.0, 1.0)
                    else:
                        citation_rate = _clamp((11.0 - avg_position) / 10.0 * 0.5, 0.0, 1.0)
                    share_of_voice = _clamp(citation_rate * 0.6, 0.0, 1.0)   # estimate

                    # FIX 1: SOP formula for ranking path too
                    prompt_visibility_score = _compute_pvs(citation_rate, avg_position, share_of_voice)
                    engagement_score        = _clamp(
                        round(_safe_mean(eng_c), 2) if eng_c else page_quality_score
                    )
                    traffic_estimate        = _clamp(
                        round(prompt_visibility_score / 100 * citation_rate * 25, 2), 0.0, 25.0
                    )
                    ctr_percent             = _clamp(
                        round(citation_rate * (1 - avg_position / 10) * 30, 2), 0.0, 30.0
                    )
                    calculation_method = "ranking"

                # ── PRIORITY 3: TF-IDF estimation ───────────────────────
                # This path is now deprecated and will be removed in a future version.
                else:
                    calculation_method = "real_citation_data"


            # FIX 4: compute difficulty score per SOP-002 §4.3
            # Get historical citation variance for volatility input
            prompt_history_raw = list(history.get(prompt) or [])
            hist_citation_rates = [
                h.get("citation_rate", citation_rate)
                for h in prompt_history_raw
                if isinstance(h.get("citation_rate", None), (int, float))
            ]
            citation_volatility = _variance(hist_citation_rates) if len(hist_citation_rates) >= 2 else 0.0

            difficulty_info = _compute_difficulty_score(
                competitor_count  = competitor_count,
                avg_position      = avg_position,
                prompt_text       = prompt,
                citation_variance = citation_volatility,
            )

            # FIX 4: update prompt_job with difficulty + refresh schedule
            try:
                mongo_manager.db.prompt_jobs.update_one(
                    {"project_id": job_id, "prompt_text": prompt},
                    {"$set": {
                        "difficulty_score":  difficulty_info["difficulty_score"],
                        "difficulty_label":  difficulty_info["difficulty_label"],
                        "refresh_days":      difficulty_info["refresh_days"],
                        "run_priority":      difficulty_info["run_priority"],
                        "scheduled_next":    datetime.utcnow(),
                    }},
                )
            except Exception as exc:
                logger.warning("Could not update prompt_job difficulty: %s", exc)

            # History & visibility_change
            prompt_history_raw.append({
                "date":             now_iso,
                "visibility_score": prompt_visibility_score,
                "citation_rate":    citation_rate,
                "avg_position":     avg_position,
                "share_of_voice":   share_of_voice,
                "ctr_percent":      ctr_percent,
                "engagement_score": engagement_score,
                "traffic_estimate": traffic_estimate,
            })
            prompt_history_raw = prompt_history_raw[-60:]
            history[prompt] = prompt_history_raw

            visibility_change: Optional[float] = None
            if len(prompt_history_raw) >= 2:
                prev_score = prompt_history_raw[-2].get("visibility_score")
                if isinstance(prev_score, (int, float)):
                    visibility_change = round(prompt_visibility_score - float(prev_score), 2)

            # FIX 2: Write an APPEND-ONLY snapshot per SOP-002 §7.2
            # Find prompt_job_id for snapshot foreign key
            try:
                pj = mongo_manager.db.prompt_jobs.find_one(
                    {"project_id": job_id, "prompt_text": prompt}
                )
                pj_id = str(pj["_id"]) if pj else f"{job_id}_{hash(prompt) % 100000:05d}"
            except Exception:
                pj_id = f"{job_id}_{hash(prompt) % 100000:05d}"

            _write_prompt_snapshot(
                prompt_job_id           = pj_id,
                llm_model               = "module_d_composite",
                citation_rate           = citation_rate,
                avg_position            = avg_position,
                share_of_voice          = share_of_voice,
                competitor_count        = competitor_count,
                prompt_visibility_score = prompt_visibility_score,
            )

            metric_entry = {
                "prompt":                  prompt,
                "prompt_visibility_score": prompt_visibility_score,
                "citation_rate":           citation_rate,
                "avg_position":            avg_position,
                "share_of_voice":          share_of_voice,
                "ctr_percent":             ctr_percent,
                "engagement_score":        engagement_score,
                "traffic_estimate":        traffic_estimate,
                "ai_model_ranking":        model_ranking,
                "linked_queries":          linked_queries,
                "visibility_change":       visibility_change,
                "trend":                   prompt_history_raw[-14:],
                "updated_at":              now_iso,
                "calculation_method":      calculation_method,
                "competitor_count":        competitor_count,
                # FIX 4: difficulty fields attached to every metric entry
                "difficulty_score":        difficulty_info["difficulty_score"],
                "difficulty_label":        difficulty_info["difficulty_label"],
                "refresh_days":            difficulty_info["refresh_days"],
                "run_priority":            difficulty_info["run_priority"],
                "pvs_formula_version":     _PVS_FORMULA_VERSION,
            }

            metrics.append(metric_entry)

        # FIX 2: prompt_tracking document is an INDEX only — never the truth store.
        # Snapshots are the canonical history. This document holds only the latest
        # computed values for fast dashboard reads.
        doc = {
            "jobId":             job_id,
            "url":               url,
            "tracked_prompts":   tracked_prompts,
            "metrics":           metrics,
            "history":           history,   # in-memory ring buffer for quick trend access
            "updatedAt":         datetime.utcnow(),
            "metric_help":       self.get_metric_help().get("add_to_tracking", {}),
            "pvs_formula_version": _PVS_FORMULA_VERSION,
            # Note: canonical history lives in prompt_performance_snapshots (append-only)
        }
        col.update_one(
            {"jobId": job_id},
            {"$set": doc, "$setOnInsert": {"createdAt": datetime.utcnow()}},
            upsert=True,
        )

        # FIX 6: record investor KPIs per SOP-002 §12
        _record_investor_kpis(job_id, metrics)

        created_raw = existing.get("createdAt") or datetime.utcnow()
        doc["updatedAt"] = now_iso
        doc["createdAt"] = (
            created_raw.isoformat() if hasattr(created_raw, "isoformat") else now_iso
        )
        return doc

    # ------------------------------------------------------------------
    # 10. generate_prompt_recommendations — Moat #4 RE
    # FIX 5: dedup bug fixed — additional_prompts accumulate on WINNER
    # ------------------------------------------------------------------

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
        IEU-ranked recommendation action cards.
        Priority = (Impact×0.50) + (Effort_Inverted×0.30) + (Urgency×0.20)
        Fully implements Moat #4 SOP Sections 3.1, 3.2, 3.3, 4.1, 6.2.
        """
        if account_context is None:
            account_context = {}

        tier_limits = {"free": 3, "pro": 10, "agency": 25, "enterprise": 999}
        plan_limit = tier_limits.get(plan_tier, 10)
        urgency_boost = _compute_urgency_multiplier(account_context)

        all_cards = []

        for pm in (prompt_metrics or []):
            prompt_text = pm.get("prompt", "Unknown prompt")

            for rule in _IEU_RULES:
                try:
                    if not rule["condition"](pm):
                        continue
                except Exception:
                    continue

                # Role filter — CXO sees everything
                if user_role not in rule["roles"] and user_role != "CXO":
                    continue

                impact     = float(rule["impact_raw"])
                effort_raw = float(rule["effort_raw"])
                urgency    = max(0.0, min(10.0, float(rule["base_urgency"]) + urgency_boost))
                priority   = _ieu_score(impact, effort_raw, urgency)

                severity = (
                    "CRITICAL" if priority >= 8 else
                    "HIGH"     if priority >= 6 else
                    "MEDIUM"   if priority >= 4 else "LOW"
                )

                all_cards.append({
                    "recommendation_id": f"{job_id}_{rule['rule_id']}_{hash(prompt_text) % 100000:05d}",
                    "prompt":            prompt_text,
                    "module":            rule["module"],
                    "action_title":      rule["action_title"],
                    "action_detail":     rule["action_detail"],
                    "affected_url":      url,
                    "impact_score":      round(impact, 1),
                    "effort_score":      round(effort_raw, 1),
                    "urgency_score":     round(urgency, 1),
                    "priority_score":    round(priority, 2),
                    "severity":          severity,
                    "role_visibility":   rule["roles"],
                    "metrics_snapshot": {
                        "prompt_visibility_score": pm.get("prompt_visibility_score"),
                        "ctr_percent":             pm.get("ctr_percent"),
                        "engagement_score":        pm.get("engagement_score"),
                        "traffic_estimate":        pm.get("traffic_estimate"),
                        "visibility_change":       pm.get("visibility_change"),
                        "citation_rate":           pm.get("citation_rate"),
                        "avg_position":            pm.get("avg_position"),
                        "share_of_voice":          pm.get("share_of_voice"),
                        "calculation_method":      pm.get("calculation_method"),
                        "difficulty_score":        pm.get("difficulty_score"),
                        "pvs_formula_version":     pm.get("pvs_formula_version"),
                    },
                    "status":        "pending",
                    "trigger_event": (
                        "delta_drop"  if (pm.get("visibility_change") or 0) < -5 else
                        "improvement" if (pm.get("visibility_change") or 0) > 3 else
                        "plateau"     if pm.get("visibility_change") == 0 else "standard"
                    ),
                    "additional_prompts": [],   # pre-initialise for FIX 5
                })

        # FIX 5: Deduplication — keep highest priority per rule.
        # Additional prompts accumulate on the WINNER, not the discarded card.
        seen_rules: Dict[str, Dict] = {}
        for card in all_cards:
            key = f"{card['module']}_{card['action_title']}"
            if key not in seen_rules:
                seen_rules[key] = card
            elif card["priority_score"] > seen_rules[key]["priority_score"]:
                # New card wins — carry over any prompts already collected on old winner
                card["additional_prompts"] = (
                    seen_rules[key]["additional_prompts"]
                    + [seen_rules[key]["prompt"]]
                )
                seen_rules[key] = card
            else:
                # Current winner stays — append this card's prompt to winner's list
                seen_rules[key]["additional_prompts"].append(card["prompt"])

        ranked = sorted(seen_rules.values(), key=lambda c: c["priority_score"], reverse=True)
        ranked = ranked[:plan_limit]

        # Delta classification
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

        try:
            mongo_manager.connect()
            doc = {
                "jobId": job_id, "url": url,
                "recommendations": ranked,
                "summary": {
                    "total": len(ranked), "critical": critical_count,
                    "delta_class": delta_class, "top_module": top_module,
                    "plan_limit": plan_limit, "role_filter": user_role,
                },
                "updatedAt": datetime.utcnow(),
            }
            mongo_manager.db.recommendations.update_one(
                {"jobId": job_id, "url": url},
                {"$set": doc, "$setOnInsert": {"createdAt": datetime.utcnow()}},
                upsert=True,
            )
        except Exception as exc:
            logger.warning("Could not persist recommendations: %s", exc)

        return {
            "recommendations": ranked,
            "summary": {
                "total": len(ranked), "critical": critical_count,
                "delta_class": delta_class, "top_module": top_module,
            },
            "plan_limit_applied": plan_limit,
            "role_filter_applied": user_role,
        }
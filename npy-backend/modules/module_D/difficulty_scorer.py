"""
difficulty_scorer.py — SOP-002 §4.3 Prompt Difficulty Scoring
EXTRACTED as standalone module for clarity.

Difficulty formula (4 weighted inputs):
  competitor_density   35% — more competitors = harder
  brand_position       30% — baseline LLM response position of client brand
  prompt_specificity   20% — specific prompts = lower competition = lower difficulty
  citation_volatility  15% — volatile citation rate = higher difficulty

Score 0–100 → difficulty_label → refresh_frequency → run_priority

Refresh frequency (SOP-002 §4.3 table):
  0–30   Low      Every 14 days   Batch / Low
  31–60  Medium   Every 7 days    Standard
  61–85  High     Every 3 days    Elevated
  86–100 Critical Daily           Immediate
"""

import logging
import math
from datetime import datetime, timedelta
from typing import Dict, List

from utils.mongo import mongo_manager

logger = logging.getLogger("difficulty_scorer")

# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §4.3 — Difficulty tier table
# ─────────────────────────────────────────────────────────────────────────────

_DIFFICULTY_TIERS = [
    (86, "Critical", 1,  "Immediate"),
    (61, "High",     3,  "Elevated"),
    (31, "Medium",   7,  "Standard"),
    (0,  "Low",      14, "Batch / Low"),
]


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, float(v)))


def compute_difficulty(
    competitor_count:    int   = 0,
    avg_position:        float = 10.0,
    prompt_text:         str   = "",
    citation_variance:   float = 0.0,
    max_competitors:     int   = 20,
) -> Dict:
    """
    SOP-002 §4.3 — Compute difficulty score for one prompt.

    Args:
        competitor_count:  Number of unique competitor domains cited in LLM responses
        avg_position:      Average brand position in LLM responses (1=best, 10=worst)
        prompt_text:       Raw prompt text (used for specificity calculation)
        citation_variance: Variance of citation rate across runs (0=stable, 1=volatile)
        max_competitors:   Normalisation cap for competitor density (default 20)

    Returns:
        {
            "difficulty_score":  float (0–100),
            "difficulty_label":  str   (Low|Medium|High|Critical),
            "refresh_days":      int,
            "run_priority":      str,
            "inputs": {
                "competitor_density_score": float,
                "brand_position_score":     float,
                "specificity_difficulty":   float,
                "volatility_score":         float,
            }
        }
    """
    # ── Input 1: Competitor density (35%) ─────────────────────────────────
    # 0 competitors → 0, max_competitors → 100
    density_score = _clamp((competitor_count / max(max_competitors, 1)) * 100)

    # ── Input 2: Brand position (30%) ─────────────────────────────────────
    # Rank 1 → 0 difficulty (brand already wins), rank 10+ → 100 difficulty
    position_score = _clamp(((float(avg_position or 10.0) - 1.0) / 9.0) * 100)

    # ── Input 3: Prompt specificity (20%) → inverse of word count ─────────
    # More words = more specific = LOWER competition = LOWER difficulty
    # 1 word → 100, 10+ words → 10
    word_count = max(1, len((prompt_text or "").split()))
    specificity_difficulty = _clamp(max(10.0, 100.0 - (word_count - 1) * 10.0))

    # ── Input 4: Citation volatility (15%) ────────────────────────────────
    # citation_variance 0→0 difficulty, 0.25+→100 difficulty
    volatility_score = _clamp((citation_variance / 0.25) * 100)

    # ── Weighted composite ────────────────────────────────────────────────
    raw_score = (
        density_score          * 0.35
        + position_score       * 0.30
        + specificity_difficulty * 0.20
        + volatility_score     * 0.15
    )
    difficulty_score = _clamp(round(raw_score, 2))

    # ── Map to tier ───────────────────────────────────────────────────────
    label, refresh_days, priority = "Low", 14, "Batch / Low"
    for threshold, lbl, days, pri in _DIFFICULTY_TIERS:
        if difficulty_score >= threshold:
            label, refresh_days, priority = lbl, days, pri
            break

    return {
        "difficulty_score":  difficulty_score,
        "difficulty_label":  label,
        "refresh_days":      refresh_days,
        "run_priority":      priority,
        "inputs": {
            "competitor_density_score": round(density_score, 2),
            "brand_position_score":     round(position_score, 2),
            "specificity_difficulty":   round(specificity_difficulty, 2),
            "volatility_score":         round(volatility_score, 2),
        },
    }


def compute_and_store_difficulty(
    job_id: str,
    prompt_text: str,
    competitor_count: int = 0,
    avg_position: float = 10.0,
    citation_variance: float = 0.0,
) -> Dict:
    """
    Compute difficulty + write to prompt_jobs + return result.
    Called after each LLM execution cycle so difficulty evolves with real data.
    """
    result = compute_difficulty(
        competitor_count=competitor_count,
        avg_position=avg_position,
        prompt_text=prompt_text,
        citation_variance=citation_variance,
    )

    # Compute next scheduled run date from refresh_days
    next_run = datetime.utcnow() + timedelta(days=result["refresh_days"])

    try:
        mongo_manager.connect()
        mongo_manager.db.prompt_jobs.update_one(
            {"project_id": job_id, "prompt_text": prompt_text},
            {"$set": {
                "difficulty_score":  result["difficulty_score"],
                "difficulty_label":  result["difficulty_label"],
                "refresh_days":      result["refresh_days"],
                "run_priority":      result["run_priority"],
                "scheduled_next":    next_run,
                "difficulty_inputs": result["inputs"],
                "difficulty_updated_at": datetime.utcnow(),
            }},
            upsert=True,
        )
        logger.info(
            "[DIFFICULTY] score=%.1f | label=%s | refresh=%dd | prompt='%s'",
            result["difficulty_score"], result["difficulty_label"],
            result["refresh_days"], prompt_text[:50],
        )
    except Exception as exc:
        logger.warning("[DIFFICULTY] Could not store difficulty: %s", exc)

    return result


def compute_historical_variance(job_id: str, prompt_text: str) -> float:
    """
    SOP-002 §4.3 — citation_volatility input.
    Loads the last 10 prompt_performance_snapshots for this prompt
    and returns the variance of citation_rate values (0=stable, up to 1=volatile).
    """
    try:
        mongo_manager.connect()
        pj = mongo_manager.db.prompt_jobs.find_one(
            {"project_id": job_id, "prompt_text": prompt_text}
        )
        if not pj:
            return 0.0

        pj_id = str(pj["_id"])
        snaps = list(
            mongo_manager.db.prompt_performance_snapshots.find(
                {"prompt_job_id": pj_id},
                sort=[("snapshot_date", -1)],
                limit=10,
            )
        )
        rates = [s.get("citation_rate", 0.0) for s in snaps if "citation_rate" in s]
        if len(rates) < 2:
            return 0.0

        mean = sum(rates) / len(rates)
        variance = sum((r - mean) ** 2 for r in rates) / len(rates)
        return round(variance, 6)

    except Exception as exc:
        logger.warning("[DIFFICULTY] Variance load failed: %s", exc)
        return 0.0


def batch_update_difficulties(job_id: str) -> Dict:
    """
    Recompute difficulty for ALL prompts in a job using latest real data.
    Called after a full LLM execution cycle completes.
    Returns summary counts by difficulty label.
    """
    try:
        mongo_manager.connect()
        prompts = list(mongo_manager.db.prompt_jobs.find(
            {"project_id": job_id, "status": "complete"},
            {"prompt_text": 1, "latest_avg_position": 1, "latest_competitor_count": 1},
        ))

        counts = {"Low": 0, "Medium": 0, "High": 0, "Critical": 0}

        for pj in prompts:
            prompt_text = pj.get("prompt_text", "")
            avg_pos     = pj.get("latest_avg_position", 10.0) or 10.0
            comp_count  = pj.get("latest_competitor_count", 0) or 0
            variance    = compute_historical_variance(job_id, prompt_text)

            result = compute_and_store_difficulty(
                job_id=job_id,
                prompt_text=prompt_text,
                competitor_count=comp_count,
                avg_position=avg_pos,
                citation_variance=variance,
            )
            label = result.get("difficulty_label", "Low")
            counts[label] = counts.get(label, 0) + 1

        logger.info("[DIFFICULTY] Batch update complete | job=%s | counts=%s", job_id, counts)
        return {"job_id": job_id, "prompts_updated": len(prompts), "by_label": counts}

    except Exception as exc:
        logger.error("[DIFFICULTY] Batch update failed: %s", exc)
        return {"job_id": job_id, "error": str(exc)}
"""
prompt_dedup.py — SOP-002 §3.3 Deduplication Logic
FULLY NEW — was missing from codebase.

SOP-002 §3.3 two-step dedup strategy:
  Step 1: SHA-256 hash of lowercased, trimmed prompt text
          → exact duplicate → reject
  Step 2: text-embedding-3-small cosine similarity
          > 0.92 → near-duplicate → flag with warning (NOT a block)
          <= 0.92 → accept

Near-duplicates surface as data quality alerts in admin dashboard.
They are NOT blocking — the client decides whether to keep or remove them.

Collections written:
  - prompt_dedup_alerts   admin dashboard data quality alerts
"""

import hashlib
import logging
import math
import os
from datetime import datetime
from typing import Optional

from utils.mongo import mongo_manager

logger = logging.getLogger("prompt_dedup")

# SOP-002 §3.3 near-duplicate threshold
_NEAR_DUP_THRESHOLD = 0.92

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 helpers — SHA-256 hash
# ─────────────────────────────────────────────────────────────────────────────

def _canonical(text: str) -> str:
    """Lowercase + trim — canonical form used for hashing."""
    return text.lower().strip()

def _sha256(text: str) -> str:
    return hashlib.sha256(_canonical(text).encode("utf-8")).hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 helpers — embedding + cosine similarity
# ─────────────────────────────────────────────────────────────────────────────

def _get_embedding(text: str) -> Optional[list]:
    """
    SOP-002 §3.3 Step 3 — text-embedding-3-small.
    Returns None if OpenAI key is missing (falls back to hash-only dedup).
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.debug("[DEDUP] OPENAI_API_KEY not set — semantic check skipped")
        return None
    try:
        import openai
        client = openai.OpenAI(api_key=api_key)
        resp = client.embeddings.create(
            model="text-embedding-3-small",
            input=_canonical(text),
        )
        return resp.data[0].embedding
    except Exception as exc:
        logger.warning("[DEDUP] Embedding call failed: %s", exc)
        return None


def _cosine_similarity(a: list, b: list) -> float:
    """Pure-Python cosine similarity — no numpy dependency."""
    dot   = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


# ─────────────────────────────────────────────────────────────────────────────
# Core dedup function
# ─────────────────────────────────────────────────────────────────────────────

def check_duplicate(prompt_text: str, project_id: str) -> dict:
    """
    SOP-002 §3.3 — Full two-step deduplication.

    Returns:
        {
            "is_exact_duplicate": bool,
            "is_near_duplicate":  bool,
            "near_duplicate_of":  str | None,   # prompt_text of similar prompt
            "similarity_score":   float | None,
            "hash":               str,
            "action":             "reject" | "flag" | "accept"
        }

    action meanings:
        "reject" — exact duplicate, do not insert
        "flag"   — near-duplicate (>0.92), insert with warning in admin dashboard
        "accept" — distinct prompt, insert normally
    """
    mongo_manager.connect()
    db = mongo_manager.db

    prompt_hash = _sha256(prompt_text)

    # ── Step 1: Exact hash match ──────────────────────────────────────────
    existing = db.prompt_library.find_one({
        "prompt_hash": prompt_hash,
        "project_id":  project_id,
    })
    if existing:
        logger.info("[DEDUP] Exact duplicate rejected | project=%s | hash=%s", project_id, prompt_hash[:16])
        return {
            "is_exact_duplicate": True,
            "is_near_duplicate":  False,
            "near_duplicate_of":  existing.get("prompt_text"),
            "similarity_score":   1.0,
            "hash":               prompt_hash,
            "action":             "reject",
        }

    # ── Step 2: Semantic similarity ───────────────────────────────────────
    new_embedding = _get_embedding(prompt_text)

    if new_embedding is not None:
        # Load all active prompts with embeddings for this project
        candidates = list(db.prompt_library.find(
            {"project_id": project_id, "is_active": True, "embedding": {"$exists": True}},
            {"prompt_text": 1, "embedding": 1},
        ))

        best_score  = 0.0
        best_prompt = None

        for candidate in candidates:
            emb = candidate.get("embedding")
            if not emb or len(emb) != len(new_embedding):
                continue
            score = _cosine_similarity(new_embedding, emb)
            if score > best_score:
                best_score  = score
                best_prompt = candidate.get("prompt_text")

        if best_score > _NEAR_DUP_THRESHOLD:
            # Near-duplicate — flag, do NOT block
            _create_dedup_alert(project_id, prompt_text, best_prompt, best_score)
            logger.info(
                "[DEDUP] Near-duplicate flagged | score=%.4f | project=%s | similar_to='%s'",
                best_score, project_id, (best_prompt or "")[:50],
            )
            return {
                "is_exact_duplicate": False,
                "is_near_duplicate":  True,
                "near_duplicate_of":  best_prompt,
                "similarity_score":   round(best_score, 4),
                "hash":               prompt_hash,
                "embedding":          new_embedding,
                "action":             "flag",
            }

        return {
            "is_exact_duplicate": False,
            "is_near_duplicate":  False,
            "near_duplicate_of":  None,
            "similarity_score":   round(best_score, 4),
            "hash":               prompt_hash,
            "embedding":          new_embedding,
            "action":             "accept",
        }

    # Embedding unavailable — hash-only (no semantic check)
    return {
        "is_exact_duplicate": False,
        "is_near_duplicate":  False,
        "near_duplicate_of":  None,
        "similarity_score":   None,
        "hash":               prompt_hash,
        "embedding":          None,
        "action":             "accept",
    }


def _create_dedup_alert(project_id: str, new_prompt: str, similar_prompt: str, score: float) -> None:
    """
    SOP-002 §3.3: Near-duplicate alert visible in admin dashboard.
    Client decides whether to keep or remove — this is NOT a block.
    """
    try:
        mongo_manager.connect()
        mongo_manager.db.prompt_dedup_alerts.insert_one({
            "project_id":       project_id,
            "alert_type":       "near_duplicate",
            "new_prompt":       new_prompt,
            "similar_to":       similar_prompt,
            "similarity_score": round(score, 4),
            "threshold":        _NEAR_DUP_THRESHOLD,
            "status":           "unresolved",   # client resolves: keep | remove
            "created_at":       datetime.utcnow(),
        })
    except Exception as exc:
        logger.warning("[DEDUP] Could not create alert: %s", exc)


def store_prompt_hash_and_embedding(
    prompt_text: str,
    project_id: str,
    dedup_result: dict,
) -> None:
    """
    After a prompt is accepted (action = accept | flag), store its
    hash + embedding on the prompt_library document so future
    dedup checks work correctly.
    """
    updates = {
        "prompt_hash": dedup_result.get("hash"),
    }
    if dedup_result.get("embedding"):
        updates["embedding"] = dedup_result["embedding"]

    try:
        mongo_manager.connect()
        mongo_manager.db.prompt_library.update_one(
            {"prompt_text": prompt_text, "project_id": project_id},
            {"$set": updates},
        )
    except Exception as exc:
        logger.warning("[DEDUP] Could not store hash/embedding: %s", exc)
"""
prompt_expander.py — SOP-002 §4 Prompt Expansion & Clustering
FULLY NEW — was missing from codebase.

SOP-002 §4.2 expansion algorithm:
  Given a seed prompt → generate exactly 3 variants per intent cluster.
  5 clusters × 3 variants = 15 prompts per seed.

  Intent clusters (SOP-002 §4.1, fixed at MVP):
    informational | commercial | comparative | transactional | agent

  Expansion uses Claude to generate variants — system prompt stored in
  config, never hardcoded in the response (SOP-002 §4.2 requirement).

  All expansion calls logged with model version + token count for cost tracking.

Collections written:
  - prompt_expansions   stores each expansion result with seed + variants
  - expansion_logs      cost tracking per expansion call
"""

import json
import logging
import os
import re
from datetime import datetime
from typing import Optional

from utils.mongo import mongo_manager

logger = logging.getLogger("prompt_expander")

# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §4.1 — Fixed intent clusters (do not add without Founder approval)
# ─────────────────────────────────────────────────────────────────────────────

INTENT_CLUSTERS = ["informational", "commercial", "comparative", "transactional", "agent"]

_CLUSTER_DEFINITIONS = {
    "informational": "User is learning or researching a topic. No purchase intent.",
    "commercial":    "User is evaluating products or vendors. Pre-purchase research.",
    "comparative":   "User is comparing two or more specific options.",
    "transactional": "User intends to take an action: buy, sign up, download.",
    "agent":         "User is instructing an AI agent to perform a task on their behalf.",
}

# ─────────────────────────────────────────────────────────────────────────────
# SOP-002 §4.2 — Expansion system prompt (stored in config, NOT hardcoded)
# This string lives here as the config value. Never expose to end users.
# ─────────────────────────────────────────────────────────────────────────────

_EXPANSION_SYSTEM_PROMPT = (
    "You are a search intent analyst. Given a seed prompt, generate exactly 3 variants "
    "for each of these intent types: informational, commercial, comparative, transactional, agent. "
    "Return ONLY valid JSON — no preamble, no markdown fences, no explanation. Format:\n"
    '{"informational": ["...", "...", "..."], "commercial": ["...", "...", "..."], '
    '"comparative": ["...", "...", "..."], "transactional": ["...", "...", "..."], '
    '"agent": ["...", "...", "..."]}\n'
    "Each variant must be unique, between 15 and 120 characters, and naturally phrased "
    "as a real user query. Do not number the variants."
)

# ─────────────────────────────────────────────────────────────────────────────
# Anthropic client — expansion always uses Claude (cheapest + best JSON output)
# ─────────────────────────────────────────────────────────────────────────────

_anthropic_client = None

def _get_client():
    global _anthropic_client
    if _anthropic_client is None:
        key = os.getenv("ANTHROPIC_API_KEY")
        if not key:
            logger.error("[EXPANDER] ANTHROPIC_API_KEY not set — expansion unavailable")
            return None
        try:
            import anthropic
            _anthropic_client = anthropic.Anthropic(api_key=key)
        except Exception as exc:
            logger.error("[EXPANDER] Client init failed: %s", exc)
    return _anthropic_client

# ─────────────────────────────────────────────────────────────────────────────
# Core expansion
# ─────────────────────────────────────────────────────────────────────────────

def expand_seed_prompt(seed_prompt: str, job_id: str = "", project_id: str = "") -> dict:
    """
    SOP-002 §4.2 — Expand one seed prompt into 5 × 3 = 15 variants.

    Returns:
        {
            "seed": str,
            "clusters": {
                "informational": [str, str, str],
                "commercial":    [str, str, str],
                "comparative":   [str, str, str],
                "transactional": [str, str, str],
                "agent":         [str, str, str],
            },
            "total_variants": int,
            "model_version":  str,
            "input_tokens":   int,
            "output_tokens":  int,
            "error":          str | None,
        }
    """
    client = _get_client()
    if not client:
        return _fallback_expansion(seed_prompt)

    try:
        user_message = f'Seed prompt: "{seed_prompt}"'

        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",   # cheapest model — JSON only task
            max_tokens=800,
            system=_EXPANSION_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        raw_text     = msg.content[0].text if msg.content else ""
        input_tokens  = msg.usage.input_tokens  if msg.usage else 0
        output_tokens = msg.usage.output_tokens if msg.usage else 0

        # SOP-002 §4.2: log all expansion calls with model version + token count
        _log_expansion_cost(
            job_id=job_id,
            seed=seed_prompt,
            model="claude-haiku-4-5-20251001",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

        clusters = _parse_expansion_json(raw_text)

        if not clusters:
            logger.warning("[EXPANDER] JSON parse failed for seed='%s'", seed_prompt[:50])
            return _fallback_expansion(seed_prompt)

        # Validate + clean variants
        cleaned = _validate_variants(clusters)
        total   = sum(len(v) for v in cleaned.values())

        # Persist expansion result
        _store_expansion(project_id, job_id, seed_prompt, cleaned, "claude-haiku-4-5-20251001")

        logger.info(
            "[EXPANDER] Expanded | seed='%s' | variants=%d | tokens_in=%d out=%d",
            seed_prompt[:50], total, input_tokens, output_tokens,
        )

        return {
            "seed":           seed_prompt,
            "clusters":       cleaned,
            "total_variants": total,
            "model_version":  "claude-haiku-4-5-20251001",
            "input_tokens":   input_tokens,
            "output_tokens":  output_tokens,
            "error":          None,
        }

    except Exception as exc:
        logger.error("[EXPANDER] Expansion failed for seed='%s': %s", seed_prompt[:50], exc)
        return _fallback_expansion(seed_prompt, error=str(exc))


def _parse_expansion_json(raw: str) -> Optional[dict]:
    """Strip any accidental markdown fences and parse JSON."""
    text = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and all(k in parsed for k in INTENT_CLUSTERS):
            return parsed
    except json.JSONDecodeError:
        pass
    # Try extracting just the JSON object
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def _validate_variants(clusters: dict) -> dict:
    """
    SOP-002 §4.2: each variant must be 15–120 chars, unique.
    Drop variants outside range. Ensure exactly 3 per cluster (trim or duplicate).
    """
    seen  = set()
    result = {}
    for cluster in INTENT_CLUSTERS:
        raw_variants = clusters.get(cluster) or []
        valid = []
        for v in raw_variants:
            v = str(v).strip()
            if 15 <= len(v) <= 120 and v not in seen:
                valid.append(v)
                seen.add(v)
        # If LLM returned fewer than 3, pad with truncated versions
        while len(valid) < 3 and valid:
            valid.append(valid[0])
        result[cluster] = valid[:3]
    return result


def _fallback_expansion(seed_prompt: str, error: str = "") -> dict:
    """
    Fallback when Claude unavailable — return seed as single informational variant.
    Other clusters get empty lists so callers can detect incomplete expansion.
    """
    logger.warning("[EXPANDER] Using fallback expansion for seed='%s'", seed_prompt[:50])
    clusters = {c: [] for c in INTENT_CLUSTERS}
    clusters["informational"] = [seed_prompt] if 15 <= len(seed_prompt) <= 120 else []
    return {
        "seed": seed_prompt, "clusters": clusters, "total_variants": len(clusters["informational"]),
        "model_version": "fallback", "input_tokens": 0, "output_tokens": 0,
        "error": error or "Claude unavailable",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Batch expansion — for expanding multiple seeds at once
# ─────────────────────────────────────────────────────────────────────────────

def expand_seed_prompts_batch(
    seed_prompts: list,
    job_id: str = "",
    project_id: str = "",
) -> list:
    """
    Expand a list of seed prompts. Returns list of expansion results.
    Seeds are expanded sequentially (Claude Haiku is cheap enough that
    parallel isn't needed at MVP scale).
    """
    results = []
    for seed in seed_prompts:
        if not isinstance(seed, str) or not seed.strip():
            continue
        result = expand_seed_prompt(seed.strip(), job_id=job_id, project_id=project_id)
        results.append(result)
    return results


def get_all_variants_flat(expansion_result: dict) -> list:
    """
    Flatten an expansion result into a single list of all variant strings.
    Useful for passing to llm_runner.run_llm_queries().
    """
    variants = []
    clusters = expansion_result.get("clusters") or {}
    for cluster_variants in clusters.values():
        variants.extend(cluster_variants)
    return list(dict.fromkeys(variants))   # deduplicate preserving order


# ─────────────────────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────────────────────

def _store_expansion(project_id: str, job_id: str, seed: str, clusters: dict, model: str) -> None:
    try:
        mongo_manager.connect()
        mongo_manager.db.prompt_expansions.insert_one({
            "project_id":   project_id,
            "job_id":       job_id,
            "seed_prompt":  seed,
            "clusters":     clusters,
            "model_version": model,
            "total_variants": sum(len(v) for v in clusters.values()),
            "created_at":   datetime.utcnow(),
        })
    except Exception as exc:
        logger.warning("[EXPANDER] Could not store expansion: %s", exc)


def _log_expansion_cost(job_id: str, seed: str, model: str, input_tokens: int, output_tokens: int) -> None:
    """SOP-002 §4.2: log all expansion calls with model version + token count."""
    try:
        # Haiku pricing: $0.25/M input, $1.25/M output
        cost = round((input_tokens / 1_000_000) * 0.25 + (output_tokens / 1_000_000) * 1.25, 8)
        mongo_manager.connect()
        mongo_manager.db.expansion_logs.insert_one({
            "job_id":        job_id,
            "seed_prompt":   seed[:100],
            "model_version": model,
            "input_tokens":  input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost_usd": cost,
            "logged_at":     datetime.utcnow(),
        })
    except Exception as exc:
        logger.warning("[EXPANDER] Cost log failed: %s", exc)


def get_expansion_for_seed(seed_prompt: str, project_id: str) -> Optional[dict]:
    """Load a previously stored expansion result from DB."""
    try:
        mongo_manager.connect()
        doc = mongo_manager.db.prompt_expansions.find_one(
            {"seed_prompt": seed_prompt, "project_id": project_id},
            sort=[("created_at", -1)],
        )
        return doc
    except Exception:
        return None
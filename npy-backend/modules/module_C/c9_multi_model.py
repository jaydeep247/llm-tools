"""
C9 — Multi-Model Insights

Uses C7 execution data to produce:
  Field 1: Model-wise LLM-Friendliness Scores (citation rate per model, not subjective rating)
  Field 2: Answer Variation / Consistency (pairwise + contradiction detection)
  Field 3: Multi-Model Coverage Gaps (which models are NOT citing, what would fix it)
"""

import json
import logging
import re
from typing import Any, Dict, List

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_c.c9")


# ═════════════════════════════════════════════════════════════════════════════
#  Field 1 — Model-wise LLM-Friendliness (citation rate normalised)
# ═════════════════════════════════════════════════════════════════════════════

def compute_model_friendliness(
    domain: str,
    c7_model_responses: Dict[str, List[Dict[str, Any]]],
    c7_raw_answers: Dict[str, List[str]],
) -> Dict[str, Any]:
    """
    Measure citation rate per model from live prompt execution.
    NOT asking models to "rate" the page.

    Normalised: >=80% cite → 100 | 50-80 → 75 | 20-50 → 50 | 5-20 → 25 | <5 → 5
    """
    domain_lower = domain.lower().replace("www.", "")
    scores: Dict[str, int] = {}

    for model_name, answers in c7_raw_answers.items():
        if not answers:
            scores[model_name] = 0
            continue

        cited = sum(1 for a in answers if domain_lower in a.lower())
        rate = (cited / len(answers)) * 100

        if rate >= 80:
            scores[model_name] = 100
        elif rate >= 50:
            scores[model_name] = 75
        elif rate >= 20:
            scores[model_name] = 50
        elif rate >= 5:
            scores[model_name] = 25
        else:
            scores[model_name] = 5

    return {
        "per_model": scores,
        "average": round(sum(scores.values()) / max(len(scores), 1), 1),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Field 2 — Answer Variation / Consistency
# ═════════════════════════════════════════════════════════════════════════════

def _jaccard(text_a: str, text_b: str) -> float:
    words_a = set(re.findall(r"\w+", text_a.lower()))
    words_b = set(re.findall(r"\w+", text_b.lower()))
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


async def compute_answer_variation(
    c7_raw_answers: Dict[str, List[str]],
) -> Dict[str, Any]:
    """
    Per prompt: pairwise similarity across models.
    Variation score = (1 - avg_similarity) × 100.
    Also flag specific contradictions via LLM.
    """
    models = list(c7_raw_answers.keys())
    if len(models) < 2:
        return {"variation_score": 0, "contradictions": []}

    prompt_count = min(len(v) for v in c7_raw_answers.values()) if c7_raw_answers else 0

    all_sims: List[float] = []
    for pi in range(prompt_count):
        answers = {}
        for m in models:
            if pi < len(c7_raw_answers[m]) and c7_raw_answers[m][pi]:
                answers[m] = c7_raw_answers[m][pi]

        keys = list(answers.keys())
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                sim = _jaccard(answers[keys[i]], answers[keys[j]])
                all_sims.append(sim)

    avg_sim = sum(all_sims) / len(all_sims) if all_sims else 0
    variation_score = round((1 - avg_sim) * 100, 1)

    # Contradiction detection (sample first prompt only to control cost)
    contradictions: List[str] = []
    if prompt_count > 0:
        sample_answers = {}
        for m in models:
            if c7_raw_answers[m]:
                sample_answers[m] = c7_raw_answers[m][0][:500]

        if len(sample_answers) >= 2:
            parts = [f"Response {m}: {a}" for m, a in sample_answers.items()]
            prompt = (
                "Compare these AI model responses to the same question. "
                "Identify any factual contradictions or significant differences.\n\n"
                + "\n\n".join(parts) + "\n\n"
                'Return JSON: {"contradictions": ["..."], "consistent_facts": ["..."]}'
            )

            resp = await execute_task(
                task_name="aeo_evaluate_answer_quality",
                input_data={
                    "messages": [
                        {"role": "system", "content": "You are a factual consistency analyst."},
                        {"role": "user", "content": prompt},
                    ]
                },
                provider="openai",
                options={"model": "gpt-4o-mini", "temperature": 0.1, "max_tokens": 500,
                         "response_format": {"type": "json_object"}},
            )

            if resp.success and resp.data:
                try:
                    parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
                    contradictions = parsed.get("contradictions", [])
                except (json.JSONDecodeError, TypeError):
                    pass

    return {
        "variation_score": variation_score,
        "avg_similarity": round(avg_sim, 4),
        "contradictions": contradictions,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Field 3 — Multi-Model Coverage Gaps
# ═════════════════════════════════════════════════════════════════════════════

def compute_coverage_gaps(
    domain: str,
    c7_raw_answers: Dict[str, List[str]],
) -> Dict[str, Any]:
    """
    From SOP-002: Cited in 3 models = 80 | 2 = 55 | 1 = 25 | 0 = 0.
    Identify which models are NOT citing.
    """
    domain_lower = domain.lower().replace("www.", "")
    models_citing: List[str] = []

    for model_name, answers in c7_raw_answers.items():
        cited = any(domain_lower in a.lower() for a in answers if a)
        if cited:
            models_citing.append(model_name)

    coverage_map = {4: 100, 3: 80, 2: 55, 1: 25, 0: 0}
    coverage_score = coverage_map.get(len(models_citing), 0)

    all_models = list(c7_raw_answers.keys())
    gaps = [m for m in all_models if m not in models_citing]

    return {
        "coverage_score": coverage_score,
        "models_citing": models_citing,
        "models_not_citing": gaps,
        "total_models": len(all_models),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Run C9
# ═════════════════════════════════════════════════════════════════════════════

async def run_c9(
    domain: str,
    c7_output: Dict[str, Any],
    c7_raw_answers: Dict[str, List[str]],
) -> Dict[str, Any]:
    """
    Run C9 Multi-Model Insights.

    Args:
        domain: The client domain (e.g. colytics.ai).
        c7_output: Output from run_c7().
        c7_raw_answers: {model_name: [answer_strings]} collected during C7.

    Returns:
        model friendliness, variation, coverage gaps.
    """
    c7_model_responses = c7_output.get("model_responses", {})

    friendliness = compute_model_friendliness(domain, c7_model_responses, c7_raw_answers)
    variation = await compute_answer_variation(c7_raw_answers)
    coverage = compute_coverage_gaps(domain, c7_raw_answers)

    return {
        "model_friendliness": friendliness,
        "answer_variation": variation,
        "coverage_gaps": coverage,
    }

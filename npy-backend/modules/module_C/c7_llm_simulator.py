"""
C7 — LLM Answer Simulator

Requires live LLM API calls (as per SOP-002 Stage 3).

Pipeline:
  Pre-step: Generate prompts for the page.
  Field 1:  Accuracy Score (claims alignment per model).
  Field 2:  Completeness Score (LLM perspective — how well do LLMs cover the topic).
  Field 3:  Consistency Across Models (embedding similarity + citation variance).
"""

import asyncio
import json
import logging
import math
import re
from typing import Any, Dict, List, Tuple

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_c.c7")

# Target models for simulation
TARGET_MODELS = {
    "openai":  {"task": "aeo_simulate_answer_generation", "model": "gpt-4o"},
    "gemini":  {"task": "aeo_simulate_answer_generation", "model": "gemini-2.0-flash"},
    "claude":  {"task": "aeo_simulate_answer_generation", "model": "claude-haiku-4-5-20251001"},
}


# ═════════════════════════════════════════════════════════════════════════════
#  Pre-step — Generate prompts for the page
# ═════════════════════════════════════════════════════════════════════════════

async def _generate_prompts(page_topic: str, page_excerpt: str) -> List[str]:
    """Generate 5 realistic user prompts that would cause LLMs to cite this page."""
    prompt = (
        f'For a page about "{page_topic}", generate 5 realistic user prompts '
        f"that would cause an LLM to potentially cite or reference content from this page. "
        f"Include: 1 informational, 1 commercial, 1 comparative, 1 how-to, 1 specific question. "
        f"Ground the prompts in this content excerpt so they reflect the actual page, not generic industry prompts: {page_excerpt[:1200]} "
        f'Return JSON: {{"prompts": [...]}}'
    )

    resp = await execute_task(
        task_name="aeo_simulate_answer_generation",
        input_data={
            "messages": [
                {"role": "system", "content": "You are a prompt engineering specialist."},
                {"role": "user", "content": prompt},
            ]
        },
        provider="openai",
        options={"model": "gpt-4o-mini", "temperature": 0.5, "max_tokens": 600,
                 "response_format": {"type": "json_object"}},
    )

    if resp.success and resp.data:
        try:
            parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
            raw = parsed.get("prompts", [])[:5]
            # The LLM may return dicts like {"prompt": "...", "type": "..."}; coerce to strings
            return [
                p if isinstance(p, str) else (p.get("prompt") or p.get("text") or str(p))
                for p in raw
            ]
        except (json.JSONDecodeError, TypeError):
            pass

    return [f"What is {page_topic}?"]


# ═════════════════════════════════════════════════════════════════════════════
#  Execute prompts against each model
# ═════════════════════════════════════════════════════════════════════════════

async def _execute_prompt(
    prompt_text: str,
    provider: str,
    model: str,
    page_content_snippet: str = "",
) -> Dict[str, Any]:
    """Execute a single prompt against one model."""
    system = (
        "You are a helpful assistant. Answer comprehensively, citing relevant sources "
        "when possible. Include specific names, URLs, and data points."
    )

    resp = await execute_task(
        task_name="aeo_simulate_answer_generation",
        input_data={
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt_text},
            ]
        },
        provider=provider,
        options={"model": model, "temperature": 0.1, "max_tokens": 1200},
    )

    return {
        "success": resp.success,
        "answer": resp.data if resp.success else "",
        "error": resp.error if not resp.success else None,
        "meta": resp.meta,
    }


async def _execute_all_prompts(
    prompts: List[str],
    page_content_snippet: str = "",
) -> Dict[str, List[Dict[str, Any]]]:
    """Execute all prompts across all target models concurrently. Returns {model: [responses]}."""
    task_keys: List[Tuple[str, str]] = []
    tasks = []
    for provider, cfg in TARGET_MODELS.items():
        for prompt_text in prompts:
            tasks.append(_execute_prompt(prompt_text, provider, cfg["model"], page_content_snippet))
            task_keys.append((provider, prompt_text))

    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    model_responses: Dict[str, List[Dict[str, Any]]] = {p: [] for p in TARGET_MODELS}
    for (provider, prompt_text), result in zip(task_keys, raw_results):
        if isinstance(result, Exception):
            model_responses[provider].append(
                {"prompt": prompt_text, "success": False, "answer": "", "error": str(result)}
            )
        else:
            model_responses[provider].append({"prompt": prompt_text, **result})

    return model_responses


# ═════════════════════════════════════════════════════════════════════════════
#  Field 1 — Accuracy Score
# ═════════════════════════════════════════════════════════════════════════════

async def _extract_page_claims(page_content: str) -> List[Dict[str, str]]:
    """Extract verifiable factual claims from the page content."""
    resp = await execute_task(
        task_name="aeo_evaluate_answer_quality",
        input_data={
            "messages": [
                {
                    "role": "system",
                    "content": "Extract all verifiable factual claims from this content.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Content:\n{page_content[:3000]}\n\n"
                        f'Return JSON: {{"claims": [{{"claim": "...", "type": "statistic|comparison|definition|process"}}]}}'
                    ),
                },
            ]
        },
        provider="openai",
        options={"model": "gpt-4o-mini", "temperature": 0.1, "max_tokens": 1000,
                 "response_format": {"type": "json_object"}},
    )

    if resp.success and resp.data:
        try:
            parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
            return parsed.get("claims", [])
        except (json.JSONDecodeError, TypeError):
            pass
    return []


async def _check_claim_alignment(
    claims: List[Dict[str, str]],
    llm_response: str,
) -> Dict[str, Any]:
    """Compare page claims vs what the LLM said."""
    if not claims or not llm_response:
        return {"confirmed": [], "contradicted": [], "not_mentioned": [], "accuracy": 50}

    claims_text = json.dumps(claims[:15])
    resp = await execute_task(
        task_name="aeo_evaluate_answer_quality",
        input_data={
            "messages": [
                {
                    "role": "system",
                    "content": "Compare factual claims from a page vs what an LLM said.",
                },
                {
                    "role": "user",
                    "content": (
                        f"Page claims: {claims_text}\n"
                        f"LLM response: {llm_response[:2000]}\n\n"
                        f"For each page claim: does the LLM confirm, contradict, or not mention it?\n"
                        f'Return JSON: {{"confirmed": [...], "contradicted": [...], "not_mentioned": [...]}}'
                    ),
                },
            ]
        },
        provider="openai",
        options={"model": "gpt-4o-mini", "temperature": 0.1, "max_tokens": 800,
                 "response_format": {"type": "json_object"}},
    )

    if resp.success and resp.data:
        try:
            parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
            confirmed = parsed.get("confirmed", [])
            contradicted = parsed.get("contradicted", [])
            not_mentioned = parsed.get("not_mentioned", [])
            denom = len(confirmed) + len(contradicted)
            accuracy = round((len(confirmed) / denom) * 100, 1) if denom > 0 else 50
            return {
                "confirmed": confirmed,
                "contradicted": contradicted,
                "not_mentioned": not_mentioned,
                "accuracy": accuracy,
            }
        except (json.JSONDecodeError, TypeError):
            pass

    return {"confirmed": [], "contradicted": [], "not_mentioned": [], "accuracy": 50}


async def _compute_accuracy(
    page_content: str,
    model_responses: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """Compute accuracy per model and overall — all claim checks run concurrently."""
    claims = await _extract_page_claims(page_content)
    if not claims:
        return {"overall": 50, "per_model": {}, "claims_extracted": 0}

    task_keys: List[str] = []
    tasks = []
    for model_name, responses in model_responses.items():
        for r in responses:
            if r.get("success") and r.get("answer"):
                tasks.append(_check_claim_alignment(claims, r["answer"]))
                task_keys.append(model_name)

    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    per_model_lists: Dict[str, List[float]] = {}
    for model_name, result in zip(task_keys, raw_results):
        if isinstance(result, Exception):
            continue
        per_model_lists.setdefault(model_name, []).append(result["accuracy"])

    per_model = {k: round(sum(v) / len(v), 1) for k, v in per_model_lists.items()}
    overall = round(sum(per_model.values()) / len(per_model), 1) if per_model else 50

    return {
        "overall": overall,
        "per_model": per_model,
        "claims_extracted": len(claims),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Field 2 — Completeness Score (LLM perspective)
# ═════════════════════════════════════════════════════════════════════════════

async def _compute_completeness(
    page_topic: str,
    model_responses: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    How completely do the LLMs cover the topic?
    All valid answers for each model are batched into a single LLM call,
    then all models are evaluated concurrently — 3 calls instead of N*M.
    """

    async def _eval_model_batch(model_name: str, responses: List[Dict[str, Any]]) -> Tuple[str, List[float]]:
        valid_answers = [r["answer"] for r in responses if r.get("success") and r.get("answer")]
        if not valid_answers:
            return model_name, []

        batch = "\n\n".join(
            f"Response {i + 1}: {a[:800]}" for i, a in enumerate(valid_answers)
        )
        resp = await execute_task(
            task_name="aeo_evaluate_answer_quality",
            input_data={
                "messages": [
                    {"role": "system", "content": "You are a topic coverage evaluator."},
                    {
                        "role": "user",
                        "content": (
                            f'Rate each response\'s completeness for the topic "{page_topic}" '
                            f"on a 0-100 scale.\n\n{batch}\n\n"
                            f'Return JSON: {{"scores": [<score_for_response_1>, ...]}}'
                        ),
                    },
                ]
            },
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.1,
                "max_tokens": 200,
                "response_format": {"type": "json_object"},
            },
        )

        if resp.success and resp.data:
            try:
                parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
                raw_scores = parsed.get("scores", [])
                scores = [float(s) for s in raw_scores if isinstance(s, (int, float))]
                return model_name, scores
            except (json.JSONDecodeError, TypeError, ValueError):
                pass
        return model_name, []

    tasks = [_eval_model_batch(m, r) for m, r in model_responses.items()]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    per_model: Dict[str, List[float]] = {}
    for result in results:
        if isinstance(result, Exception):
            continue
        model_name, scores = result
        if scores:
            per_model[model_name] = scores

    model_avgs = {k: round(sum(v) / len(v), 1) for k, v in per_model.items()}
    all_scores = [s for v in per_model.values() for s in v]
    overall = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0

    return {"overall": overall, "per_model": model_avgs}


# ═════════════════════════════════════════════════════════════════════════════
#  Field 3 — Consistency Across Models
# ═════════════════════════════════════════════════════════════════════════════

def _jaccard_similarity(text_a: str, text_b: str) -> float:
    """Word-level Jaccard similarity as a lightweight consistency proxy."""
    words_a = set(re.findall(r"\w+", text_a.lower()))
    words_b = set(re.findall(r"\w+", text_b.lower()))
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)


def _compute_consistency(
    model_responses: Dict[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """
    Per prompt: compare what each model says using pairwise Jaccard similarity.
    Also compute citation variance metric from SOP-002.
    """
    if len(model_responses) < 2:
        return {"consistency_score": 0, "citation_variance": 0}

    # Group responses by prompt index
    models = list(model_responses.keys())
    prompt_count = min(len(v) for v in model_responses.values()) if model_responses else 0

    all_sims: List[float] = []
    for pi in range(prompt_count):
        answers = {}
        for m in models:
            if pi < len(model_responses[m]):
                r = model_responses[m][pi]
                if r.get("success") and r.get("answer"):
                    answers[m] = r["answer"]

        if len(answers) < 2:
            continue

        keys = list(answers.keys())
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                sim = _jaccard_similarity(answers[keys[i]], answers[keys[j]])
                all_sims.append(sim)

    consistency_score = round(
        (sum(all_sims) / len(all_sims)) * 100, 1
    ) if all_sims else 0

    # Flag
    flag = None
    if consistency_score < 60:
        flag = "Brand has unstable AI visibility — some models have very different information."

    return {
        "overall": consistency_score,
        "consistency_score": consistency_score,
        "pairwise_comparisons": len(all_sims),
        "flag": flag,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Run C7
# ═════════════════════════════════════════════════════════════════════════════

async def run_c7(
    visible_text: str,
    page_topic: str,
) -> Dict[str, Any]:
    """
    Run C7 LLM Answer Simulator.

    Args:
        visible_text: Clean page text from C5.
        page_topic: Page topic from C1.

    Returns:
        accuracy, completeness, consistency, raw model responses.
    """
    # Pre-step: generate prompts
    prompts = await _generate_prompts(page_topic, visible_text)

    # Execute all prompts across all models concurrently
    model_responses = await _execute_all_prompts(prompts, visible_text[:1000])

    # Field 1 + 2 run concurrently (both need only model_responses / page text)
    accuracy, completeness = await asyncio.gather(
        _compute_accuracy(visible_text, model_responses),
        _compute_completeness(page_topic, model_responses),
    )

    # Field 3: pure Python — no I/O
    consistency = _compute_consistency(model_responses)

    # Build raw answer strings for downstream C9
    raw_answers: Dict[str, List[str]] = {}
    for m, responses in model_responses.items():
        raw_answers[m] = [
            r.get("answer", "") for r in responses if r.get("success") and r.get("answer")
        ]

    return {
        "prompts_used": prompts,
        "accuracy": accuracy,
        "completeness": completeness,
        "consistency": consistency,
        "model_responses": {
            m: [{"prompt": r["prompt"], "success": r["success"],
                 "answer_length": len(r.get("answer", ""))}
                for r in responses]
            for m, responses in model_responses.items()
        },
        "raw_answers": raw_answers,
    }

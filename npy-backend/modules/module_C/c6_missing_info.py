"""
C6 — Missing Information Analysis

Uses C3/C5 entity gaps + LLM-generated fact gaps to produce:
  - Number of missing entities or facts
  - Critical vs minor classification (rule-based pre-filter + AI for ambiguous)
  - Gap percentage per page
"""

import json
import logging
import re
from typing import Any, Dict, List

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_c.c6")


# ═════════════════════════════════════════════════════════════════════════════
#  Field 1 — Missing Facts (via LLM)
# ═════════════════════════════════════════════════════════════════════════════

async def _detect_missing_facts(
    page_topic: str,
    industry: str,
    visible_text: str,
) -> Dict[str, Any]:
    """
    Ask LLM to identify the 10 most important facts an authoritative page
    on this topic should contain, then check which are missing.
    """
    content_snippet = visible_text[:3000]
    prompt = (
        f'You are a content gap analyst.\n'
        f'For a page about "{page_topic}" in "{industry}":\n'
        f'1. List the 10 most important statistical facts, data points, benchmarks, or '
        f'verifiable claims that authoritative content on this topic should contain.\n'
        f'2. Check which of these are missing from the provided content.\n\n'
        f'Page content: {content_snippet}\n\n'
        f'Only include facts that are appropriate for this exact page/topic, not generic industry trivia.\n'
        f'Return JSON: {{"expected_facts": ["..."], "missing_facts": ["..."], "present_facts": ["..."]}}'
    )

    resp = await execute_task(
        task_name="aeo_knowledge_base_audit",
        input_data={
            "messages": [
                {"role": "system", "content": "You are a content gap analyst."},
                {"role": "user", "content": prompt},
            ]
        },
        provider="openai",
        options={
            "model": "gpt-4o-mini",
            "temperature": 0.3,
            "max_tokens": 1500,
            "response_format": {"type": "json_object"},
        },
    )

    if resp.success and resp.data:
        try:
            parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
            return {
                "expected_facts": parsed.get("expected_facts", []),
                "missing_facts": parsed.get("missing_facts", []),
                "present_facts": parsed.get("present_facts", []),
            }
        except (json.JSONDecodeError, TypeError):
            logger.warning("[C6] Failed to parse fact gap response")

    return {"expected_facts": [], "missing_facts": [], "present_facts": []}


# ═════════════════════════════════════════════════════════════════════════════
#  Field 2 — Critical vs Minor Classification
# ═════════════════════════════════════════════════════════════════════════════

def _classify_missing_item(
    item: Dict[str, Any],
    item_type: str,
    competitor_has_it: bool = False,
) -> str:
    """
    Rule-based pre-filter:
      - competitor has it → critical
      - PERCENT type → critical
      - importance == critical → critical
      - DATE + historical → minor
      - everything else → important (middle ground)
    """
    if competitor_has_it:
        return "critical"
    if item_type in ("PERCENT", "Data"):
        return "critical"
    if item.get("importance") == "critical":
        return "critical"
    if item_type == "DATE" and "historical" in item.get("context", "").lower():
        return "minor"
    if item.get("importance") == "supporting":
        return "minor"
    return "important"


def classify_all_missing(
    missing_entities: List[Dict[str, Any]],
    missing_facts: List[str],
) -> Dict[str, List]:
    """
    Classify all missing items into critical / important / minor.
    """
    critical: List[Dict] = []
    important: List[Dict] = []
    minor: List[Dict] = []

    for ent in missing_entities:
        severity = _classify_missing_item(ent, ent.get("type", ""), False)
        entry = {"name": ent.get("name", ""), "type": "entity", "severity": severity}
        if severity == "critical":
            critical.append(entry)
        elif severity == "important":
            important.append(entry)
        else:
            minor.append(entry)

    for fact in missing_facts:
        # facts (statistics, data points) are typically critical or important
        entry = {"name": fact, "type": "fact", "severity": "critical"}
        critical.append(entry)

    return {
        "critical": critical,
        "important": important,
        "minor": minor,
        "critical_count": len(critical),
        "important_count": len(important),
        "minor_count": len(minor),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Field 3 — Gap Percentage Per Page
# ═════════════════════════════════════════════════════════════════════════════

def compute_gap_pct(
    missing_entity_count: int,
    missing_fact_count: int,
    expected_entity_count: int,
    expected_fact_count: int,
) -> Dict[str, Any]:
    total_expected = expected_entity_count + expected_fact_count
    total_missing = missing_entity_count + missing_fact_count

    if total_expected == 0:
        gap_pct = 0.0
    else:
        gap_pct = (total_missing / total_expected) * 100

    if gap_pct > 50:
        risk_level = "High Risk"
    elif gap_pct > 25:
        risk_level = "Moderate"
    else:
        risk_level = "Acceptable"

    return {
        "gap_pct": round(gap_pct, 1),
        "risk_level": risk_level,
        "total_expected": total_expected,
        "total_missing": total_missing,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Run C6
# ═════════════════════════════════════════════════════════════════════════════

async def run_c6(
    c3_output: Dict[str, Any],
    c5_output: Dict[str, Any],
    page_topic: str,
    industry: str = "",
) -> Dict[str, Any]:
    """
    Run C6 Missing Information Analysis.

    Args:
        c3_output: Output from run_c3().
        c5_output: Output from run_c5().
        page_topic: Topic of the page.
        industry: Industry for context.

    Returns:
        missing counts, classification, gap percentage.
    """
    visible_text = c5_output.get("visible_text", "")
    missing_entities = c3_output.get("missing_entities", [])

    # Detect missing facts via LLM
    fact_data = await _detect_missing_facts(page_topic, industry, visible_text)
    missing_facts = fact_data.get("missing_facts", [])
    expected_facts = fact_data.get("expected_facts", [])

    # Classify
    classification = classify_all_missing(missing_entities, missing_facts)

    # Gap percentage
    expected_entity_count = c3_output.get("coverage", {}).get("expected_count", 0)
    gap = compute_gap_pct(
        len(missing_entities),
        len(missing_facts),
        expected_entity_count,
        len(expected_facts),
    )

    return {
        "missing_entity_count": len(missing_entities),
        "missing_fact_count": len(missing_facts),
        "total_missing": len(missing_entities) + len(missing_facts),
        "missing_facts": missing_facts,
        "present_facts": fact_data.get("present_facts", []),
        "classification": classification,
        "gap": gap,
    }

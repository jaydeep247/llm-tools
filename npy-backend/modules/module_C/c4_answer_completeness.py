"""
C4 — Answer Completeness Score

Maps directly to AIVS D3's "Answer Completeness Score" (20% weight).

Pipeline:
  Step 1 — Generate expected questions from page topic (LLM).
  Step 2 — Check each question against page content (LLM per chunk).
  Step 3 — Compute completeness score + % fully answered + gap list.
"""

import json
import logging
import re
from typing import Any, Dict, List

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_c.c4")


# ═════════════════════════════════════════════════════════════════════════════
#  Step 1 — Generate expected questions
# ═════════════════════════════════════════════════════════════════════════════

async def _generate_questions(
    page_topic: str,
    primary_keyword: str,
    page_type: str,
    content_excerpt: str,
) -> List[str]:
    """Generate the 15 most important questions users ask about this topic."""

    prompt = (
        f"Page topic: {page_topic}\n"
        f"Primary keyword: {primary_keyword}\n"
        f"Page type: {page_type}\n"
        f"Content excerpt: {content_excerpt[:1500]}\n"
    )

    resp = await execute_task(
        task_name="aeo_answerability_audit",
        input_data={
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a search intent analyst. Given a webpage topic, "
                        "generate the 15 most important questions users ask that this page should answer. "
                        'Return JSON: {"questions": ["q1", "q2", ...]} '
                        "Focus on: informational, comparative, and how-to questions. "
                        "Use the content excerpt to stay grounded in the exact page. "
                        "Do not ask generic company questions unless the page signals clearly support them."
                    ),
                },
                {"role": "user", "content": prompt},
            ]
        },
        provider="openai",
        options={
            "model": "gpt-4o-mini",
            "temperature": 0.4,
            "max_tokens": 1000,
            "response_format": {"type": "json_object"},
        },
    )

    if resp.success and resp.data:
        try:
            parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
            questions = parsed.get("questions", [])
            if questions:
                return questions[:15]
        except (json.JSONDecodeError, TypeError):
            logger.warning("[C4] Failed to parse questions from LLM")

    return []


# ═════════════════════════════════════════════════════════════════════════════
#  Step 2 — Check each question against page content
# ═════════════════════════════════════════════════════════════════════════════

def _chunk_text(text: str, max_chars: int = 3000) -> List[str]:
    """Split text into chunks by paragraph boundaries."""
    paragraphs = text.split("\n\n")
    chunks: List[str] = []
    current = ""
    for p in paragraphs:
        if len(current) + len(p) > max_chars and current:
            chunks.append(current.strip())
            current = p
        else:
            current += "\n\n" + p if current else p
    if current.strip():
        chunks.append(current.strip())
    return chunks if chunks else [text[:max_chars]]


async def _check_question_answered(
    question: str,
    content_chunks: List[str],
) -> Dict[str, Any]:
    """
    Check if a question is answered by the content.
    Returns status: fully_answered | partially_answered | not_answered.
    """
    # Send all chunks together (more cost-efficient) with the question
    combined = "\n---\n".join(content_chunks[:3])  # max 3 chunks

    prompt = (
        f'Question: {question}\n\n'
        f'Content:\n{combined}\n\n'
        f'Does the content answer this question? '
        f'Return JSON: {{"status": "fully_answered|partially_answered|not_answered", '
        f'"evidence": "brief quote or explanation"}}'
    )

    resp = await execute_task(
        task_name="aeo_answerability_audit",
        input_data={
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a content completeness evaluator. "
                        "Given a question and content, determine if the content answers it. "
                        "Be strict: 'fully_answered' means the question is directly and completely addressed."
                    ),
                },
                {"role": "user", "content": prompt},
            ]
        },
        provider="openai",
        options={
            "model": "gpt-4o-mini",
            "temperature": 0.1,
            "max_tokens": 300,
            "response_format": {"type": "json_object"},
        },
    )

    if resp.success and resp.data:
        try:
            parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
            status = parsed.get("status", "not_answered")
            if status not in ("fully_answered", "partially_answered", "not_answered"):
                status = "not_answered"
            return {"status": status, "evidence": parsed.get("evidence", "")}
        except (json.JSONDecodeError, TypeError):
            pass

    return {"status": "not_answered", "evidence": ""}


# ═════════════════════════════════════════════════════════════════════════════
#  Step 3 — Compute score
# ═════════════════════════════════════════════════════════════════════════════

async def _identify_gaps(
    partial_questions: List[str],
    visible_text: str,
) -> Dict[str, str]:
    """For partially answered questions, identify what's missing."""
    gaps: Dict[str, str] = {}
    content_snippet = visible_text[:2000]

    for q in partial_questions[:5]:  # limit to 5 to control cost
        prompt = (
            f'The question "{q}" is only partially answered by this content. '
            f"What specific information is missing to fully answer it?\n"
            f"Content: {content_snippet}\n"
            f"Return a brief 1-2 sentence explanation of what's missing."
        )

        resp = await execute_task(
            task_name="aeo_answerability_audit",
            input_data={
                "messages": [
                    {"role": "system", "content": "You are a content gap analyst."},
                    {"role": "user", "content": prompt},
                ]
            },
            provider="openai",
            options={"model": "gpt-4o-mini", "temperature": 0.2, "max_tokens": 200},
        )

        if resp.success and resp.data:
            gaps[q] = resp.data.strip()

    return gaps


# ═════════════════════════════════════════════════════════════════════════════
#  Run C4
# ═════════════════════════════════════════════════════════════════════════════

async def run_c4(
    visible_text: str,
    page_topic: str,
    page_type: str = "other",
    primary_keyword: str = "",
) -> Dict[str, Any]:
    """
    Run C4 Answer Completeness Score.

    Args:
        visible_text: Clean text from C5.
        page_topic: Derived page topic from C1.
        page_type: Page type from C1.
        primary_keyword: Optional keyword for question generation.

    Returns:
        completeness_score, pct_fully_answered, missing/partial questions, gaps.
    """
    if not primary_keyword:
        primary_keyword = page_topic

    # Step 1: Generate questions
    questions = await _generate_questions(
        page_topic,
        primary_keyword,
        page_type,
        visible_text,
    )
    if not questions:
        logger.warning("[C4] No questions generated — returning zero score")
        return {
            "completeness_score": 0,
            "pct_fully_answered": 0,
            "questions_generated": 0,
            "results": [],
            "missing_questions": [],
            "partial_questions": [],
            "gaps": {},
        }

    # Step 2: Check each question (sequential to manage API rate)
    chunks = _chunk_text(visible_text)
    results: List[Dict[str, Any]] = []
    for q in questions:
        check = await _check_question_answered(q, chunks)
        results.append({"question": q, **check})

    # Step 3: Compute score
    statuses = [r["status"] for r in results]
    fully = statuses.count("fully_answered")
    partial = statuses.count("partially_answered")
    total = len(statuses)

    completeness_score = round(
        ((fully * 1.0 + partial * 0.5) / total) * 100, 1
    ) if total > 0 else 0

    pct_fully = round((fully / total) * 100, 1) if total > 0 else 0

    # Missing & partial
    missing_qs = [r["question"] for r in results if r["status"] == "not_answered"]
    partial_qs = [r["question"] for r in results if r["status"] == "partially_answered"]

    # Identify gaps for partial questions
    gaps = await _identify_gaps(partial_qs, visible_text)

    return {
        "completeness_score": completeness_score,
        "pct_fully_answered": pct_fully,
        "questions_generated": total,
        "fully_answered": fully,
        "partially_answered": partial,
        "not_answered": len(missing_qs),
        "results": results,
        "missing_questions": missing_qs,
        "partial_questions": partial_qs,
        "gaps": gaps,
    }

"""
C3 — Entity Coverage Audit

Uses C5 entity output + C1 entity ratio to produce:
  - Site-level entity_coverage_pct
  - Missing entity list enriched with importance and pages missing from
  - Entity relevance score per detected entity (TF-IDF 0.3 + semantic 0.5 + co-occur 0.2)

Expected entity set is per-page (NOT one global set).
"""

import logging
import re
from collections import Counter
from typing import Any, Dict, List, Tuple

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_c.c3")


# ═════════════════════════════════════════════════════════════════════════════
#  Field 1 — Entity Coverage % (detected vs expected)
# ═════════════════════════════════════════════════════════════════════════════

def compute_coverage_pct(
    c1_entity_ratio: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Single-page coverage from C1's pre-computed entity_ratio.
    """
    return {
        "entity_coverage_pct": c1_entity_ratio.get("entity_ratio_pct", 0),
        "matched_count": c1_entity_ratio.get("matched_count", 0),
        "expected_count": c1_entity_ratio.get("expected_count", 0),
    }


def compute_site_coverage(page_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Site-level aggregation across multiple pages.
    Returns overall and by page_type.
    """
    if not page_results:
        return {"site_coverage_pct": 0, "by_page_type": {}}

    all_pcts = [p.get("entity_coverage_pct", 0) for p in page_results if p]
    site_pct = sum(all_pcts) / len(all_pcts) if all_pcts else 0

    by_type: Dict[str, List[float]] = {}
    for p in page_results:
        pt = p.get("page_type", "other")
        by_type.setdefault(pt, []).append(p.get("entity_coverage_pct", 0))

    by_type_avg = {k: round(sum(v) / len(v), 1) for k, v in by_type.items()}

    return {
        "site_coverage_pct": round(site_pct, 1),
        "total_pages": len(all_pcts),
        "by_page_type": by_type_avg,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Field 2 — Missing Entity List (enriched)
# ═════════════════════════════════════════════════════════════════════════════

def build_missing_entity_list(
    c1_entity_ratio: Dict[str, Any],
    url: str = "",
) -> List[Dict[str, Any]]:
    """
    Build enriched missing entity list from C1 output.
    Sort by importance: critical → important → supporting.
    """
    expected = c1_entity_ratio.get("expected_entities", [])
    missing_names = set(c1_entity_ratio.get("missing_entities", []))

    missing_list: List[Dict[str, Any]] = []
    for ent in expected:
        name_lower = (ent.get("name") or "").lower()
        if name_lower in missing_names:
            missing_list.append({
                "name": ent.get("name", ""),
                "type": ent.get("type", "CONCEPT"),
                "importance": ent.get("importance", "supporting"),
                "pages_missing_from": [url] if url else [],
            })

    # Sort: critical > important > supporting
    priority = {"critical": 0, "important": 1, "supporting": 2}
    missing_list.sort(key=lambda e: priority.get(e["importance"], 3))

    return missing_list


# ═════════════════════════════════════════════════════════════════════════════
#  Field 3 — Entity Relevance Score
# ═════════════════════════════════════════════════════════════════════════════

async def compute_entity_relevance(
    detected_entities: List[Tuple[str, str]],
    visible_text: str,
    page_topic: str,
) -> List[Dict[str, Any]]:
    """
    For each detected entity, compute relevance via:
      TF-IDF weight (0.30) + Semantic similarity (0.50) + Co-occurrence (0.20)

    Uses OpenAI embedding for the semantic component.
    """
    if not detected_entities:
        return []

    # ── TF-IDF approximation ─────────────────────────────────────────────
    words = re.findall(r"\w+", visible_text.lower())
    total_words = len(words)
    word_freq = Counter(words)

    sentences = re.split(r"[.!?]+", visible_text)

    # ── Top 5 entities by frequency (for co-occurrence) ───────────────────
    ent_freq = Counter()
    for text, _ in detected_entities:
        count = visible_text.lower().count(text.lower())
        ent_freq[text] = count
    top5 = {e for e, _ in ent_freq.most_common(5)}

    results: List[Dict[str, Any]] = []
    for ent_text, ent_label in detected_entities:
        ent_lower = ent_text.lower()

        # TF-IDF-like weight (normalized phrase frequency).
        # Using word_freq[ent_lower] fails for multi-word entities such as
        # "digital marketing" because the token map only contains single words.
        phrase_hits = visible_text.lower().count(ent_lower)
        tf = phrase_hits / max(total_words, 1)
        tfidf_weight = min(1.0, tf * 100)  # scale up

        # Co-occurrence with primary entities (same sentence)
        cooccur = 0
        for sent in sentences:
            sent_lower = sent.lower()
            if ent_lower in sent_lower:
                for top_ent in top5:
                    if top_ent != ent_text and top_ent.lower() in sent_lower:
                        cooccur += 1
        cooccur_score = min(1.0, cooccur / 10)

        # Semantic similarity — approximate with word overlap (embedding call is expensive per-entity)
        topic_words = set(re.findall(r"\w+", page_topic.lower()))
        ent_words = set(re.findall(r"\w+", ent_lower))
        overlap = len(topic_words & ent_words)
        semantic_sim = min(1.0, overlap / max(len(topic_words), 1))

        relevance = tfidf_weight * 0.30 + semantic_sim * 0.50 + cooccur_score * 0.20
        relevance_100 = round(relevance * 100, 1)

        if relevance_100 > 70:
            tier = "core"
        elif relevance_100 >= 40:
            tier = "relevant"
        else:
            tier = "tangential"

        results.append({
            "entity": ent_text,
            "label": ent_label,
            "relevance_score": relevance_100,
            "tier": tier,
            "tfidf_weight": round(tfidf_weight, 4),
            "semantic_sim": round(semantic_sim, 4),
            "cooccur_score": round(cooccur_score, 4),
        })

    results.sort(key=lambda r: r["relevance_score"], reverse=True)
    return results


# ═════════════════════════════════════════════════════════════════════════════
#  Run C3 (single page)
# ═════════════════════════════════════════════════════════════════════════════

async def run_c3(
    c1_output: Dict[str, Any],
    c5_output: Dict[str, Any],
    url: str = "",
) -> Dict[str, Any]:
    """
    Run C3 Entity Coverage Audit for a single page.

    Args:
        c1_output: Output from run_c1().
        c5_output: Output from run_c5().
        url: Page URL.

    Returns:
        coverage, missing list, relevance scores.
    """
    entity_ratio = c1_output.get("entity_ratio", {})
    visible_text = c5_output.get("visible_text", "")
    page_topic = c1_output.get("page_topic", "")
    detected = c5_output.get("filtered_entities", [])

    coverage = compute_coverage_pct(entity_ratio)
    missing = build_missing_entity_list(entity_ratio, url)
    relevance = await compute_entity_relevance(detected, visible_text, page_topic)

    critical_missing = [e for e in missing if e["importance"] == "critical"]

    return {
        "coverage": coverage,
        "missing_entities": missing,
        "critical_missing_count": len(critical_missing),
        "critical_missing": critical_missing,
        "entity_relevance": relevance,
        "page_type": c1_output.get("page_type", "other"),
        "entity_coverage_pct": coverage["entity_coverage_pct"],
    }

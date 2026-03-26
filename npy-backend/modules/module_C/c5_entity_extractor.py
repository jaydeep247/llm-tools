"""
C5 — "What LLMs See" Entity Extractor

MUST run FIRST on raw static HTML from Scrapy (no JS execution).
Simulates exactly what LLM crawlers see.

Outputs:
  - total_entities_detected
  - entity_types_breakdown (by user-friendly category)
  - raw entity list [(text, label)]
  - js_rendered_warning flag
"""

import logging
import re
from typing import Any, Dict, List, Tuple

import spacy
import trafilatura

logger = logging.getLogger("module_c.c5")

# ── spaCy label → user-friendly category ─────────────────────────────────────
TYPE_MAPPING: Dict[str, str] = {
    "PERSON": "Person",
    "PRODUCT": "Product",
    "WORK_OF_ART": "Product",
    "GPE": "Location",
    "LOC": "Location",
    "FAC": "Location",
    "ORG": "Organization",
    "NORP": "Organization",
    "EVENT": "Concept",
    "LAW": "Concept",
    "MONEY": "Data",
    "PERCENT": "Data",
    "QUANTITY": "Data",
    "CARDINAL": "Data",
    "DATE": "Data",
    "TIME": "Data",
}

# Keep only these labels for the entity-presence ratio later (C1 / C3)
KEEP_LABELS = {
    "PERSON", "ORG", "PRODUCT", "GPE", "LOC", "FAC",
    "EVENT", "WORK_OF_ART", "LAW", "NORP",
}

_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


def extract_visible_text(raw_html: str) -> str:
    """Extract visible text from raw HTML using trafilatura (boilerplate-removed)."""
    text = trafilatura.extract(raw_html, include_comments=False, include_tables=True) or ""
    return text.strip()


def run_c5(raw_html: str, word_count: int = 0) -> Dict[str, Any]:
    """
    Run C5 entity extraction on raw static HTML.

    Args:
        raw_html: The raw HTML response body from Scrapy / S3.
        word_count: Pre-computed word count (optional, computed if 0).

    Returns:
        Dict with total_entities_detected, entity_types_breakdown,
        entities list, js_rendered_warning, visible_text, entity_density.
    """
    visible_text = extract_visible_text(raw_html)

    # ── JS-rendered detection ─────────────────────────────────────────────
    js_rendered_warning = len(visible_text) < 200

    if js_rendered_warning:
        logger.warning(
            "[C5] Visible text < 200 chars — likely JS-rendered page. "
            "LLMs see near-empty content."
        )

    # ── spaCy NER ─────────────────────────────────────────────────────────
    nlp = _get_nlp()
    doc = nlp(visible_text)

    entities: List[Tuple[str, str]] = list(
        {(ent.text.strip(), ent.label_) for ent in doc.ents if ent.text.strip()}
    )

    # ── Breakdown by user-friendly category ───────────────────────────────
    breakdown: Dict[str, List[str]] = {}
    for ent_text, ent_label in entities:
        category = TYPE_MAPPING.get(ent_label, "Other")
        breakdown.setdefault(category, []).append(ent_text)

    # ── Metrics ───────────────────────────────────────────────────────────
    wc = word_count if word_count > 0 else len(visible_text.split())
    entity_density = (len(entities) / (wc / 500)) if wc > 0 else 0.0

    # Filtered set (only the labels useful for coverage ratio)
    filtered_entities = [
        (t, l) for t, l in entities if l in KEEP_LABELS
    ]

    return {
        "total_entities_detected": len(entities),
        "entity_types_breakdown": breakdown,
        "entities": entities,
        "filtered_entities": filtered_entities,
        "js_rendered_warning": js_rendered_warning,
        "visible_text": visible_text,
        "word_count": wc,
        "entity_density": round(entity_density, 2),
    }

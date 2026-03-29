"""
C5 — "What LLMs See" Entity Extractor

MUST run FIRST on raw static HTML from Scrapy (no JS execution).
Simulates exactly what LLM crawlers see.

Outputs:
  - total_entities_detected
  - entity_types_breakdown (by user-friendly category)
  - raw entity list [(text, label)]
  - js_rendered_warning flag
  - word_count (from extracted visible text — NOT from page metadata)
  - crawl_word_count (from page_meta, for volume threshold checks)
"""

import logging
import re
from typing import Any, Dict, List, Tuple

import spacy
import trafilatura
from bs4 import BeautifulSoup

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
    """Load spaCy model — prefer lg for accuracy, fall back to sm if not installed."""
    global _nlp
    if _nlp is None:
        try:
            _nlp = spacy.load("en_core_web_lg")
        except OSError:
            logger.warning("[C5] en_core_web_lg not found — falling back to en_core_web_sm")
            _nlp = spacy.load("en_core_web_sm")
    return _nlp


def _bs4_extract(raw_html: str) -> str:
    """
    BeautifulSoup fallback extractor used when trafilatura returns too little text.
    Strips non-content tags (scripts, nav, footer, etc.) then returns cleaned text.
    """
    soup = BeautifulSoup(raw_html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "iframe",
                     "template", "nav", "footer", "header"]):
        tag.decompose()
    raw = soup.get_text(separator=" ", strip=True)
    return re.sub(r"\s+", " ", raw).strip()


def extract_visible_text(raw_html: str) -> str:
    """
    Extract visible text from raw HTML.

    Strategy:
      1. trafilatura with favor_recall=True — captures marketing/homepage copy
         that the default (precision) mode discards as "boilerplate".
      2. If result < 200 words: fall back to BeautifulSoup strip of non-content
         tags to ensure we don't lose real page content.
    """
    text = trafilatura.extract(
        raw_html,
        include_comments=False,
        include_tables=True,
        favor_recall=True,   # CRITICAL: captures homepage/landing-page content
        no_fallback=False,
    ) or ""
    text = text.strip()

    if len(text.split()) < 200:
        bs4_text = _bs4_extract(raw_html)
        # Use whichever gives more content
        if len(bs4_text.split()) > len(text.split()):
            logger.debug(
                "[C5] trafilatura gave %d words; using BS4 fallback (%d words)",
                len(text.split()), len(bs4_text.split()),
            )
            text = bs4_text

    return text


def run_c5(raw_html: str, word_count: int = 0) -> Dict[str, Any]:
    """
    Run C5 entity extraction on raw static HTML.

    Args:
        raw_html: The raw HTML response body from Scrapy / S3.
        word_count: Pre-computed word count from the crawl spider (stored as
                    ``crawl_word_count`` for volume-threshold checks in C2).
                    NOT used for entity density — that always uses the
                    extracted visible-text length to avoid mismatches.

    Returns:
        Dict with total_entities_detected, entity_types_breakdown,
        entities list, js_rendered_warning, visible_text, word_count
        (from extracted text), crawl_word_count (from page_meta).
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

    # ── Metrics — ALWAYS from extracted visible text, never from page_meta ─
    # Using page_meta word_count (e.g. 2388) as denominator over a 40-word
    # extracted text gives entity_density = 0 for every page.  The density
    # must reflect what the extractor actually found.
    wc = len(visible_text.split()) if visible_text else 0
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
        "word_count": wc,                   # From visible_text — used for density
        "crawl_word_count": word_count,     # From page_meta — used for volume checks
        "entity_density": round(entity_density, 2),
    }

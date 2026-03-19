"""
schema_intelligence.py
======================
Colytics AI — MOAT 6: Structured Data Intelligence
SOP-006 Implementation

LLM Citation Readiness Score™ (LCS™) Engine
--------------------------------------------
Implements the full 5-stage pipeline from SOP-006:

  Stage 1 — DISCOVERY       : Extract all schema from HTML (JSON-LD, Microdata, RDFa)
  Stage 2 — GAP DETECTION   : Compare detected vs expected schema per page type
  Stage 3 — LCS™ SCORING    : 6-parameter score with 4-model weighting profiles
  Stage 4 — FIX-PATCH GEN   : Auto-generate validated JSON-LD fix patches
  Stage 5 — AIVS™ FEED      : Structured output for AIVS™ schema dimension

Integrates with schema_generator.py (SchemaGenerator) for patch generation.

Install: pip install anthropic beautifulsoup4 requests
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError:
    BS4_AVAILABLE = False
    BeautifulSoup = None  # type: ignore

# ---------------------------------------------------------------------------
# SOP-006 CONSTANTS — Schema Taxonomy
# ---------------------------------------------------------------------------

# Tier classification exactly as defined in SOP-006 Table (22 types)
SCHEMA_TIERS: Dict[str, Dict[str, Any]] = {
    # ── TIER 1 — CRITICAL (direct LLM citation influence) ──────────────────
    "Organization":   {"tier": 1, "citation_lift_min": 35, "citation_lift_max": 50},
    "Article":        {"tier": 1, "citation_lift_min": 30, "citation_lift_max": 45},
    "BlogPosting":    {"tier": 1, "citation_lift_min": 30, "citation_lift_max": 45},
    "FAQPage":        {"tier": 1, "citation_lift_min": 40, "citation_lift_max": 55},
    "HowTo":          {"tier": 1, "citation_lift_min": 30, "citation_lift_max": 40},
    "Product":        {"tier": 1, "citation_lift_min": 25, "citation_lift_max": 35},
    "Person":         {"tier": 1, "citation_lift_min": 20, "citation_lift_max": 30},

    # ── TIER 2 — HIGH (authority & context signals) ─────────────────────────
    "BreadcrumbList":    {"tier": 2, "citation_lift_min": 10, "citation_lift_max": 15},
    "WebPage":           {"tier": 2, "citation_lift_min": 10, "citation_lift_max": 20},
    "WebSite":           {"tier": 2, "citation_lift_min": 10, "citation_lift_max": 20},
    "Review":            {"tier": 2, "citation_lift_min": 15, "citation_lift_max": 25},
    "AggregateRating":   {"tier": 2, "citation_lift_min": 15, "citation_lift_max": 25},
    "Event":             {"tier": 2, "citation_lift_min": 10, "citation_lift_max": 18},
    "LocalBusiness":     {"tier": 2, "citation_lift_min": 15, "citation_lift_max": 25},
    "ItemList":          {"tier": 2, "citation_lift_min": 12, "citation_lift_max": 20},
    "Course":            {"tier": 2, "citation_lift_min": 10, "citation_lift_max": 15},

    # ── TIER 3 — SUPPORTING ─────────────────────────────────────────────────
    "VideoObject":           {"tier": 3, "citation_lift_min": 5,  "citation_lift_max": 10},
    "ImageObject":           {"tier": 3, "citation_lift_min": 5,  "citation_lift_max": 8},
    "Recipe":                {"tier": 3, "citation_lift_min": 8,  "citation_lift_max": 12},
    "SoftwareApplication":   {"tier": 3, "citation_lift_min": 10, "citation_lift_max": 15},
    "Dataset":               {"tier": 3, "citation_lift_min": 8,  "citation_lift_max": 12},
    "ClaimReview":           {"tier": 3, "citation_lift_min": 5,  "citation_lift_max": 10},
}

# LLM-critical properties per schema type — SOP-006 LCS™ Completeness scoring
CRITICAL_PROPERTIES: Dict[str, List[str]] = {
    "Organization": [
        "name", "url", "logo", "description", "sameAs",
        "address", "contactPoint", "foundingDate",
    ],
    "Article": [
        "headline", "author", "datePublished", "dateModified",
        "description", "image", "publisher", "mainEntityOfPage",
    ],
    "BlogPosting": [
        "headline", "author", "datePublished", "dateModified",
        "description", "image", "publisher",
    ],
    "FAQPage": [
        "mainEntity",   # must have at least 2 Q&A pairs
    ],
    "HowTo": [
        "name", "description", "step", "totalTime",
    ],
    "Product": [
        "name", "description", "image", "sku", "brand",
        "offers", "aggregateRating",
    ],
    "Person": [
        "name", "url", "image", "jobTitle", "worksFor", "sameAs",
    ],
    "LocalBusiness": [
        "name", "address", "telephone", "url", "openingHours",
        "geo", "priceRange",
    ],
    "BreadcrumbList": [
        "itemListElement",
    ],
    "WebPage": [
        "name", "url", "description", "dateModified",
    ],
    "WebSite": [
        "name", "url", "potentialAction",
    ],
    "Review": [
        "reviewRating", "author", "datePublished", "reviewBody", "itemReviewed",
    ],
    "AggregateRating": [
        "ratingValue", "reviewCount", "bestRating",
    ],
    "Event": [
        "name", "startDate", "endDate", "location", "description", "organizer",
    ],
    "VideoObject": [
        "name", "description", "thumbnailUrl", "uploadDate", "duration",
    ],
    "Recipe": [
        "name", "description", "recipeIngredient", "recipeInstructions",
        "cookTime", "prepTime", "author",
    ],
    "SoftwareApplication": [
        "name", "description", "operatingSystem",
        "applicationCategory", "offers",
    ],
    "Course": [
        "name", "description", "provider", "hasCourseInstance",
    ],
    "Dataset": [
        "name", "description", "url", "creator", "datePublished",
    ],
    "ItemList": [
        "itemListElement",
    ],
}

# Entity-clarity properties (SOP-006: Entity Clarity Score parameter)
ENTITY_CLARITY_PROPS: Dict[str, List[str]] = {
    "Organization": ["sameAs", "url", "identifier", "@id"],
    "Person":       ["sameAs", "url", "identifier", "@id"],
    "Product":      ["sku", "gtin", "url", "@id"],
    "LocalBusiness":["sameAs", "url", "@id", "geo"],
    "Article":      ["@id", "url", "mainEntityOfPage"],
    "BlogPosting":  ["@id", "url", "mainEntityOfPage"],
}

# Page type → expected schema types (SOP-006 Phase 2: Page Type Classifier)
PAGE_TYPE_SCHEMA_MAP: Dict[str, List[str]] = {
    "homepage":    ["WebSite", "Organization"],
    "article":     ["Article", "BreadcrumbList", "Person"],
    "blog":        ["BlogPosting", "BreadcrumbList", "Person"],
    "product":     ["Product", "BreadcrumbList", "AggregateRating"],
    "faq":         ["FAQPage", "WebPage"],
    "howto":       ["HowTo", "BreadcrumbList"],
    "location":    ["LocalBusiness"],
    "about":       ["Organization", "Person"],
    "contact":     ["Organization", "LocalBusiness"],
    "category":    ["BreadcrumbList", "ItemList"],
    "event":       ["Event"],
    "recipe":      ["Recipe", "BreadcrumbList"],
    "course":      ["Course", "BreadcrumbList"],
    "video":       ["VideoObject", "BreadcrumbList"],
    "review":      ["Review", "AggregateRating"],
    "software":    ["SoftwareApplication"],
    "other":       ["WebPage"],
}

# SOP-006: Model-specific weighting profiles (Table: Model-Specific Weighting Profiles)
# Scale: 1.0 = normal, 2.0 = high, 3.0 = very high, 0.5 = low
MODEL_WEIGHTS: Dict[str, Dict[str, float]] = {
    "gpt4": {
        "FAQPage":              2.0,
        "HowTo":                2.0,
        "Organization_sameAs":  3.0,
        "Article_datePublished": 2.0,
        "Person":               2.0,
        "llms_txt":             1.5,
        "AggregateRating":      1.5,
        "BreadcrumbList":       0.5,
        "Speakable":            1.5,
        "Dataset":              2.0,
    },
    "gemini": {
        "FAQPage":              2.0,
        "HowTo":                3.0,
        "Organization_sameAs":  3.0,
        "Article_datePublished": 2.0,
        "Person":               3.0,
        "llms_txt":             2.0,
        "AggregateRating":      1.5,
        "BreadcrumbList":       2.0,
        "Speakable":            3.0,
        "Dataset":              1.5,
    },
    "perplexity": {
        "FAQPage":              3.0,
        "HowTo":                2.0,
        "Organization_sameAs":  2.0,
        "Article_datePublished": 3.0,
        "Person":               2.0,
        "llms_txt":             3.0,
        "AggregateRating":      2.0,
        "BreadcrumbList":       1.5,
        "Speakable":            0.5,
        "Dataset":              1.5,
    },
    "claude": {
        "FAQPage":              2.0,
        "HowTo":                2.0,
        "Organization_sameAs":  3.0,
        "Article_datePublished": 1.5,
        "Person":               2.0,
        "llms_txt":             3.0,
        "AggregateRating":      0.5,
        "BreadcrumbList":       1.5,
        "Speakable":            1.5,
        "Dataset":              2.0,
    },
}

# SOP-006: LCS™ 6-parameter weights
LCS_PARAM_WEIGHTS = {
    "presence":       0.20,
    "completeness":   0.25,
    "entity_clarity": 0.20,
    "nesting":        0.10,
    "freshness":      0.12,
    "ai_files":       0.13,
}

# SOP-006: Grade bands
LCS_GRADE_BANDS = [
    (90, "A+"),
    (80, "A"),
    (65, "B"),
    (45, "C"),
    (20, "D"),
    (0,  "F"),
]

# Gap severity levels per SOP-006
GAP_TYPES = {
    "MISSING_TYPE":       {"severity": "Critical", "base_lift": 35.0},
    "MISSING_PROPERTY":   {"severity": "High",     "base_lift": 15.0},
    "INCOMPLETE_ENTITY":  {"severity": "High",     "base_lift": 12.0},
    "STALE_DATE":         {"severity": "Medium",   "base_lift": 8.0},
    "MISSING_AI_FILE":    {"severity": "Medium",   "base_lift": 20.0},
}

FRESHNESS_THRESHOLD_DAYS = 90  # SOP-006: STALE_DATE > 90 days


# ===========================================================================
# DATA CLASSES (plain dicts — no external deps needed)
# ===========================================================================

def _schema_gap(
    gap_type: str,
    schema_type: str = "",
    property_name: str = "",
    severity: str = "",
    citation_lift_est: float = 0.0,
    message: str = "",
    fix_instruction: str = "",
) -> Dict[str, Any]:
    return {
        "gap_type":         gap_type,
        "schema_type":      schema_type,
        "property_name":    property_name,
        "severity":         severity or GAP_TYPES.get(gap_type, {}).get("severity", "Medium"),
        "citation_lift_est": citation_lift_est or GAP_TYPES.get(gap_type, {}).get("base_lift", 10.0),
        "message":          message,
        "fix_instruction":  fix_instruction,
    }


def _lcs_grade(score: float) -> str:
    for threshold, grade in LCS_GRADE_BANDS:
        if score >= threshold:
            return grade
    return "F"


# ===========================================================================
# STAGE 1 — SCHEMA DISCOVERY (SOP-006 Phase 1)
# ===========================================================================

class SchemaExtractor:
    """
    Extracts all structured data from HTML:
    - JSON-LD (primary — all <script type="application/ld+json">)
    - Microdata (itemprop / itemscope)
    - RDFa (typeof / property attributes)
    Also detects llms.txt and facts.json presence signals.
    """

    def extract(self, html: str, url: str = "") -> Dict[str, Any]:
        """
        Returns a SchemaInventory dict:
        {
          "url": str,
          "page_type": str,                    # classified page type
          "json_ld_blocks": [...],             # all parsed JSON-LD objects
          "schema_types_present": [...],       # flat list of @type values
          "microdata_items": [...],
          "rdfa_items": [...],
          "nesting_depth": int,                # max nesting depth in JSON-LD
          "validation_errors": [...],          # malformed schema issues
          "properties_map": {type: {prop: val}},
          "ai_files": {"llms_txt": bool, "facts_json": bool},
        }
        """
        inventory: Dict[str, Any] = {
            "url":                url,
            "page_type":          self._classify_page_type(url, html),
            "json_ld_blocks":     [],
            "schema_types_present": [],
            "microdata_items":    [],
            "rdfa_items":         [],
            "nesting_depth":      0,
            "validation_errors":  [],
            "properties_map":     {},
            "ai_files":           {"llms_txt": False, "facts_json": False},
        }

        if not html:
            return inventory

        if not BS4_AVAILABLE:
            inventory["validation_errors"].append(
                "BeautifulSoup not available — install with: pip install beautifulsoup4"
            )
            return inventory

        try:
            soup = BeautifulSoup(html, "html.parser")
        except Exception as e:
            inventory["validation_errors"].append(f"HTML parse error: {e}")
            return inventory

        # JSON-LD
        inventory["json_ld_blocks"] = self._extract_jsonld(soup, inventory)
        # Microdata
        inventory["microdata_items"] = self._extract_microdata(soup)
        # RDFa
        inventory["rdfa_items"] = self._extract_rdfa(soup)

        # Collect all @types
        types_seen: List[str] = []
        for block in inventory["json_ld_blocks"]:
            types_seen.extend(self._collect_types(block))
        for item in inventory["microdata_items"]:
            t = item.get("type", "").split("/")[-1]
            if t:
                types_seen.append(t)

        inventory["schema_types_present"] = list(dict.fromkeys(types_seen))

        # Build properties map
        inventory["properties_map"] = self._build_properties_map(
            inventory["json_ld_blocks"]
        )

        # Nesting depth
        for block in inventory["json_ld_blocks"]:
            d = self._nesting_depth(block)
            inventory["nesting_depth"] = max(inventory["nesting_depth"], d)

        # AI files — detect in links or meta
        inventory["ai_files"] = self._detect_ai_files(soup, url)

        return inventory

    # ------------------------------------------------------------------

    def _extract_jsonld(
        self, soup, inventory: Dict[str, Any]
    ) -> List[Any]:
        blocks: List[Any] = []
        for tag in soup.find_all(
            "script",
            attrs={"type": re.compile(r"application/ld\+json", re.I)},
        ):
            raw = (tag.string or tag.get_text() or "").strip()
            if not raw:
                continue
            try:
                parsed = json.loads(raw)
                # Normalise: always work with a list of top-level nodes
                if isinstance(parsed, dict):
                    graph = parsed.get("@graph")
                    if isinstance(graph, list):
                        blocks.extend(graph)
                    else:
                        blocks.append(parsed)
                elif isinstance(parsed, list):
                    blocks.extend(parsed)
            except json.JSONDecodeError as e:
                inventory["validation_errors"].append(
                    f"Invalid JSON-LD: {str(e)[:120]}"
                )
        return blocks

    def _extract_microdata(self, soup) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for node in soup.find_all(attrs={"itemscope": True}):
            itemtype = (node.get("itemtype") or "").strip()
            if not itemtype:
                continue
            props: Dict[str, str] = {}
            for pn in node.find_all(attrs={"itemprop": True}):
                prop = (pn.get("itemprop") or "").strip()
                val  = (
                    pn.get("content")
                    or pn.get("href")
                    or pn.get("src")
                    or pn.get_text(strip=True)
                    or ""
                ).strip()
                if prop and val and prop not in props:
                    props[prop] = val[:500]
            items.append({"type": itemtype, "properties": props})
            if len(items) >= 20:
                break
        return items

    def _extract_rdfa(self, soup) -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for node in soup.find_all(attrs={"typeof": True}):
            typeof = (node.get("typeof") or "").strip()
            if not typeof:
                continue
            props: Dict[str, str] = {}
            for pn in node.find_all(attrs={"property": True}):
                prop = (pn.get("property") or "").strip()
                val  = (
                    pn.get("content")
                    or pn.get("href")
                    or pn.get_text(strip=True)
                    or ""
                ).strip()
                if prop and val:
                    props[prop] = val[:500]
            items.append({"typeof": typeof, "properties": props})
            if len(items) >= 10:
                break
        return items

    def _collect_types(self, obj: Any) -> List[str]:
        types: List[str] = []
        if isinstance(obj, dict):
            t = obj.get("@type")
            if isinstance(t, str) and t:
                types.append(t)
            elif isinstance(t, list):
                types.extend([x for x in t if isinstance(x, str)])
            for v in obj.values():
                types.extend(self._collect_types(v))
        elif isinstance(obj, list):
            for item in obj:
                types.extend(self._collect_types(item))
        return types

    def _build_properties_map(
        self, blocks: List[Any]
    ) -> Dict[str, Dict[str, Any]]:
        """Build {schema_type: {property: value}} map from JSON-LD blocks."""
        pmap: Dict[str, Dict[str, Any]] = {}
        for block in blocks:
            if not isinstance(block, dict):
                continue
            t = block.get("@type")
            if not t:
                continue
            if isinstance(t, list):
                t = t[0]
            props = {
                k: v for k, v in block.items()
                if not k.startswith("@") and v
            }
            pmap[t] = props
        return pmap

    def _nesting_depth(self, obj: Any, current: int = 0) -> int:
        if not isinstance(obj, dict):
            return current
        max_d = current
        for v in obj.values():
            if isinstance(v, dict):
                max_d = max(max_d, self._nesting_depth(v, current + 1))
            elif isinstance(v, list):
                for item in v:
                    if isinstance(item, dict):
                        max_d = max(max_d, self._nesting_depth(item, current + 1))
        return max_d

    def _detect_ai_files(self, soup, url: str) -> Dict[str, bool]:
        result = {"llms_txt": False, "facts_json": False}
        # Check for links to llms.txt / facts.json
        for a in soup.find_all("a", href=True):
            href = (a.get("href") or "").lower()
            if "llms.txt" in href:
                result["llms_txt"] = True
            if "facts.json" in href:
                result["facts_json"] = True
        # Check meta tags
        for meta in soup.find_all("meta"):
            content = (meta.get("content") or "").lower()
            if "llms.txt" in content:
                result["llms_txt"] = True
            if "facts.json" in content:
                result["facts_json"] = True
        return result

    def _classify_page_type(self, url: str, html: str) -> str:
        """
        Classify page type from URL pattern + H1 + meta signals.
        Returns one of the keys in PAGE_TYPE_SCHEMA_MAP.
        """
        path = urlparse(url).path.lower() if url else ""

        patterns = [
            (r"/(blog|post|article|news)/",            "article"),
            (r"/(blog|posts|articles|news)/?$",        "blog"),
            (r"/(product|products|shop|store|buy)/",   "product"),
            (r"/(faq|faqs|frequently-asked)/?",        "faq"),
            (r"/(how-to|guide|tutorial)/",             "howto"),
            (r"/(event|events|conference)/",           "event"),
            (r"/(recipe|recipes|cook)/",               "recipe"),
            (r"/(course|courses|learn|class)/",        "course"),
            (r"/(video|watch|media)/",                 "video"),
            (r"/(review|reviews|testimonial)/",        "review"),
            (r"/(software|app|download)/",             "software"),
            (r"/(contact|reach|get-in-touch)/?",       "contact"),
            (r"/(about|about-us|who-we-are)/?",        "about"),
            (r"/(location|locations|find-us|store-locator)/?", "location"),
            (r"/(category|categories|tag|tags)/",      "category"),
        ]
        for pattern, ptype in patterns:
            if re.search(pattern, path):
                return ptype

        # Homepage
        if path in ("", "/", "/home", "/index"):
            return "homepage"

        # Content signals from HTML
        if html and BS4_AVAILABLE:
            try:
                soup = BeautifulSoup(html[:5000], "html.parser")
                h1 = soup.find("h1")
                h1_text = (h1.get_text(strip=True) if h1 else "").lower()
                meta_desc = ""
                m = soup.find("meta", attrs={"name": "description"})
                if m:
                    meta_desc = (m.get("content") or "").lower()

                combined = h1_text + " " + meta_desc
                if re.search(r"\bhow\s+to\b", combined):
                    return "howto"
                if re.search(r"\bfaq\b|\bfrequently\s+asked\b", combined):
                    return "faq"
                if re.search(r"\brecipe\b|\bingredients?\b", combined):
                    return "recipe"
                if re.search(r"\bevent\b|\bconference\b|\bwebinar\b", combined):
                    return "event"
            except Exception:
                pass

        return "other"


# ===========================================================================
# STAGE 2 — GAP DETECTION (SOP-006 Phase 3)
# ===========================================================================

class SchemaGapDetector:
    """
    Detects 5 gap types per SOP-006:
    1. MISSING_TYPE       — required schema for this page type is absent
    2. MISSING_PROPERTY   — schema present but critical property absent
    3. INCOMPLETE_ENTITY  — entity lacks sameAs/url/identifier for disambiguation
    4. STALE_DATE         — dateModified > 90 days without update
    5. MISSING_AI_FILE    — llms.txt / facts.json not detected
    """

    def detect(
        self,
        inventory: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        gaps: List[Dict[str, Any]] = []
        page_type      = inventory.get("page_type", "other")
        types_present  = set(inventory.get("schema_types_present") or [])
        properties_map = inventory.get("properties_map") or {}
        ai_files       = inventory.get("ai_files") or {}

        # ── GAP TYPE 1: MISSING_TYPE ──────────────────────────────────
        expected_types = PAGE_TYPE_SCHEMA_MAP.get(page_type, ["WebPage"])
        for expected in expected_types:
            # Also accept subtype variants (e.g. BlogPosting satisfies Article)
            variants = self._type_variants(expected)
            if not types_present.intersection(variants):
                tier_info = SCHEMA_TIERS.get(expected, {})
                lift_mid  = (
                    tier_info.get("citation_lift_min", 10) +
                    tier_info.get("citation_lift_max", 20)
                ) / 2
                gaps.append(_schema_gap(
                    gap_type="MISSING_TYPE",
                    schema_type=expected,
                    severity="Critical" if tier_info.get("tier") == 1 else "High",
                    citation_lift_est=lift_mid,
                    message=(
                        f"{expected} schema is completely absent. "
                        f"This is a {page_type} page — {expected} is required."
                    ),
                    fix_instruction=(
                        f"Add a {expected} JSON-LD block to this page. "
                        f"Estimated citation lift: +{lift_mid:.0f}%."
                    ),
                ))

        # ── GAP TYPE 2: MISSING_PROPERTY ─────────────────────────────
        for schema_type, required_props in CRITICAL_PROPERTIES.items():
            if schema_type not in types_present:
                continue
            page_props = properties_map.get(schema_type) or {}
            for prop in required_props:
                val = page_props.get(prop)
                missing = not val
                # Special check: FAQPage must have mainEntity with items
                if prop == "mainEntity" and val:
                    if isinstance(val, list) and len(val) < 2:
                        missing = True
                if missing:
                    tier = SCHEMA_TIERS.get(schema_type, {}).get("tier", 3)
                    gaps.append(_schema_gap(
                        gap_type="MISSING_PROPERTY",
                        schema_type=schema_type,
                        property_name=prop,
                        severity="Critical" if tier == 1 and prop in [
                            "author", "datePublished", "mainEntity",
                            "name", "headline", "offers", "step",
                        ] else "High",
                        citation_lift_est=self._property_lift(schema_type, prop),
                        message=(
                            f"{schema_type} is missing the '{prop}' property. "
                            f"LLMs use this to identify and cite the entity."
                        ),
                        fix_instruction=(
                            f"Add '{prop}' to your {schema_type} schema. "
                            + self._property_guidance(schema_type, prop)
                        ),
                    ))

        # ── GAP TYPE 3: INCOMPLETE_ENTITY ─────────────────────────────
        for entity_type, clarity_props in ENTITY_CLARITY_PROPS.items():
            if entity_type not in types_present:
                continue
            page_props = properties_map.get(entity_type) or {}
            missing_clarity = [
                p for p in clarity_props if not page_props.get(p)
            ]
            if len(missing_clarity) >= 2:
                gaps.append(_schema_gap(
                    gap_type="INCOMPLETE_ENTITY",
                    schema_type=entity_type,
                    property_name=", ".join(missing_clarity[:3]),
                    severity="High",
                    citation_lift_est=12.0,
                    message=(
                        f"{entity_type} entity is declared but missing disambiguation "
                        f"properties: {', '.join(missing_clarity[:3])}. "
                        f"LLMs cannot reliably identify this entity."
                    ),
                    fix_instruction=(
                        f"Add sameAs (Wikipedia/Wikidata URLs), url, and @id "
                        f"to your {entity_type} schema for entity disambiguation."
                    ),
                ))

        # ── GAP TYPE 4: STALE_DATE ────────────────────────────────────
        for schema_type in ["Article", "BlogPosting", "NewsArticle",
                             "Product", "Event"]:
            if schema_type not in types_present:
                continue
            page_props = properties_map.get(schema_type) or {}
            date_str = (
                page_props.get("dateModified")
                or page_props.get("datePublished")
                or ""
            )
            if date_str:
                try:
                    # Parse ISO 8601 date
                    dt = datetime.fromisoformat(
                        date_str.replace("Z", "+00:00")
                    )
                    age = datetime.now(timezone.utc) - dt
                    if age.days > FRESHNESS_THRESHOLD_DAYS:
                        gaps.append(_schema_gap(
                            gap_type="STALE_DATE",
                            schema_type=schema_type,
                            property_name="dateModified",
                            severity="Medium",
                            citation_lift_est=8.0,
                            message=(
                                f"{schema_type} dateModified is {age.days} days old "
                                f"(threshold: {FRESHNESS_THRESHOLD_DAYS} days). "
                                f"LLMs strongly weight recency."
                            ),
                            fix_instruction=(
                                f"Update dateModified to today's date in ISO 8601 "
                                f"format: {datetime.now().strftime('%Y-%m-%d')}."
                            ),
                        ))
                except Exception:
                    pass
            elif schema_type in ["Article", "BlogPosting", "NewsArticle"]:
                # Date entirely missing
                gaps.append(_schema_gap(
                    gap_type="MISSING_PROPERTY",
                    schema_type=schema_type,
                    property_name="datePublished",
                    severity="Critical",
                    citation_lift_est=15.0,
                    message=(
                        f"{schema_type} has no datePublished. "
                        f"LLMs heavily weight content recency."
                    ),
                    fix_instruction=(
                        f"Add datePublished and dateModified in ISO 8601 format."
                    ),
                ))

        # ── GAP TYPE 5: MISSING_AI_FILE ───────────────────────────────
        if not ai_files.get("llms_txt"):
            gaps.append(_schema_gap(
                gap_type="MISSING_AI_FILE",
                schema_type="llms.txt",
                severity="Medium",
                citation_lift_est=25.0,
                message=(
                    "llms.txt not detected. This file directly signals LLM "
                    "crawl permission and content preferences."
                ),
                fix_instruction=(
                    "Create /llms.txt at your domain root. "
                    "Use the llms.txt generator to auto-populate it."
                ),
            ))
        if not ai_files.get("facts_json"):
            gaps.append(_schema_gap(
                gap_type="MISSING_AI_FILE",
                schema_type="facts.json",
                severity="Medium",
                citation_lift_est=18.0,
                message=(
                    "facts.json not detected. This structured entity fact file "
                    "surfaces directly in LLM answer generation."
                ),
                fix_instruction=(
                    "Create facts.json and publish it at /facts.json. "
                    "Use the facts.json generator to auto-populate from existing schema."
                ),
            ))

        return gaps

    # ------------------------------------------------------------------

    def _type_variants(self, schema_type: str) -> set:
        """Return acceptable variant types (e.g. BlogPosting satisfies Article)."""
        variants: Dict[str, set] = {
            "Article":       {"Article", "BlogPosting", "NewsArticle", "TechArticle"},
            "BlogPosting":   {"BlogPosting", "Article"},
            "Organization":  {"Organization", "LocalBusiness", "ProfessionalService",
                              "MedicalBusiness", "LegalService", "FinancialService",
                              "FoodEstablishment", "Store", "Hotel"},
            "LocalBusiness": {"LocalBusiness", "FoodEstablishment", "Store", "Hotel",
                              "MedicalBusiness", "LegalService"},
        }
        return variants.get(schema_type, {schema_type})

    def _property_lift(self, schema_type: str, prop: str) -> float:
        """Estimate citation lift for a specific missing property."""
        high_value = {
            ("Article",    "author"):          18.0,
            ("Article",    "datePublished"):   15.0,
            ("Article",    "image"):           12.0,
            ("FAQPage",    "mainEntity"):       40.0,
            ("Organization", "sameAs"):        20.0,
            ("Organization", "logo"):          10.0,
            ("Product",    "aggregateRating"): 14.0,
            ("Product",    "offers"):          12.0,
            ("Person",     "sameAs"):          15.0,
            ("LocalBusiness", "address"):      18.0,
            ("LocalBusiness", "telephone"):    8.0,
        }
        return high_value.get((schema_type, prop), 8.0)

    def _property_guidance(self, schema_type: str, prop: str) -> str:
        """Return LLM-specific guidance for a missing property."""
        guidance = {
            ("Organization", "sameAs"):    "Include Wikipedia, Wikidata, LinkedIn, Crunchbase URLs.",
            ("Organization", "logo"):      "Use absolute URL of your official logo image.",
            ("Article",      "author"):    "Add Person schema with name, url, and sameAs.",
            ("Article",      "datePublished"): "Use ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ.",
            ("FAQPage",      "mainEntity"): "Add at least 3-5 Q&A pairs as Question nodes.",
            ("Product",      "aggregateRating"): "Include ratingValue, reviewCount, bestRating.",
            ("Person",       "sameAs"):    "Include LinkedIn, Twitter/X, Wikipedia URLs.",
            ("LocalBusiness","address"):   "Add full PostalAddress with streetAddress, city, country.",
        }
        return guidance.get((schema_type, prop), "Populate with accurate page-specific data.")


# ===========================================================================
# STAGE 3 — LCS™ SCORING ENGINE (SOP-006 Phase 4)
# ===========================================================================

class LCSScorer:
    """
    LLM Citation Readiness Score™ — Schema Sub-Score (0–100)
    6 parameters × weights per SOP-006:
      Presence (20%) + Completeness (25%) + Entity Clarity (20%)
      + Nesting (10%) + Freshness (12%) + AI Files (13%)

    Also applies model-specific weighting profiles for GPT-4,
    Gemini, Perplexity, and Claude.
    """

    def score(
        self,
        inventory: Dict[str, Any],
        gaps: List[Dict[str, Any]],
        model: str = "all",
    ) -> Dict[str, Any]:
        """
        Returns:
        {
          "lcs_score": float (0-100),
          "grade": str,
          "dimension_scores": {presence, completeness, entity_clarity,
                               nesting, freshness, ai_files},
          "model_scores": {gpt4, gemini, perplexity, claude},
          "aivs_schema_contribution": float,  # 18% weight in AIVS™
          "top_recommendations": [...],
        }
        """
        page_type     = inventory.get("page_type", "other")
        types_present = set(inventory.get("schema_types_present") or [])
        props_map     = inventory.get("properties_map") or {}
        ai_files      = inventory.get("ai_files") or {}
        nesting_depth = inventory.get("nesting_depth", 0)

        # ── 1. Presence Score (20 pts) ─────────────────────────────────
        presence = self._score_presence(page_type, types_present)

        # ── 2. Completeness Score (25 pts) ────────────────────────────
        completeness = self._score_completeness(types_present, props_map)

        # ── 3. Entity Clarity Score (20 pts) ──────────────────────────
        entity_clarity = self._score_entity_clarity(types_present, props_map)

        # ── 4. Nesting Depth Score (10 pts) ───────────────────────────
        nesting = self._score_nesting(nesting_depth)

        # ── 5. Freshness Score (12 pts) ────────────────────────────────
        freshness = self._score_freshness(types_present, props_map, gaps)

        # ── 6. AI Files Score (13 pts) ────────────────────────────────
        ai_file_score = self._score_ai_files(ai_files)

        # ── Weighted composite ─────────────────────────────────────────
        raw_score = (
            presence       * 100 * LCS_PARAM_WEIGHTS["presence"]       +
            completeness   * 100 * LCS_PARAM_WEIGHTS["completeness"]   +
            entity_clarity * 100 * LCS_PARAM_WEIGHTS["entity_clarity"] +
            nesting        * 100 * LCS_PARAM_WEIGHTS["nesting"]        +
            freshness      * 100 * LCS_PARAM_WEIGHTS["freshness"]      +
            ai_file_score  * 100 * LCS_PARAM_WEIGHTS["ai_files"]
        )
        lcs = round(min(100.0, max(0.0, raw_score)), 2)
        grade = _lcs_grade(lcs)

        dimension_scores = {
            "presence":        round(presence * 20, 2),
            "completeness":    round(completeness * 25, 2),
            "entity_clarity":  round(entity_clarity * 20, 2),
            "nesting":         round(nesting * 10, 2),
            "freshness":       round(freshness * 12, 2),
            "ai_files":        round(ai_file_score * 13, 2),
        }

        # ── Per-model scores ───────────────────────────────────────────
        model_scores = {
            m: self._apply_model_weights(lcs, types_present, props_map, m)
            for m in ["gpt4", "gemini", "perplexity", "claude"]
        }

        # ── AIVS™ contribution (18% of AIVS™ composite) ───────────────
        aivs_contribution = round(lcs * 0.18, 2)

        # ── Top recommendations ────────────────────────────────────────
        top_recs = self._top_recommendations(gaps)

        return {
            "lcs_score":              lcs,
            "grade":                  grade,
            "dimension_scores":       dimension_scores,
            "model_scores":           model_scores,
            "aivs_schema_contribution": aivs_contribution,
            "top_recommendations":    top_recs,
            "schema_types_present":   list(types_present),
            "page_type":              page_type,
        }

    # ------------------------------------------------------------------

    def _score_presence(
        self, page_type: str, types_present: set
    ) -> float:
        """0.0–1.0: what fraction of required types are present?"""
        expected = PAGE_TYPE_SCHEMA_MAP.get(page_type, ["WebPage"])
        if not expected:
            return 1.0
        hit = 0
        for exp in expected:
            variants = SchemaGapDetector()._type_variants(exp)
            if types_present.intersection(variants):
                hit += 1
        return hit / len(expected)

    def _score_completeness(
        self, types_present: set, props_map: Dict[str, Any]
    ) -> float:
        """0.0–1.0: fraction of critical properties populated across all present types."""
        total, filled = 0, 0
        for schema_type in types_present:
            critical = CRITICAL_PROPERTIES.get(schema_type, [])
            if not critical:
                continue
            page_props = props_map.get(schema_type) or {}
            for prop in critical:
                total += 1
                val = page_props.get(prop)
                if val:
                    if prop == "mainEntity":
                        # Must have ≥ 2 Q&A pairs
                        filled += 1 if isinstance(val, list) and len(val) >= 2 else 0
                    else:
                        filled += 1
        return filled / total if total > 0 else 0.5

    def _score_entity_clarity(
        self, types_present: set, props_map: Dict[str, Any]
    ) -> float:
        """0.0–1.0: entity disambiguation completeness."""
        total, filled = 0, 0
        for entity_type, clarity_props in ENTITY_CLARITY_PROPS.items():
            if entity_type not in types_present:
                continue
            page_props = props_map.get(entity_type) or {}
            for prop in clarity_props:
                total += 1
                if page_props.get(prop):
                    filled += 1
        return filled / total if total > 0 else 0.3

    def _score_nesting(self, nesting_depth: int) -> float:
        """0.0–1.0: reward proper nested entity declarations."""
        # Depth 0 = no nesting (flat, poor)
        # Depth 1 = basic (author inside Article)
        # Depth 2+ = rich (author → Person → worksFor → Organization)
        if nesting_depth == 0:
            return 0.2
        if nesting_depth == 1:
            return 0.6
        if nesting_depth == 2:
            return 0.9
        return 1.0

    def _score_freshness(
        self,
        types_present: set,
        props_map: Dict[str, Any],
        gaps: List[Dict[str, Any]],
    ) -> float:
        """0.0–1.0: recency of dateModified/datePublished."""
        # If no date-dependent types present, neutral score
        date_types = {"Article", "BlogPosting", "NewsArticle", "Product", "Event"}
        relevant = date_types.intersection(types_present)
        if not relevant:
            return 0.7  # Not applicable — neutral

        stale_gaps = [
            g for g in gaps
            if g.get("gap_type") == "STALE_DATE"
        ]
        if stale_gaps:
            return 0.2

        # Check if dates exist and are recent
        total, fresh = 0, 0
        for schema_type in relevant:
            page_props = props_map.get(schema_type) or {}
            date_str = (
                page_props.get("dateModified")
                or page_props.get("datePublished")
                or ""
            )
            if date_str:
                total += 1
                try:
                    dt = datetime.fromisoformat(
                        date_str.replace("Z", "+00:00")
                    )
                    age = datetime.now(timezone.utc) - dt
                    if age.days <= FRESHNESS_THRESHOLD_DAYS:
                        fresh += 1
                except Exception:
                    pass

        if total == 0:
            return 0.3  # dates missing
        return fresh / total

    def _score_ai_files(self, ai_files: Dict[str, bool]) -> float:
        """0.0–1.0: AI file presence (llms.txt + facts.json)."""
        score = 0.0
        if ai_files.get("llms_txt"):
            score += 0.6   # llms.txt is more impactful
        if ai_files.get("facts_json"):
            score += 0.4
        return score

    def _apply_model_weights(
        self,
        base_score: float,
        types_present: set,
        props_map: Dict[str, Any],
        model: str,
    ) -> Dict[str, Any]:
        """Apply model-specific weighting to produce per-model LCS™."""
        weights = MODEL_WEIGHTS.get(model, {})
        adjustment = 0.0

        # FAQPage bonus
        if "FAQPage" in types_present:
            w = weights.get("FAQPage", 1.0)
            adjustment += (w - 1.0) * 5

        # HowTo bonus
        if "HowTo" in types_present:
            w = weights.get("HowTo", 1.0)
            adjustment += (w - 1.0) * 4

        # Organization + sameAs
        if "Organization" in types_present:
            org_props = props_map.get("Organization") or {}
            if org_props.get("sameAs"):
                w = weights.get("Organization_sameAs", 1.0)
                adjustment += (w - 1.0) * 6

        # Author datePublished
        for article_type in ["Article", "BlogPosting", "NewsArticle"]:
            if article_type in types_present:
                art_props = props_map.get(article_type) or {}
                if art_props.get("datePublished"):
                    w = weights.get("Article_datePublished", 1.0)
                    adjustment += (w - 1.0) * 4
                break

        model_score = round(
            min(100.0, max(0.0, base_score + adjustment)), 2
        )
        return {
            "score": model_score,
            "grade": _lcs_grade(model_score),
        }

    def _top_recommendations(
        self, gaps: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Return top 3 highest-impact gaps as quick-win recommendations."""
        sorted_gaps = sorted(
            gaps,
            key=lambda g: g.get("citation_lift_est", 0),
            reverse=True,
        )
        return [
            {
                "priority":         i + 1,
                "gap_type":         g["gap_type"],
                "schema_type":      g["schema_type"],
                "property":         g.get("property_name", ""),
                "estimated_lift":   f"+{g['citation_lift_est']:.0f}%",
                "fix_instruction":  g["fix_instruction"],
                "severity":         g["severity"],
            }
            for i, g in enumerate(sorted_gaps[:3])
        ]


# ===========================================================================
# STAGE 4 — FIX-PATCH GENERATOR (SOP-006 Phase 5)
# ===========================================================================

class FixPatchGenerator:
    """
    Auto-generates validated JSON-LD fix patches for every detected gap.
    Uses SchemaGenerator (from schema_generator.py) when available for
    AI-powered patch generation. Falls back to deterministic templates.
    """

    # JSON-LD patch templates per gap type + schema type
    _PATCH_TEMPLATES: Dict[str, Any] = {
        "Organization": {
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": "#Organization",
            "name": "{{name}}",
            "url": "{{url}}",
            "logo": {"@type": "ImageObject", "url": "{{logo_url}}"},
            "description": "{{description}}",
            "sameAs": ["{{social_url_1}}", "{{social_url_2}}"],
            "address": {
                "@type": "PostalAddress",
                "streetAddress":   "{{street}}",
                "addressLocality": "{{city}}",
                "addressRegion":   "{{region}}",
                "postalCode":      "{{postal_code}}",
                "addressCountry":  "{{country}}",
            },
            "contactPoint": {
                "@type": "ContactPoint",
                "telephone": "{{telephone}}",
                "contactType": "customer service",
            },
        },
        "Article": {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": "{{headline}}",
            "description": "{{description}}",
            "image": "{{image_url}}",
            "datePublished": "{{date_published}}",
            "dateModified": "{{date_modified}}",
            "author": {
                "@type": "Person",
                "name": "{{author_name}}",
                "url": "{{author_url}}",
                "sameAs": ["{{author_social}}"],
            },
            "publisher": {
                "@type": "Organization",
                "name": "{{publisher_name}}",
                "logo": {"@type": "ImageObject", "url": "{{logo_url}}"},
            },
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": "{{page_url}}",
            },
        },
        "FAQPage": {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {
                    "@type": "Question",
                    "name": "{{question_1}}",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "{{answer_1}}",
                    },
                },
                {
                    "@type": "Question",
                    "name": "{{question_2}}",
                    "acceptedAnswer": {
                        "@type": "Answer",
                        "text": "{{answer_2}}",
                    },
                },
            ],
        },
        "BreadcrumbList": {
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": "{{home_url}}"},
                {"@type": "ListItem", "position": 2, "name": "{{page_name}}", "item": "{{page_url}}"},
            ],
        },
        "Person": {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": "{{name}}",
            "url": "{{url}}",
            "image": "{{image_url}}",
            "jobTitle": "{{job_title}}",
            "worksFor": {"@type": "Organization", "name": "{{org_name}}"},
            "sameAs": ["{{linkedin_url}}", "{{twitter_url}}"],
            "description": "{{description}}",
        },
        "Product": {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "{{name}}",
            "description": "{{description}}",
            "image": ["{{image_url_1}}", "{{image_url_2}}"],
            "sku": "{{sku}}",
            "brand": {"@type": "Brand", "name": "{{brand_name}}"},
            "offers": {
                "@type": "Offer",
                "url": "{{url}}",
                "priceCurrency": "{{currency}}",
                "price": "{{price}}",
                "availability": "https://schema.org/InStock",
            },
            "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "{{rating_value}}",
                "reviewCount": "{{review_count}}",
                "bestRating": "5",
            },
        },
        "LocalBusiness": {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "{{name}}",
            "url": "{{url}}",
            "telephone": "{{telephone}}",
            "email": "{{email}}",
            "address": {
                "@type": "PostalAddress",
                "streetAddress":   "{{street}}",
                "addressLocality": "{{city}}",
                "addressRegion":   "{{region}}",
                "postalCode":      "{{postal_code}}",
                "addressCountry":  "{{country}}",
            },
            "openingHours": ["Mo-Fr 09:00-18:00"],
            "image": "{{image_url}}",
            "priceRange": "{{price_range}}",
        },
        "WebSite": {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "{{name}}",
            "url": "{{url}}",
            "description": "{{description}}",
            "potentialAction": {
                "@type": "SearchAction",
                "target": {
                    "@type": "EntryPoint",
                    "urlTemplate": "{{url}}?s={search_term_string}",
                },
                "query-input": "required name=search_term_string",
            },
        },
    }

    def generate_patches(
        self,
        gaps: List[Dict[str, Any]],
        page_data: Optional[Dict[str, Any]] = None,
        schema_generator=None,
    ) -> List[Dict[str, Any]]:
        """
        Generate a fix patch for every gap.
        Returns list of patch dicts with:
        {
          gap_type, schema_type, property_name, patch_json,
          validation_status, estimated_lift, before_after_diff
        }
        """
        patches: List[Dict[str, Any]] = []
        page_data = page_data or {}

        for gap in gaps:
            patch = self._generate_patch(gap, page_data, schema_generator)
            if patch:
                patches.append(patch)

        return patches

    def _generate_patch(
        self,
        gap: Dict[str, Any],
        page_data: Dict[str, Any],
        schema_generator=None,
    ) -> Optional[Dict[str, Any]]:
        gap_type    = gap.get("gap_type", "")
        schema_type = gap.get("schema_type", "")
        prop_name   = gap.get("property_name", "")

        patch_json: Optional[Dict[str, Any]] = None

        if gap_type == "MISSING_TYPE":
            # Full schema template for the missing type
            patch_json = self._get_template(schema_type)

        elif gap_type == "MISSING_PROPERTY":
            # Property-level patch (minimal wrapper)
            patch_json = self._property_patch(schema_type, prop_name, page_data)

        elif gap_type == "INCOMPLETE_ENTITY":
            # Entity clarity patch — adds sameAs/@id
            patch_json = self._entity_clarity_patch(schema_type, page_data)

        elif gap_type == "STALE_DATE":
            patch_json = {
                "@context": "https://schema.org",
                "@type": schema_type,
                "dateModified": datetime.now().strftime("%Y-%m-%dT%H:%M:%S+00:00"),
            }

        elif gap_type == "MISSING_AI_FILE":
            if schema_type == "llms.txt":
                patch_json = self._llms_txt_template(page_data)
            else:
                patch_json = self._facts_json_template(page_data)

        if patch_json is None:
            return None

        # Validate the patch
        is_valid, errors = self._validate_patch(patch_json)

        return {
            "gap_type":         gap_type,
            "schema_type":      schema_type,
            "property_name":    prop_name,
            "patch_json":       patch_json,
            "patch_text":       json.dumps(patch_json, indent=2, ensure_ascii=False),
            "validation_status": "valid" if is_valid else "invalid",
            "validation_errors": errors,
            "estimated_lift":   f"+{gap.get('citation_lift_est', 10):.0f}%",
            "severity":         gap.get("severity", "Medium"),
        }

    def _get_template(self, schema_type: str) -> Optional[Dict[str, Any]]:
        import copy
        tpl = self._PATCH_TEMPLATES.get(schema_type)
        return copy.deepcopy(tpl) if tpl else {
            "@context": "https://schema.org",
            "@type": schema_type,
        }

    def _property_patch(
        self,
        schema_type: str,
        prop: str,
        page_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate minimal patch that adds just the missing property."""
        base: Dict[str, Any] = {
            "@context": "https://schema.org",
            "@type": schema_type,
        }
        # Property-specific value helpers
        url = page_data.get("url") or page_data.get("canonical") or ""
        title = page_data.get("title") or ""
        today = datetime.now().strftime("%Y-%m-%dT%H:%M:%S+00:00")

        defaults: Dict[str, Any] = {
            "url":           url,
            "datePublished": today,
            "dateModified":  today,
            "name":          title,
            "headline":      title,
            "description":   (page_data.get("meta") or {}).get("description", ""),
            "sameAs":        page_data.get("social_links") or [],
            "author": {
                "@type": "Person",
                "name": (page_data.get("authors") or [{}])[0].get("name", ""),
            },
            "publisher": {
                "@type": "Organization",
                "name": page_data.get("url_host") or "",
                "logo": {"@type": "ImageObject", "url": ""},
            },
            "mainEntityOfPage": {
                "@type": "WebPage",
                "@id": url,
            },
            "address": {
                "@type": "PostalAddress",
                **{k: v for k, v in (page_data.get("address_signals") or {}).items()
                   if k != "@type"},
            },
            "image": (page_data.get("images") or [{}])[0].get("url", ""),
            "telephone": (page_data.get("phone_signals") or [""])[0],
            "email": (page_data.get("email_signals") or [""])[0],
        }
        if prop in defaults:
            base[prop] = defaults[prop]
        else:
            base[prop] = f"{{{{value_for_{prop}}}}}"

        return base

    def _entity_clarity_patch(
        self,
        schema_type: str,
        page_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        url = page_data.get("url") or page_data.get("canonical") or ""
        social = page_data.get("social_links") or []
        return {
            "@context": "https://schema.org",
            "@type": schema_type,
            "@id": f"{url}#{schema_type}",
            "url": url,
            "sameAs": social[:5] if social else [
                "{{wikipedia_url}}",
                "{{linkedin_url}}",
            ],
            "identifier": url,
        }

    def _llms_txt_template(self, page_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate llms.txt content structure (returned as dict for consistency)."""
        url = page_data.get("url") or ""
        host = urlparse(url).netloc if url else "yourdomain.com"
        return {
            "_file_type": "llms.txt",
            "_deploy_path": "/llms.txt",
            "_content": (
                f"# LLMs.txt for {host}\n"
                f"# Generated by Colytics AI — MOAT 6\n\n"
                f"User-agent: *\n"
                f"Allow: /\n\n"
                f"# Primary content\n"
                f"Allow: /blog/\n"
                f"Allow: /articles/\n"
                f"Allow: /faq/\n\n"
                f"# Business information\n"
                f"Allow: /about/\n"
                f"Allow: /contact/\n\n"
                f"# Exclude private/dynamic pages\n"
                f"Disallow: /admin/\n"
                f"Disallow: /checkout/\n"
                f"Disallow: /account/\n"
            ),
        }

    def _facts_json_template(self, page_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate facts.json structure."""
        url = page_data.get("url") or ""
        title = page_data.get("title") or ""
        host = urlparse(url).netloc if url else ""
        return {
            "_file_type": "facts.json",
            "_deploy_path": "/facts.json",
            "entity": {
                "@type": "Organization",
                "name": title or host,
                "url": url,
                "description": (page_data.get("meta") or {}).get("description", ""),
                "sameAs": page_data.get("social_links") or [],
            },
            "facts": [
                {
                    "claim": f"{title or host} is a company/website at {url}",
                    "confidence": "high",
                    "source": url,
                }
            ],
        }

    def _validate_patch(
        self, patch: Dict[str, Any]
    ) -> Tuple[bool, List[str]]:
        """Basic schema.org validation."""
        errors: List[str] = []
        if not isinstance(patch, dict):
            errors.append("Patch is not a JSON object")
            return False, errors

        # Skip validation for special file types
        if patch.get("_file_type"):
            return True, []

        if "@context" not in patch:
            errors.append("Missing @context")
        if "@type" not in patch:
            errors.append("Missing @type")

        schema_type = patch.get("@type", "")
        KNOWN_TYPES = (
            set(SCHEMA_TIERS.keys()) |
            {"WebSite", "WebPage", "NewsArticle", "TechArticle",
             "ProfessionalService", "Store", "Hotel", "Brand",
             "Offer", "PostalAddress", "ContactPoint", "ImageObject",
             "SearchAction", "EntryPoint", "AggregateRating"}
        )
        if schema_type and schema_type not in KNOWN_TYPES:
            errors.append(f"Unrecognised @type: {schema_type}")

        # Check for template placeholders not filled
        patch_str = json.dumps(patch)
        placeholders = re.findall(r"\{\{[^}]+\}\}", patch_str)
        if placeholders:
            errors.append(
                f"Template placeholders not filled: {', '.join(list(set(placeholders))[:5])}"
            )

        return len(errors) == 0, errors


# ===========================================================================
# STAGE 5 — MASTER PIPELINE (SOP-006 5-Stage Orchestrator)
# ===========================================================================

class SchemaIntelligenceEngine:
    """
    MOAT 6 — Full 5-stage pipeline orchestrator.

    Usage:
        engine = SchemaIntelligenceEngine()
        report = engine.analyse(html, url)

    Returns a complete LCS™ analysis report ready for:
    - Customer Dashboard (Layers 1, 2, 3)
    - AIVS™ schema dimension feed
    - Admin intelligence layer
    """

    def __init__(self, schema_generator=None):
        """
        schema_generator: optional SchemaGenerator instance from schema_generator.py
                          Used for AI-powered patch generation when available.
        """
        self.extractor   = SchemaExtractor()
        self.gap_detector = SchemaGapDetector()
        self.scorer      = LCSScorer()
        self.patch_gen   = FixPatchGenerator()
        self.schema_gen  = schema_generator

    def analyse(
        self,
        html: str,
        url: str,
        page_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run the full 5-stage pipeline.
        Returns the complete MOAT 6 intelligence report.

        Args:
            html:      Raw HTML of the page
            url:       Canonical URL
            page_data: Optional pre-extracted page_data from SchemaGenerator
                       (pass this when integrating with schema_generator.py
                       to avoid double-parsing)

        Returns dict with keys:
            url, page_type,
            Stage1: schema_inventory
            Stage2: gap_report
            Stage3: lcs_score_report
            Stage4: fix_patches
            Stage5: aivs_feed
            summary (customer dashboard Layer 1 data)
        """
        logging.info(f"[MOAT6] Starting analysis: {url}")

        # ── STAGE 1: Discovery ─────────────────────────────────────────
        inventory = self.extractor.extract(html, url)
        logging.info(
            f"[MOAT6] Stage 1 complete — types found: "
            f"{inventory['schema_types_present']}"
        )

        # ── STAGE 2: Gap Detection ─────────────────────────────────────
        gaps = self.gap_detector.detect(inventory)
        logging.info(
            f"[MOAT6] Stage 2 complete — {len(gaps)} gaps detected"
        )

        # ── STAGE 3: LCS™ Scoring ──────────────────────────────────────
        score_report = self.scorer.score(inventory, gaps)
        logging.info(
            f"[MOAT6] Stage 3 complete — "
            f"LCS™={score_report['lcs_score']} Grade={score_report['grade']}"
        )

        # ── STAGE 4: Fix-Patch Generation ─────────────────────────────
        patches = self.patch_gen.generate_patches(
            gaps, page_data, self.schema_gen
        )
        logging.info(
            f"[MOAT6] Stage 4 complete — {len(patches)} patches generated"
        )

        # ── STAGE 5: AIVS™ Feed ───────────────────────────────────────
        aivs_feed = self._build_aivs_feed(score_report, gaps, inventory)

        # ── Build complete report ──────────────────────────────────────
        report = {
            "url":        url,
            "page_type":  inventory["page_type"],
            "analysed_at": datetime.now(timezone.utc).isoformat(),

            # Dashboard Layer 1 — Executive Summary
            "summary": self._build_summary(
                score_report, gaps, patches, inventory
            ),

            # Dashboard Layer 2 — Diagnostic Insights
            "gap_report": {
                "total_gaps":      len(gaps),
                "critical_gaps":   [g for g in gaps if g["severity"] == "Critical"],
                "high_gaps":       [g for g in gaps if g["severity"] == "High"],
                "medium_gaps":     [g for g in gaps if g["severity"] == "Medium"],
                "gaps_by_type":    self._group_by(gaps, "gap_type"),
                "all_gaps":        gaps,
            },

            # Dashboard Layer 3 — Fix Patches
            "fix_patches": patches,

            # LCS™ Score Report
            "lcs_score_report": score_report,

            # Schema inventory (raw)
            "schema_inventory": {
                "types_present":   inventory["schema_types_present"],
                "nesting_depth":   inventory["nesting_depth"],
                "validation_errors": inventory["validation_errors"],
                "ai_files":        inventory["ai_files"],
                "block_count":     len(inventory["json_ld_blocks"]),
                "microdata_count": len(inventory["microdata_items"]),
            },

            # AIVS™ integration feed
            "aivs_feed": aivs_feed,
        }

        logging.info(f"[MOAT6] Analysis complete: {url}")
        return report

    # ------------------------------------------------------------------

    def _build_summary(
        self,
        score_report: Dict[str, Any],
        gaps: List[Dict[str, Any]],
        patches: List[Dict[str, Any]],
        inventory: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Customer Dashboard Layer 1 — Executive Overview data."""
        lcs   = score_report["lcs_score"]
        grade = score_report["grade"]

        # Schema coverage %
        page_type    = inventory.get("page_type", "other")
        expected     = PAGE_TYPE_SCHEMA_MAP.get(page_type, ["WebPage"])
        types_present = set(inventory.get("schema_types_present") or [])
        present_count = sum(
            1 for exp in expected
            if types_present.intersection(
                SchemaGapDetector()._type_variants(exp)
            )
        )
        coverage_pct = round(
            (present_count / len(expected) * 100) if expected else 100, 1
        )

        # Top 3 gaps by citation lift
        top_gaps = sorted(
            gaps,
            key=lambda g: g.get("citation_lift_est", 0),
            reverse=True,
        )[:3]

        # Quick win patches (highest lift, lowest effort)
        quick_wins = sorted(
            [p for p in patches if p["validation_status"] == "valid"],
            key=lambda p: float(
                p["estimated_lift"].replace("+", "").replace("%", "") or 0
            ),
            reverse=True,
        )[:3]

        # Priority alert
        critical_gaps = [g for g in gaps if g["severity"] == "Critical"]
        has_alert     = len(critical_gaps) > 0

        return {
            "lcs_score":        lcs,
            "grade":            grade,
            "coverage_pct":     coverage_pct,
            "schema_types_present": list(types_present),
            "top_gaps":         top_gaps,
            "quick_win_patches": quick_wins,
            "ai_file_status":   inventory.get("ai_files", {}),
            "priority_alert":   has_alert,
            "priority_alert_message": (
                f"{len(critical_gaps)} Tier-1 schema type(s) completely absent. "
                f"Immediate action required."
            ) if has_alert else None,
            "model_scores": score_report.get("model_scores", {}),
            "aivs_contribution": score_report.get("aivs_schema_contribution", 0),
        }

    def _build_aivs_feed(
        self,
        score_report: Dict[str, Any],
        gaps: List[Dict[str, Any]],
        inventory: Dict[str, Any],
    ) -> Dict[str, Any]:
        """AIVS™ schema dimension feed — output for SOP-003 integration."""
        return {
            "dimension":             "schema",
            "weight_in_aivs":        0.18,   # 18% per SOP-006
            "lcs_score":             score_report["lcs_score"],
            "grade":                 score_report["grade"],
            "aivs_contribution":     score_report["aivs_schema_contribution"],
            "dimension_scores":      score_report["dimension_scores"],
            "model_scores":          score_report["model_scores"],
            "critical_gap_count":    len([g for g in gaps if g["severity"] == "Critical"]),
            "schema_types_present":  inventory["schema_types_present"],
            "ai_files_present":      inventory.get("ai_files", {}),
        }

    def _group_by(
        self, items: List[Dict[str, Any]], key: str
    ) -> Dict[str, List[Dict[str, Any]]]:
        groups: Dict[str, List[Dict[str, Any]]] = {}
        for item in items:
            k = item.get(key, "unknown")
            groups.setdefault(k, []).append(item)
        return groups


# ===========================================================================
# CONVENIENCE FUNCTION
# ===========================================================================

def analyse_page(
    html: str,
    url: str,
    page_data: Optional[Dict[str, Any]] = None,
    schema_generator=None,
) -> Dict[str, Any]:
    """
    One-call interface for MOAT 6 analysis.

    Args:
        html:             Raw HTML of the page
        url:              Canonical URL
        page_data:        Optional pre-extracted page_data from SchemaGenerator
        schema_generator: Optional SchemaGenerator instance for AI patches

    Returns:
        Complete MOAT 6 intelligence report

    Example:
        from schema_intelligence import analyse_page
        report = analyse_page(html, "https://attrock.com")

        print(report["summary"]["lcs_score"])       # e.g. 42.5
        print(report["summary"]["grade"])           # e.g. "C"
        print(report["gap_report"]["critical_gaps"])
        for patch in report["fix_patches"]:
            print(patch["patch_text"])
    """
    engine = SchemaIntelligenceEngine(schema_generator=schema_generator)
    return engine.analyse(html, url, page_data)
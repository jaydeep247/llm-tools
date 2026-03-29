"""
C1 — AEO Checker

Weighted composite of 5 sub-components (NOT a single AI prompt):
  LLM_Friendliness = (CrawlAccess × 0.15) + (Schema × 0.25) +
                     (Content × 0.35) + (TechHygiene × 0.15) +
                     (Structure × 0.10)

Also computes:
  - Entity Presence Ratio (detected vs expected)
  - Structured Data Completeness
  - Readability Score (composite of Flesch-Kincaid, Gunning Fog, avg sentence)

Depends on C5 output for entity data.
"""

import json
import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import extruct
import textstat
from bs4 import BeautifulSoup

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_c.c1")

# ── AI Bot names to check in robots.txt ──────────────────────────────────────
AI_BOTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]

# ── Expected JSON-LD schema types ────────────────────────────────────────────
EXPECTED_SCHEMA_TYPES = [
    "Organization", "Article", "FAQPage", "HowTo",
    "Product", "BreadcrumbList", "WebPage",
]


# ═════════════════════════════════════════════════════════════════════════════
#  Sub-component 1 — CrawlAccessScore (0-100)
# ═════════════════════════════════════════════════════════════════════════════

def _score_crawl_access(
    html: str,
    robots_txt: str,
    download_latency_s: float = 0.0,
) -> Dict[str, Any]:
    """
    AI Bot Accessibility  → 40 pts
    JS Render Dependency  → 30 pts
    Page Response Speed   → 30 pts
    """
    score = 0
    details: Dict[str, Any] = {}

    # ── AI bot accessibility (40 pts) ─────────────────────────────────────
    bots_allowed = 0
    for bot in AI_BOTS:
        pattern = re.compile(
            rf"User-agent:\s*{re.escape(bot)}\s*\n(?:.*\n)*?Disallow:\s*/",
            re.IGNORECASE,
        )
        if not pattern.search(robots_txt):
            bots_allowed += 1

    if bots_allowed == len(AI_BOTS):
        bot_pts = 40
    elif bots_allowed >= len(AI_BOTS) - 1:
        bot_pts = 30
    else:
        bot_pts = max(8, int(40 * bots_allowed / len(AI_BOTS)))
    score += bot_pts
    details["bots_allowed"] = bots_allowed
    details["bot_pts"] = bot_pts

    # ── JS-rendered detection (30 pts) ────────────────────────────────────
    soup = BeautifulSoup(html, "html.parser")
    body = soup.find("body")
    body_text = body.get_text(separator=" ", strip=True) if body else ""
    has_h1 = bool(soup.find("h1"))
    div_root = soup.find("div", id="root")
    noscript = soup.find("noscript")

    if has_h1 and len(body_text) > 200 and not (div_root and len(body_text) < 300):
        js_pts = 30  # static HTML
    elif len(body_text) > 500:
        js_pts = 20  # mostly static
    else:
        js_pts = 0  # JS-rendered
    score += js_pts
    details["js_rendered"] = js_pts == 0
    details["js_pts"] = js_pts

    # ── Response speed (30 pts) ───────────────────────────────────────────
    if download_latency_s <= 0:
        speed_pts = 15  # unknown — give partial credit
    elif download_latency_s < 1.2:
        speed_pts = 30
    elif download_latency_s < 2.5:
        speed_pts = 15
    else:
        speed_pts = 0
    score += speed_pts
    details["latency_s"] = download_latency_s
    details["speed_pts"] = speed_pts

    details["total"] = score
    return details


# ═════════════════════════════════════════════════════════════════════════════
#  Sub-component 2 — SchemaScore (0-100)
# ═════════════════════════════════════════════════════════════════════════════

def _score_schema(html: str) -> Dict[str, Any]:
    """
    Schema types present:        +14 pts each (max 7 × 14 = 98, capped 100)
    Validation errors:           -20 pts each (floor 0)
    Page-type mismatch penalty:  -25 pts
    """
    details: Dict[str, Any] = {}
    try:
        data = extruct.extract(html, syntaxes=["json-ld"], uniform=True)
    except Exception:
        data = {"json-ld": []}

    schemas = data.get("json-ld", [])
    found_types = []
    for s in schemas:
        t = s.get("@type", "")
        if isinstance(t, list):
            found_types.extend(t)
        else:
            found_types.append(t)

    # type coverage
    matched_types = [t for t in EXPECTED_SCHEMA_TYPES if t in found_types]
    type_pts = min(100, len(matched_types) * 14)

    # validation errors
    error_count = 0
    for schema in schemas:
        try:
            json.dumps(schema)
        except (TypeError, ValueError):
            error_count += 1
        stype = schema.get("@type", "")
        if stype == "Article":
            if not schema.get("headline"):
                error_count += 1
            if not schema.get("author"):
                error_count += 1
        if stype == "FAQPage":
            if not schema.get("mainEntity"):
                error_count += 1

    validation_pts = max(0, 100 - error_count * 20)

    total = int((type_pts * 0.6) + (validation_pts * 0.4))
    total = max(0, min(100, total))

    details.update({
        "found_types": found_types,
        "matched_types": matched_types,
        "missing_types": [t for t in EXPECTED_SCHEMA_TYPES if t not in found_types],
        "error_count": error_count,
        "type_pts": type_pts,
        "validation_pts": validation_pts,
        "total": total,
    })
    return details


# ═════════════════════════════════════════════════════════════════════════════
#  Sub-component 3 — ContentScore (0-100)
# ═════════════════════════════════════════════════════════════════════════════

def _score_content(
    visible_text: str,
    word_count: int,
    entity_density: float,
    html: str,
    page_url: str,
) -> Dict[str, Any]:
    """
    Entity density    → 0-100  (weight 0.30)
    Factual density   → 0-100  (weight 0.30)
    E-E-A-T signals   → 0-100  (weight 0.40)

    word_count MUST be the length of visible_text (not the crawl-spider word count).
    C5 now always sets word_count from its extracted text, so this is guaranteed.
    As a safety net we also re-derive it here from visible_text directly.
    """
    details: Dict[str, Any] = {}

    # Safety: always use visible_text length — never a stale value
    actual_wc = len(visible_text.split()) if visible_text else 0

    # ── Entity density score ──────────────────────────────────────────────
    # >8 ent/500w = 100, 5-8 = 75, 3-5 = 50, <3 = 25
    if entity_density > 8:
        ent_score = 100
    elif entity_density >= 5:
        ent_score = 75
    elif entity_density >= 3:
        ent_score = 50
    else:
        ent_score = 25

    # ── Factual density ───────────────────────────────────────────────────
    # Sentences containing number+unit OR % OR named study reference
    sentences = re.split(r"[.!?]+", visible_text)
    fact_pattern = re.compile(
        r"\d+\s*(%|percent|million|billion|thousand|kg|lb|miles|km|usd|\$|€|£)"
        r"|study|research|survey|according to|report",
        re.IGNORECASE,
    )
    fact_sents = sum(1 for s in sentences if fact_pattern.search(s))
    # Use actual visible-text word count — avoids: 0 / 2388 * 500 = 0
    norm_500 = (fact_sents / max(actual_wc, 1)) * 500
    if norm_500 > 6:
        fact_score = 100
    elif norm_500 >= 4:
        fact_score = 75
    elif norm_500 >= 2:
        fact_score = 50
    else:
        fact_score = 20

    # ── E-E-A-T signals (5 × 20 = 100 max) ───────────────────────────────
    soup = BeautifulSoup(html, "html.parser")
    eeat = 0

    # 1. Author tag
    if soup.find("meta", attrs={"name": re.compile(r"author", re.I)}) or \
       soup.find(class_=re.compile(r"author", re.I)) or \
       soup.find(attrs={"rel": "author"}):
        eeat += 20

    # 2. Publication date
    if soup.find("meta", attrs={"property": "article:published_time"}) or \
       soup.find("time", attrs={"datetime": True}):
        eeat += 20

    # 3. Last updated
    if soup.find("meta", attrs={"property": "article:modified_time"}) or \
       re.search(r"(updated|modified)\s*:?\s*\w+\s+\d{1,2},?\s*\d{4}", html, re.I):
        eeat += 20

    # 4. Organization affiliation
    json_ld = extruct.extract(html, syntaxes=["json-ld"], uniform=True).get("json-ld", [])
    has_org = any(s.get("@type") == "Organization" for s in json_ld)
    if has_org or soup.find(class_=re.compile(r"org|company|affiliation", re.I)):
        eeat += 20

    # 5. External citation links
    page_domain = urlparse(page_url).netloc.replace("www.", "")
    ext_links = [
        a for a in soup.find_all("a", href=True)
        if a["href"].startswith("http") and not _is_same_domain(a["href"], page_domain)
    ]
    if len(ext_links) >= 2:
        eeat += 20

    content_total = int(ent_score * 0.30 + fact_score * 0.30 + eeat * 0.40)
    content_total = max(0, min(100, content_total))

    details.update({
        "entity_density": entity_density,
        "entity_score": ent_score,
        "factual_density_per_500w": round(norm_500, 2),
        "factual_score": fact_score,
        "eeat_score": eeat,
        "total": content_total,
    })
    return details


def _is_same_domain(href: str, page_domain: str) -> bool:
    try:
        return urlparse(href).netloc.replace("www.", "") == page_domain.replace("www.", "")
    except Exception:
        return False


# ═════════════════════════════════════════════════════════════════════════════
#  Sub-component 4 — TechHygieneScore (0-100)
# ═════════════════════════════════════════════════════════════════════════════

def _score_tech_hygiene(html: str, url: str, status_code: int = 200) -> Dict[str, Any]:
    """
    Canonical correct    → 25 pts
    No noindex           → 25 pts
    Internal links ≥ 3   → 25 pts
    HTTP 200             → 25 pts
    """
    soup = BeautifulSoup(html, "html.parser")
    details: Dict[str, Any] = {}
    score = 0
    domain = urlparse(url).netloc.replace("www.", "")

    # canonical
    can_tag = soup.find("link", rel="canonical")
    canonical_ok = False
    if can_tag and can_tag.get("href"):
        can_url = can_tag["href"].rstrip("/")
        canonical_ok = can_url == url.rstrip("/") or domain in can_url
    if canonical_ok:
        score += 25
    details["canonical_ok"] = canonical_ok

    # noindex
    robots_meta = soup.find("meta", attrs={"name": re.compile(r"robots", re.I)})
    has_noindex = robots_meta and "noindex" in (robots_meta.get("content", "").lower())
    if not has_noindex:
        score += 25
    details["has_noindex"] = bool(has_noindex)

    # internal links
    internal_links = []
    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
            continue
        parsed_href = urlparse(href)
        href_domain = parsed_href.netloc.replace("www.", "")
        if not href_domain or href_domain == domain:
            internal_links.append(a)
    il_count = len(internal_links)
    if il_count >= 3:
        score += 25
    elif il_count >= 1:
        score += 12
    details["internal_link_count"] = il_count

    # HTTP status
    if status_code == 200:
        score += 25
    details["status_code"] = status_code

    details["total"] = score
    return details


# ═════════════════════════════════════════════════════════════════════════════
#  Sub-component 5 — StructureScore (0-100)
# ═════════════════════════════════════════════════════════════════════════════

def _score_structure(html: str) -> Dict[str, Any]:
    """
    Detect: TL;DR, comparison table, numbered list, pros/cons, FAQ, stats block.
    5+ = 100, 3-4 = 75, 1-2 = 45, 0 = 15
    """
    soup = BeautifulSoup(html, "html.parser")
    signals: List[str] = []

    # TL;DR block
    if re.search(r"tl;?dr|summary|key\s+takeaway", soup.get_text(), re.I):
        signals.append("tldr")

    # Comparison table
    if soup.find("table"):
        signals.append("comparison_table")

    # Numbered list
    if soup.find("ol"):
        signals.append("numbered_list")

    # Pros/cons block
    if re.search(r"pros?\s*(and|&|/)\s*cons?|advantages?\s*(and|&|/)\s*disadvantages?",
                  soup.get_text(), re.I):
        signals.append("pros_cons")

    # FAQ section (headings with ?)
    headings = soup.find_all(re.compile(r"^h[2-4]$", re.I))
    if any("?" in (h.get_text() or "") for h in headings):
        signals.append("faq")

    # Statistics block (clusters of numbers)
    text = soup.get_text()
    stat_sents = len(re.findall(r"\d+\s*(%|percent|million|billion)", text, re.I))
    if stat_sents >= 3:
        signals.append("statistics_block")

    count = len(signals)
    if count >= 5:
        total = 100
    elif count >= 3:
        total = 75
    elif count >= 1:
        total = 45
    else:
        total = 15

    return {
        "signals_found": signals,
        "signal_count": count,
        "total": total,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Entity Presence Ratio (Field 2)
# ═════════════════════════════════════════════════════════════════════════════

async def _compute_entity_ratio(
    visible_text: str,
    detected_entities: List[Tuple[str, str]],
    page_topic: str,
    industry: str = "",
    page_title: str = "",
    meta_desc: str = "",
    page_type: str = "other",
    page_url: str = "",
) -> Dict[str, Any]:
    """
    Step 1: detected set from C5 spaCy NER.
    Step 2: generate expected entity list via LLM (25 entities per-page-topic).
    Step 3: compute ratio = matched / expected.

    Matching uses a HYBRID approach:
      - For all entity types: check if name appears in spaCy detected set.
      - Additionally: check if the name phrase occurs verbatim in visible_text
        (case-insensitive).  This captures CONCEPT-type entities ("SEO", "ROI",
        "digital marketing") which spaCy does not label as named entities but
        which are clearly "present" on the page when the text mentions them.
    """
    detected_set = {e.lower() for e, _ in detected_entities}
    visible_lower = visible_text.lower()

    prompt_text = (
        "Generate the expected entity set for THIS SPECIFIC PAGE, not for the general industry.\n\n"
        f"Page topic/H1: {page_topic or 'N/A'}\n"
        f"Page title: {page_title or 'N/A'}\n"
        f"Meta description: {meta_desc or 'N/A'}\n"
        f"Page type: {page_type or 'other'}\n"
        f"Page URL: {page_url or 'N/A'}\n"
        f"Industry context: {industry or 'N/A'}\n"
        f"Visible content excerpt: {visible_text[:1500]}\n\n"
        "List exactly 25 entities/terms that authoritative content on this exact page should contain.\n"
        "Rules:\n"
        "- Ground the list in the page signals above.\n"
        "- Prefer entities likely to appear verbatim in the page copy.\n"
        "- Include brand, services, products, organizations, locations, notable concepts, and key statistics/benchmarks only if they are directly relevant to this page.\n"
        "- Do NOT invent broad generic buzzwords unless they are clearly implied by the page signals.\n"
        "- Avoid duplicate or near-duplicate entities.\n"
        'Return JSON: {"expected_entities": [{"name": "...", "type": "PERSON|ORG|PRODUCT|LOCATION|CONCEPT", "importance": "critical|important|supporting"}]}'
    )

    resp = await execute_task(
        task_name="aeo_entity_relevance",
        input_data={
            "messages": [
                {"role": "system", "content": "You are an entity completeness analyst for AI-optimized content."},
                {"role": "user", "content": prompt_text},
            ]
        },
        provider="openai",
        options={"model": "gpt-4o-mini", "temperature": 0.3, "max_tokens": 1500,
                 "response_format": {"type": "json_object"}},
    )

    expected_entities: List[Dict] = []
    if resp.success and resp.data:
        try:
            parsed = json.loads(resp.data) if isinstance(resp.data, str) else resp.data
            expected_entities = parsed.get("expected_entities", [])
        except (json.JSONDecodeError, TypeError):
            logger.warning("[C1] Failed to parse expected entities from LLM")

    expected_set = {e["name"].lower() for e in expected_entities if e.get("name")}

    # Hybrid match: spaCy NER hit OR verbatim phrase in visible_text
    matched: set = set()
    for ent in expected_entities:
        name_lower = (ent.get("name") or "").lower()
        if not name_lower:
            continue
        if name_lower in detected_set:
            matched.add(name_lower)
        elif name_lower in visible_lower:
            # Phrase is present in page text even if spaCy didn't tag it
            matched.add(name_lower)

    missing_set = expected_set - matched
    ratio = len(matched) / len(expected_set) if expected_set else 0.0

    return {
        "entity_ratio": round(ratio, 4),
        "entity_ratio_pct": round(ratio * 100, 1),
        "matched_count": len(matched),
        "expected_count": len(expected_set),
        "detected_count": len(detected_set),
        "expected_entities": expected_entities,
        "matched_entities": list(matched),
        "missing_entities": list(missing_set),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Readability Score (Field 4)
# ═════════════════════════════════════════════════════════════════════════════

def _score_readability(visible_text: str) -> Dict[str, Any]:
    """
    Composite: FK ease (0.40) + Gunning Fog (0.35) + Avg sentence length (0.25).
    LLM-optimal targets: FK 55-70, Fog 8-12, avg_sent 15-20.
    """
    if len(visible_text.split()) < 30:
        return {"fk_ease": 0, "fog_index": 0, "avg_sentence_length": 0,
                "readability_score": 0, "total": 0}

    fk_ease = textstat.flesch_reading_ease(visible_text)
    fog_index = textstat.gunning_fog(visible_text)
    avg_sent = textstat.avg_sentence_length(visible_text)

    fk_score = 100 if 55 <= fk_ease <= 70 else max(0, 100 - abs(fk_ease - 62.5) * 2)
    fog_score = 100 if 8 <= fog_index <= 12 else max(0, 100 - abs(fog_index - 10) * 8)
    sent_score = 100 if 15 <= avg_sent <= 20 else max(0, 100 - abs(avg_sent - 17.5) * 5)

    composite = int(fk_score * 0.40 + fog_score * 0.35 + sent_score * 0.25)
    composite = max(0, min(100, composite))

    return {
        "fk_ease": round(fk_ease, 1),
        "fog_index": round(fog_index, 1),
        "avg_sentence_length": round(avg_sent, 1),
        "fk_score": round(fk_score, 1),
        "fog_score": round(fog_score, 1),
        "sent_score": round(sent_score, 1),
        "readability_score": composite,
        "total": composite,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Detect page type
# ═════════════════════════════════════════════════════════════════════════════

def detect_page_type(url: str, h1: str = "", meta_desc: str = "") -> str:
    url_lower = url.lower()
    if any(x in url_lower for x in ["/blog/", "/article/", "/post/", "/news/"]):
        return "blog"
    if any(x in url_lower for x in ["/product/", "/shop/", "/store/"]):
        return "product"
    if any(x in url_lower for x in ["/service/", "/solutions/"]):
        return "service"
    if any(x in url_lower for x in ["/about", "/team", "/company"]):
        return "about"
    if url_lower.rstrip("/").count("/") <= 3:
        # Only scheme + domain + maybe one path segment
        path = urlparse(url_lower).path.strip("/")
        if not path or path == "":
            return "homepage"
    return "other"


# ═════════════════════════════════════════════════════════════════════════════
#  Main public API
# ═════════════════════════════════════════════════════════════════════════════

async def run_c1(
    html: str,
    url: str,
    c5_output: Dict[str, Any],
    robots_txt: str = "",
    download_latency_s: float = 0.0,
    status_code: int = 200,
    industry: str = "",
    page_meta: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Run full C1 AEO Checker.

    Args:
        html: Raw HTML of the page.
        url: Page URL.
        c5_output: Output dict from run_c5().
        robots_txt: Full robots.txt content.
        download_latency_s: Page response latency in seconds.
        status_code: HTTP status code for the page.
        industry: Industry/niche for entity generation.
        page_meta: Optional crawl metadata dict (from MongoDB pages collection).
                   Used for reliable H1 text when the HTML has inline elements
                   whose spaces get collapsed by naïve text extraction.

    Returns:
        Dict with llm_friendliness_score, sub-scores, entity_ratio, readability, etc.
    """
    visible_text = c5_output["visible_text"]
    word_count = c5_output["word_count"]       # From visible_text (correct)
    entity_density = c5_output["entity_density"]

    # ── Sub-component scores ──────────────────────────────────────────────
    crawl = _score_crawl_access(html, robots_txt, download_latency_s)
    schema = _score_schema(html)
    content = _score_content(visible_text, word_count, entity_density, html, url)
    tech = _score_tech_hygiene(html, url, status_code)
    structure = _score_structure(html)

    llm_friendliness = round(
        crawl["total"] * 0.15
        + schema["total"] * 0.25
        + content["total"] * 0.35
        + tech["total"] * 0.15
        + structure["total"] * 0.10,
        1,
    )

    # ── Page topic derivation ────────────────────────────────────────────
    # Priority: (1) page_meta h1_tags from spider (already clean), 
    #           (2) BS4 extraction with space-preserving separator,
    #           (3) meta description, (4) URL
    h1_text = ""
    meta_desc = ""

    if page_meta:
        h1_list = page_meta.get("h1_tags") or []
        if h1_list:
            h1_text = h1_list[0] if isinstance(h1_list[0], str) else ""
        meta_desc = page_meta.get("meta_description") or ""

    if not h1_text:
        soup = BeautifulSoup(html, "html.parser")
        h1_tag = soup.find("h1")
        if h1_tag:
            # separator=" " preserves spaces between inline child elements
            # (e.g. <h1>The Only<span>Digital</span>Agency</h1>)
            h1_text = re.sub(r"\s+", " ", h1_tag.get_text(separator=" ", strip=True)).strip()
        if not meta_desc:
            meta_tag = soup.find("meta", attrs={"name": "description"})
            meta_desc = (meta_tag.get("content") or "") if meta_tag else ""

    page_title = ""
    if page_meta:
        page_title = page_meta.get("title") or ""
    if not page_title:
        soup = BeautifulSoup(html, "html.parser")
        page_title = soup.title.get_text(strip=True) if soup.title else ""

    page_topic = h1_text or meta_desc or page_title or urlparse(url).netloc
    page_type = detect_page_type(url, h1_text, meta_desc)

    # ── Entity Presence Ratio (async — LLM call) ─────────────────────────
    entity_ratio_data = await _compute_entity_ratio(
        visible_text,
        c5_output["filtered_entities"],
        page_topic,
        industry,
        page_title=page_title,
        meta_desc=meta_desc,
        page_type=page_type,
        page_url=url,
    )

    # ── Structured Data Completeness (Field 3) ───────────────────────────
    structured_data = {
        "type_coverage_pct": round(
            len(schema["matched_types"]) / len(EXPECTED_SCHEMA_TYPES) * 100, 1
        ),
        "validation_score": schema["validation_pts"],
        "completeness_score": schema["total"],
        "missing_types": schema["missing_types"],
        "error_count": schema["error_count"],
    }

    # ── Readability Score (Field 4) ───────────────────────────────────────
    readability = _score_readability(visible_text)

    return {
        "llm_friendliness_score": llm_friendliness,
        "sub_scores": {
            "crawl_access": crawl,
            "schema": schema,
            "content": content,
            "tech_hygiene": tech,
            "structure": structure,
        },
        "entity_ratio": entity_ratio_data,
        "structured_data": structured_data,
        "readability": readability,
        "page_type": page_type,
        "page_topic": page_topic,
        "word_count": word_count,
    }

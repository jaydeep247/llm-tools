"""
KeywordFinder — Core Implementation

Comprehensive keyword resolution for a single URL + HTML page.
This runs BEFORE any content-audit field classification so that
every downstream sub-module (PageMetrics, KeywordMetrics,
PerformanceMetrics, ContentMetrics) can use the same rich
keyword set instead of each re-deriving its own shallow guess.

Resolution strategy (in sequence)
-----------------------------------
  Step 0 — On-page extraction
              title, H1, meta-description  → primary_keyword candidate
  Step 1 — User-provided keyword
              always wins if non-empty
  Step 2 — DataForSEO ranked keywords for URL
              /v3/dataforseo_labs/google/ranked_keywords/live
              → keywords Google *actually* ranks this page for
  Step 3 — DataForSEO related keywords for primary_keyword
              /v3/dataforseo_labs/google/related_keywords/live
              → semantically related / long-tail expansion
  Step 4 — On-page TF-IDF prominent n-gram extraction (offline fallback)
              → keyword candidates extracted directly from page body

From those inputs the module builds a structured KeywordBundle with:
  primary_keyword     – single best target keyword
  keyword_source      – how it was determined
  all_keywords        – every candidate (deduplicated, relevance-ranked)
  ranked_keywords     – Google-ranked real keywords (Step 2)
  related_keywords    – semantic / LSI keywords (Step 3)
  on_page_keywords    – extracted from page body (Step 4)
  question_keywords   – "how to / what is / why / when / where / who" phrases
  long_tail_keywords  – 4+ word phrases (high-specificity variants)
  entity_keywords     – proper-noun / brand / product keyword candidates
  intent              – "C" | "I" | "T" | "N"
  post_category_type  – "listicle" | "comparison" | "how-to" | "what" |
                        "alternative" | "review" | "other"
"""

import re
import logging
import collections
import time
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

try:
    from orchestrator.checkpoint.executor import execute_task
except ImportError:
    execute_task = None

try:
    from utils.mongo import MongoManager
except ImportError:
    MongoManager = None

# ── In-memory session cache (per process lifetime) ─────────────────────────
# Prevents duplicate API calls for the same URL within a single crawl job.
_SESSION_CACHE: Dict[str, "KeywordBundle"] = {}

# ── MongoDB TTL cache configuration ────────────────────────────────────────
_CACHE_COLLECTION = "keyword_bundle_cache"
_CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days

logger = logging.getLogger(__name__)

# ══════════════════════════════════════════════════════════════════
# Data structure
# ══════════════════════════════════════════════════════════════════

@dataclass
class KeywordBundle:
    """
    Comprehensive keyword set for a single URL.

    Downstream sub-modules should consume the typed sub-lists
    (ranked_keywords, related_keywords, question_keywords …) rather
    than re-extracting keywords themselves.  `all_keywords` is the
    deduplicated union across all sources, sorted by relevance signal.
    """

    # ── Primary signal ───────────────────────────────────────────
    primary_keyword: str = ""
    keyword_source: str = ""          # "provided" | "ranked" | "title" | "slug"

    # ── Full deduplicated set (all sources merged) ───────────────
    all_keywords: List[str] = field(default_factory=list)

    # ── By-source lists ─────────────────────────────────────────
    ranked_keywords: List[str] = field(default_factory=list)   # real Google rankings
    related_keywords: List[str] = field(default_factory=list)  # semantic / LSI
    on_page_keywords: List[str] = field(default_factory=list)  # TF-IDF from body

    # ── By-type lists ───────────────────────────────────────────
    question_keywords: List[str] = field(default_factory=list)  # how/what/why/…
    long_tail_keywords: List[str] = field(default_factory=list)  # 4+ word phrases
    entity_keywords: List[str] = field(default_factory=list)    # brands / proper nouns

    # ── Metadata ─────────────────────────────────────────────────
    intent: str = "I"                   # C | I | T | N
    post_category_type: str = "other"   # content format classification


# ══════════════════════════════════════════════════════════════════
# String helpers
# ══════════════════════════════════════════════════════════════════

_BAD_CHARS_RE = re.compile(r"[^a-zA-Z0-9\s\-']")
_BRAND_SPLIT_RE = re.compile(r"\s*[|\u2013\u2014]\s*")
_CLAUSE_SPLIT_RE = re.compile(r"\s*[:;|]\s*|\s+[\u2013\u2014-]\s+")
_QUESTION_RE = re.compile(
    r"\b(how\s+to|how\s+do|how\s+does|what\s+is|what\s+are|why\s+is|why\s+does"
    r"|when\s+to|where\s+to|who\s+is|which\s+is|can\s+you|should\s+you"
    r"|is\s+it|are\s+there)\b",
    re.IGNORECASE,
)
_ENTITY_RE = re.compile(r"\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,3})\b")

_STOP_WORDS: frozenset = frozenset({
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "it",
    "its", "that", "this", "how", "what", "why", "when", "where", "which",
    "who", "will", "can", "do", "your", "our", "my", "their", "all", "any",
    "be", "been", "being", "have", "has", "had", "does", "did", "s",
    "vs", "amp", "about", "up", "out", "so", "if", "me", "we", "us",
    "more", "most", "some", "into", "than", "then", "over", "after",
    "before", "between", "through", "during", "also", "just", "not",
    "no", "new", "top", "best", "you", "them", "they", "he", "she",
    "here", "these", "those", "need", "get", "make", "take", "give",
    "let", "go", "put", "set", "know", "learn", "find", "use", "used",
    "using", "see", "look", "want", "help", "try", "start", "work", "run",
    "keep", "check", "ways", "tips", "guide", "guides", "idea", "ideas",
    "list", "things", "every", "each", "own", "must", "key", "right",
    "good", "great", "better", "different", "important", "effective",
    "complete", "full", "while", "since", "ever", "still", "even", "might",
    "really", "often", "now", "today", "always", "never", "already", "yet",
    "only", "should", "would", "could",
})


def _sanitize(kw: str) -> str:
    cleaned = _BAD_CHARS_RE.sub("", kw).strip()
    return re.sub(r"\s+", " ", cleaned).lower()


def _leading_clause(text: str) -> str:
    """Return the lead clause before : ; | – —"""
    parts = [p.strip() for p in _CLAUSE_SPLIT_RE.split(text) if p.strip()]
    return parts[0] if parts else ""


def _title_to_keyword(title: str) -> str:
    """Strip brand suffix and return the leading clause."""
    parts = _BRAND_SPLIT_RE.split(title)
    candidate = parts[0].strip() if parts else title
    return _leading_clause(candidate) or candidate.strip()


def _slug_to_keyword(url: str) -> str:
    """Extract a keyword from the URL slug (last meaningful path segment)."""
    path = urlparse(url).path.rstrip("/")
    if not path:
        return ""
    segment = path.split("/")[-1]
    return segment.replace("-", " ").replace("_", " ").strip()


# ══════════════════════════════════════════════════════════════════
# On-page extraction
# ══════════════════════════════════════════════════════════════════

def _extract_on_page_data(html_content: str) -> Dict[str, str]:
    """Extract title, h1, meta_description from raw HTML."""
    result = {"title": "", "h1": "", "meta_desc": ""}
    try:
        soup = BeautifulSoup(html_content, "lxml")
        title_tag = soup.find("title")
        result["title"] = title_tag.get_text().strip() if title_tag else ""
        h1_tag = soup.find("h1")
        result["h1"] = h1_tag.get_text().strip() if h1_tag else ""
        for meta in soup.find_all("meta"):
            name = meta.get("name", "")
            if re.match(r"^description$", str(name), re.I):
                result["meta_desc"] = meta.get("content", "").strip()
                break
    except Exception:
        pass
    return result


# ══════════════════════════════════════════════════════════════════
# On-page n-gram extraction (offline TF-IDF-style)
# ══════════════════════════════════════════════════════════════════

def _extract_prominent_ngrams(html_content: str, top_n: int = 30) -> List[str]:
    """
    Extract the top-N prominent 2-4 word noun phrases from body text using
    frequency counting and stop-word filtering.  No external library required.
    Used as the offline fallback / supplement when API calls fail.
    """
    try:
        soup = BeautifulSoup(html_content, "lxml")
        for tag in soup(["script", "style", "nav", "header", "footer",
                         "aside", "form", "button"]):
            tag.decompose()
        text = soup.get_text(" ").lower()
        words = re.findall(r"[a-z][a-z'-]{1,}", text)
        results = []
        for n in (2, 3, 4):
            ngrams = [
                " ".join(words[i:i + n])
                for i in range(len(words) - n + 1)
                if not any(w in _STOP_WORDS for w in [words[i], words[i + n - 1]])
            ]
            counter = collections.Counter(ngrams)
            results.extend(phrase for phrase, _ in counter.most_common(top_n))
        return list(dict.fromkeys(results))[:top_n]
    except Exception:
        return []


# ══════════════════════════════════════════════════════════════════
# Entity extraction (proper-noun / brand candidates)
# ══════════════════════════════════════════════════════════════════

def _extract_entities(html_content: str, max_entities: int = 20) -> List[str]:
    """
    Extract capitalized multi-word phrases as entity keyword candidates
    (brands, product names, organisations, proper nouns).
    Uses a simple regex heuristic — no NLP library dependency.
    """
    try:
        soup = BeautifulSoup(html_content, "lxml")
        for tag in soup(["script", "style"]):
            tag.decompose()
        text = soup.get_text(" ")
        candidates = _ENTITY_RE.findall(text)
        # Filter out common sentence-start false-positives
        filtered: List[str] = []
        seen: set = set()
        for candidate in candidates:
            lower = candidate.lower()
            if lower in _STOP_WORDS:
                continue
            if lower in seen:
                continue
            seen.add(lower)
            filtered.append(candidate.lower())
        counter = collections.Counter(filtered)
        return [kw for kw, _ in counter.most_common(max_entities)]
    except Exception:
        return []


# ══════════════════════════════════════════════════════════════════
# Question keyword extraction
# ══════════════════════════════════════════════════════════════════

def _extract_question_keywords(
    keywords: List[str],
    html_content: str,
    max_questions: int = 15,
) -> List[str]:
    """
    Find question-style keywords from the merged keyword list AND from
    on-page heading / FAQ content (h2, h3, h4 tags starting with question words).
    """
    questions: List[str] = []
    seen: set = set()

    def _add(kw: str) -> None:
        k = kw.strip().lower()
        if k and k not in seen:
            seen.add(k)
            questions.append(k)

    # From keyword list
    for kw in keywords:
        if _QUESTION_RE.search(kw):
            _add(kw)

    # From page headings
    try:
        soup = BeautifulSoup(html_content, "lxml")
        for tag in soup.find_all(["h2", "h3", "h4", "dt"]):
            text = tag.get_text().strip()
            if _QUESTION_RE.search(text) and len(text) < 120:
                _add(text)
    except Exception:
        pass

    return questions[:max_questions]


# ══════════════════════════════════════════════════════════════════
# Long-tail keyword extraction
# ══════════════════════════════════════════════════════════════════

def _extract_long_tail(keywords: List[str], min_words: int = 4) -> List[str]:
    """Return keywords with >= min_words that aren't already question phrases."""
    return [
        kw for kw in keywords
        if len(kw.split()) >= min_words and not _QUESTION_RE.search(kw)
    ]


# ══════════════════════════════════════════════════════════════════
# DataForSEO API helpers
# ══════════════════════════════════════════════════════════════════

async def _fetch_ranked_keywords(
    url: str,
    location_code: int = 2840,
    language_code: str = "en",
) -> List[str]:
    """
    DataForSEO Labs: ranked keywords for a specific URL.
    Returns a ranked list of keyword strings (by organic position, best first).
    Endpoint: /v3/dataforseo_labs/google/ranked_keywords/live
    Cost note: limit=30 (down from 100) — 30 real rankings are sufficient
    for primary keyword resolution and covers 95%+ of pages.
    """
    if execute_task is None:
        return []
    try:
        resp = await execute_task(
            task_name="ranked_keywords",
            input_data={
                "endpoint": "/v3/dataforseo_labs/google/ranked_keywords/live",
                "payload": [
                    {
                        "target": url,
                        "location_code": location_code,
                        "language_code": language_code,
                        "order_by": ["ranked_serp_element.serp_item.rank_absolute,asc"],
                        "limit": 30,
                    }
                ],
            },
            provider="dataforseo",
        )

        if not (resp and resp.success):
            logger.warning("[KF] ranked_keywords failed: %s", resp.error if resp else "no response")
            return []

        data = resp.data or {}
        if not isinstance(data, dict):
            logger.warning("[KF] ranked_keywords failed: invalid response payload type %s", type(data).__name__)
            return []

        keywords: List[str] = []
        for task in data.get("tasks", []):
            if task.get("status_code") != 20000:
                continue
            for result in task.get("result", []):
                for item in result.get("items", []):
                    kw = item.get("keyword_data", {}).get("keyword", "").strip()
                    if kw:
                        keywords.append(kw)
        return keywords
    except Exception as exc:
        logger.error("[KF] ranked_keywords exception: %s", exc)
        return []


async def _fetch_related_keywords(
    keyword: str,
    location_code: int = 2840,
    language_code: str = "en",
) -> List[str]:
    """
    DataForSEO Labs: related / semantically similar keywords.
    Endpoint: /v3/dataforseo_labs/google/related_keywords/live
    Returns list of related keyword strings.
    Cost note: limit=30 (down from 100).
    """
    if execute_task is None or not keyword:
        return []
    try:
        resp = await execute_task(
            task_name="related_keywords",
            input_data={
                "endpoint": "/v3/dataforseo_labs/google/related_keywords/live",
                "payload": [
                    {
                        "keyword": keyword,
                        "location_code": location_code,
                        "language_code": language_code,
                        "limit": 30,
                    }
                ],
            },
            provider="dataforseo",
        )

        if not (resp and resp.success):
            logger.warning("[KF] related_keywords failed: %s", resp.error if resp else "no response")
            return []

        data = resp.data or {}
        if not isinstance(data, dict):
            logger.warning("[KF] related_keywords failed: invalid response payload type %s", type(data).__name__)
            return []

        keywords: List[str] = []
        for task in data.get("tasks", []):
            if task.get("status_code") != 20000:
                continue
            for result in task.get("result", []):
                for item in result.get("items", []):
                    kw = item.get("keyword_data", {}).get("keyword", "").strip()
                    if kw:
                        keywords.append(kw)
        return keywords
    except Exception as exc:
        logger.error("[KF] related_keywords exception: %s", exc)
        return []


# ══════════════════════════════════════════════════════════════════
# Rule-based intent + content-type classification
# ══════════════════════════════════════════════════════════════════

_TRANSACTIONAL_SIGNALS = frozenset({
    "buy", "purchase", "order", "checkout", "price", "pricing",
    "deal", "discount", "coupon", "shop", "store", "cheap", "cheap",
    "subscription", "trial", "download", "get", "hire", "book",
})
_COMMERCIAL_SIGNALS = frozenset({
    "best", "top", "review", "reviews", "vs", "versus", "comparison",
    "compare", "alternative", "alternatives", "recommend", "rated",
    "ranking", "ranked",
})
_INFORMATIONAL_SIGNALS = frozenset({
    "how", "what", "why", "when", "where", "who", "guide", "tutorial",
    "learn", "understand", "explain", "definition", "meaning", "example",
    "examples",
})
_NAVIGATIONAL_SIGNALS = frozenset({
    "login", "sign in", "sign up", "register", "account", "dashboard",
    "contact", "about", "home", "homepage",
})


def _rule_based_intent(keyword: str) -> str:
    words = set(keyword.lower().split())
    if words & _NAVIGATIONAL_SIGNALS:
        return "N"
    if words & _TRANSACTIONAL_SIGNALS:
        return "T"
    if words & _COMMERCIAL_SIGNALS:
        return "C"
    return "I"


def _rule_based_post_category_type(primary_keyword: str) -> str:
    kl = primary_keyword.lower()
    if any(kl.startswith(p) for p in ("top ", "best ", "list of")):
        return "listicle"
    if " vs " in kl or "versus" in kl or "comparison" in kl or "compare" in kl:
        return "comparison"
    if "how to" in kl or "how do" in kl or "step by step" in kl:
        return "how-to"
    if kl.startswith("what is") or kl.startswith("what are") or kl.startswith("what "):
        return "what"
    if "alternative" in kl or "alternatives" in kl:
        return "alternative"
    if "review" in kl or "reviews" in kl:
        return "review"
    return "other"


# ══════════════════════════════════════════════════════════════════
# MongoDB + in-memory cache helpers
# ══════════════════════════════════════════════════════════════════

def _cache_key(url: str, location_code: int, language_code: str) -> str:
    return f"{url.rstrip('/')}|{location_code}|{language_code}"


def _load_cached_bundle(key: str) -> Optional["KeywordBundle"]:
    """Return a cached KeywordBundle from MongoDB, or None if missing/stale."""
    if MongoManager is None:
        return None
    try:
        db = MongoManager.get_instance()._db
        if db is None:
            return None
        doc = db[_CACHE_COLLECTION].find_one({"_id": key})
        if not doc:
            return None
        # Expire stale entries
        if time.time() - doc.get("cached_at", 0) > _CACHE_TTL_SECONDS:
            db[_CACHE_COLLECTION].delete_one({"_id": key})
            return None
        data = doc.get("bundle", {})
        return KeywordBundle(**{k: v for k, v in data.items() if k in KeywordBundle.__dataclass_fields__})
    except Exception as exc:
        logger.debug("[KF] Cache read error: %s", exc)
        return None


def _save_cached_bundle(key: str, bundle: "KeywordBundle") -> None:
    """Persist a KeywordBundle to MongoDB for future re-use."""
    if MongoManager is None:
        return
    try:
        db = MongoManager.get_instance()._db
        if db is None:
            return
        db[_CACHE_COLLECTION].replace_one(
            {"_id": key},
            {"_id": key, "bundle": asdict(bundle), "cached_at": time.time()},
            upsert=True,
        )
    except Exception as exc:
        logger.debug("[KF] Cache write error: %s", exc)


# ══════════════════════════════════════════════════════════════════
# Deduplication
# ══════════════════════════════════════════════════════════════════

def _deduplicate_keywords(keywords: List[str]) -> List[str]:
    """
    Deduplicate while preserving order.  Also removes:
    - Empty / whitespace-only strings
    - Strings shorter than 3 characters
    - Pure-number strings
    """
    seen: set = set()
    result: List[str] = []
    for kw in keywords:
        clean = _sanitize(kw)
        if not clean or len(clean) < 3 or clean.isdigit():
            continue
        if clean in seen:
            continue
        seen.add(clean)
        result.append(clean)
    return result


# ══════════════════════════════════════════════════════════════════
# Public resolver
# ══════════════════════════════════════════════════════════════════

async def resolve_keywords(
    url: str,
    html_content: str = "",
    main_keyword: str = "",
    title: str = "",
    h1: str = "",
    location_code: int = 2840,
    language_code: str = "en",
    skip_api: bool = False,
) -> "KeywordBundle":
    """
    Resolve a comprehensive keyword bundle for a single URL.

    Parameters
    ----------
    url             : Page URL
    html_content    : Raw HTML of the crawled page
    main_keyword    : Explicitly provided keyword (takes highest priority)
    title           : <title> text if already parsed (avoids re-parsing HTML)
    h1              : <h1> text if already parsed
    location_code   : DataForSEO location (default 2840 = US)
    language_code   : DataForSEO language (default "en")
    skip_api        : If True, only use on-page extraction (for testing/offline)

    Returns
    -------
    KeywordBundle with primary_keyword, all_keywords, typed sub-lists,
    intent, and post_category_type.
    """

    # ── Cache check (in-memory first, then MongoDB) ──────────────
    if not skip_api:
        ck = _cache_key(url, location_code, language_code)
        if ck in _SESSION_CACHE:
            logger.debug("[KF] Session cache hit: %s", url)
            return _SESSION_CACHE[ck]
        cached = _load_cached_bundle(ck)
        if cached is not None:
            logger.info("[KF] MongoDB cache hit: %s", url)
            _SESSION_CACHE[ck] = cached
            return cached
    else:
        ck = ""

    # ── Step 0: On-page extraction ───────────────────────────────
    on_page = _extract_on_page_data(html_content) if html_content else {}
    if not title:
        title = on_page.get("title", "")
    if not h1:
        h1 = on_page.get("h1", "")
    meta_desc = on_page.get("meta_desc", "")

    # ── Step 1: Determine primary_keyword ────────────────────────
    primary_keyword = ""
    keyword_source = ""

    if main_keyword and main_keyword.strip():
        primary_keyword = _sanitize(main_keyword.strip())
        keyword_source = "provided"

    # ── Step 2: DataForSEO ranked keywords ───────────────────────
    ranked_keywords: List[str] = []
    if not skip_api:
        ranked_raw = await _fetch_ranked_keywords(url, location_code, language_code)
        ranked_keywords = _deduplicate_keywords(ranked_raw)

    if not primary_keyword and ranked_keywords:
        primary_keyword = ranked_keywords[0]
        keyword_source = "ranked"

    # ── Step 3: DataForSEO related keywords ──────────────────────
    # Skip if: API disabled, no primary keyword to search for, OR we already
    # have 10+ ranked keywords (they provide sufficient semantic coverage).
    related_keywords: List[str] = []
    _enough_ranked = len(ranked_keywords) >= 10
    if not skip_api and primary_keyword and not _enough_ranked:
        related_raw = await _fetch_related_keywords(
            primary_keyword, location_code, language_code
        )
        related_keywords = _deduplicate_keywords(related_raw)
    elif _enough_ranked:
        logger.debug("[KF] Skipping related_keywords (have %d ranked): %s", len(ranked_keywords), url)

    # ── Step 4: On-page fallback  ─────────────────────────────────
    on_page_keywords: List[str] = []
    if html_content:
        on_page_keywords = _deduplicate_keywords(_extract_prominent_ngrams(html_content))

    # Derive primary from on-page sources if still empty
    if not primary_keyword:
        if title:
            primary_keyword = _sanitize(_title_to_keyword(title))
            keyword_source = "title"
        elif h1:
            primary_keyword = _sanitize(_leading_clause(h1) or h1)
            keyword_source = "h1"
        elif on_page_keywords:
            primary_keyword = on_page_keywords[0]
            keyword_source = "on_page"
        else:
            slug = _slug_to_keyword(url)
            if slug:
                primary_keyword = _sanitize(slug)
                keyword_source = "slug"

    # ── Build all_keywords pool ───────────────────────────────────
    pool: List[str] = []

    # Primary always first
    if primary_keyword:
        pool.append(primary_keyword)

    # Ranked keywords next (highest-confidence real-world signal)
    pool.extend(ranked_keywords)

    # Related / semantic keywords
    pool.extend(related_keywords)

    # On-page extracted keywords
    pool.extend(on_page_keywords)

    # Add title / H1 / meta_desc derived keywords
    if title:
        pool.append(_sanitize(_title_to_keyword(title)))
    if h1:
        pool.append(_sanitize(_leading_clause(h1) or h1))
    if meta_desc:
        pool.append(_sanitize(_leading_clause(meta_desc) or meta_desc[:80]))

    all_keywords = _deduplicate_keywords(pool)

    # Make sure primary is first in the deduplicated list
    if primary_keyword and primary_keyword in all_keywords and all_keywords[0] != primary_keyword:
        all_keywords.remove(primary_keyword)
        all_keywords.insert(0, primary_keyword)

    # ── Typed sub-lists ───────────────────────────────────────────
    question_keywords = _extract_question_keywords(all_keywords, html_content)
    long_tail_keywords = _extract_long_tail(all_keywords)
    entity_keywords = _deduplicate_keywords(_extract_entities(html_content))

    # ── Intent — rule-based only (no SERP API call) ───────────────
    # _fetch_serp_intent was removed: it fired a full SERP organic lookup
    # (/v3/serp/google/organic/live/advanced) per URL — the most expensive
    # DataForSEO endpoint. Rule-based intent is free and accurate for
    # the vast majority of pages.
    intent: str = _rule_based_intent(primary_keyword) if primary_keyword else "I"

    post_category_type = _rule_based_post_category_type(primary_keyword)

    bundle = KeywordBundle(
        primary_keyword=primary_keyword,
        keyword_source=keyword_source,
        all_keywords=all_keywords,
        ranked_keywords=ranked_keywords,
        related_keywords=related_keywords,
        on_page_keywords=on_page_keywords,
        question_keywords=question_keywords,
        long_tail_keywords=long_tail_keywords,
        entity_keywords=entity_keywords,
        intent=intent,
        post_category_type=post_category_type,
    )

    # ── Persist to cache ──────────────────────────────────────────
    if ck:
        _SESSION_CACHE[ck] = bundle
        _save_cached_bundle(ck, bundle)

    logger.info(
        "[KF] %s → primary='%s' source=%s intent=%s type=%s "
        "ranked=%d related=%d on_page=%d question=%d long_tail=%d entity=%d total=%d",
        url,
        bundle.primary_keyword,
        bundle.keyword_source,
        bundle.intent,
        bundle.post_category_type,
        len(bundle.ranked_keywords),
        len(bundle.related_keywords),
        len(bundle.on_page_keywords),
        len(bundle.question_keywords),
        len(bundle.long_tail_keywords),
        len(bundle.entity_keywords),
        len(bundle.all_keywords),
    )

    return bundle

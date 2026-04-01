"""
KeywordFinder — On-page keyword extraction for a single URL.

This module runs during crawl time and extracts the primary keyword
from on-page signals ONLY (no external API calls). The resolved
keyword is later sent to DataForSEO by KeywordMetrics (batch step)
to fetch volume, KD, CPC, etc.

Resolution priority (first non-empty wins):
  1. User-provided keyword (always wins)
  2. <title> tag (strip brand suffix after | – —, take leading clause)
  3. <h1> tag (first one)
  4. <meta name="description"> (leading clause)
  5. URL slug (last meaningful path segment)
"""

import re
import logging
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional
from urllib.parse import urlparse

from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════
# Data structure
# ══════════════════════════════════════════════════════════════════

@dataclass
class KeywordBundle:
    """
    Keyword data resolved for a single URL.

    Downstream sub-modules (PageMetrics, KeywordMetrics, ContentMetrics)
    should read `primary_keyword` as the canonical target keyword.
    """

    primary_keyword: str = ""
    keyword_source: str = ""           # "provided" | "title" | "h1" | "meta_desc" | "slug"

    # Metadata (rule-based, derived from primary_keyword)
    intent: str = "I"                  # C | I | T | N
    post_category_type: str = "other"  # listicle | comparison | how-to | what | alternative | review | other


# ══════════════════════════════════════════════════════════════════
# String helpers
# ══════════════════════════════════════════════════════════════════

_BAD_CHARS_RE = re.compile(r"[^a-zA-Z0-9\s\-']")
_BRAND_SPLIT_RE = re.compile(r"\s*[|\u2013\u2014]\s*")
_CLAUSE_SPLIT_RE = re.compile(r"\s*[:;]\s*|\s+[\u2013\u2014-]\s+")


def _sanitize(text: str) -> str:
    """Lowercase, strip non-alpha chars, collapse whitespace."""
    cleaned = _BAD_CHARS_RE.sub("", text).strip()
    return re.sub(r"\s+", " ", cleaned).lower()


def _leading_clause(text: str) -> str:
    """Return the leading clause before : ; – — separators."""
    parts = [p.strip() for p in _CLAUSE_SPLIT_RE.split(text) if p.strip()]
    return parts[0] if parts else ""


_STOP_WORDS = frozenset({
    "that", "which", "who", "whom", "whose", "where", "when",
    "and", "or", "but", "nor", "so", "yet", "for", "with",
    "without", "to", "from", "in", "on", "at", "by", "of",
    "is", "are", "was", "were", "be", "been", "being",
    "can", "could", "will", "would", "shall", "should",
    "may", "might", "must", "do", "does", "did",
    "the", "a", "an", "its", "our", "your", "their",
})


_ARTICLE_WORDS = frozenset({"a", "an", "the"})


def _shorten_keyword(phrase: str, max_words: int = 5) -> str:
    """
    Truncate a long keyword phrase at the first stop word after the core.

    E.g. "fomo review that boosts engagement and conversion" → "fomo review".
    Articles (a, an, the) never trigger a cut since they bind to the next noun.
    """
    words = phrase.split()
    # Always scan for a natural cut point (stop word after a content word).
    for i in range(2, len(words)):
        w = words[i].lower()
        prev = words[i - 1].lower()
        if w in _STOP_WORDS and w not in _ARTICLE_WORDS and prev not in _STOP_WORDS:
            shortened = " ".join(words[:i])
            if len(shortened.split()) >= 2:
                return shortened
    # No suitable cut point — hard-truncate at max_words
    return " ".join(words[:max_words])


def _keyword_from_title(title: str) -> str:
    """Strip brand suffix (after |, –, —), take leading clause, shorten."""
    if not title or not title.strip():
        return ""
    parts = _BRAND_SPLIT_RE.split(title, maxsplit=1)
    candidate = parts[0].strip()
    clause = _leading_clause(candidate)
    result = clause if clause and len(clause.split()) >= 2 else candidate
    result = result.strip()
    if len(result) < 3:
        return ""
    return _shorten_keyword(result)


def _keyword_from_slug(url: str) -> str:
    """Extract a keyword from the last meaningful URL path segment."""
    path = urlparse(url).path.rstrip("/")
    if not path:
        return ""
    segment = path.split("/")[-1]
    keyword = segment.replace("-", " ").replace("_", " ").strip()
    # Reject very short or file-extension-like slugs
    if len(keyword) < 3 or "." in segment:
        return ""
    return keyword


# ══════════════════════════════════════════════════════════════════
# HTML extraction
# ══════════════════════════════════════════════════════════════════

def _extract_on_page(html_content: str) -> Dict[str, str]:
    """Extract title, h1, and meta description from raw HTML."""
    result = {"title": "", "h1": "", "meta_desc": ""}
    if not html_content:
        return result
    try:
        soup = BeautifulSoup(html_content, "lxml")

        title_tag = soup.find("title")
        if title_tag:
            result["title"] = title_tag.get_text(strip=True)

        h1_tag = soup.find("h1")
        if h1_tag:
            result["h1"] = h1_tag.get_text(strip=True)

        for meta in soup.find_all("meta"):
            name = meta.get("name", "")
            if isinstance(name, str) and name.lower() == "description":
                result["meta_desc"] = (meta.get("content") or "").strip()
                break
    except Exception:
        pass
    return result


# ══════════════════════════════════════════════════════════════════
# Intent + content-type classification (rule-based)
# ══════════════════════════════════════════════════════════════════

_TRANSACTIONAL_SIGNALS = frozenset({
    "buy", "purchase", "order", "checkout", "price", "pricing",
    "deal", "discount", "coupon", "shop", "store", "cheap",
    "subscription", "trial", "download", "hire", "book",
})
_COMMERCIAL_SIGNALS = frozenset({
    "best", "top", "review", "reviews", "vs", "versus", "comparison",
    "compare", "alternative", "alternatives", "recommend", "rated",
})
_INFORMATIONAL_SIGNALS = frozenset({
    "how", "what", "why", "when", "where", "who", "guide", "tutorial",
    "learn", "understand", "explain", "definition", "meaning", "example",
})
_NAVIGATIONAL_SIGNALS = frozenset({
    "login", "sign in", "sign up", "register", "account", "dashboard",
    "contact", "about", "home", "homepage",
    "policy", "policies", "terms", "privacy", "refund",
    "sitemap", "faq", "legal", "disclaimer",
})


def _classify_intent(keyword: str) -> str:
    words = set(keyword.lower().split())
    if words & _NAVIGATIONAL_SIGNALS:
        return "N"
    if words & _TRANSACTIONAL_SIGNALS:
        return "T"
    if words & _COMMERCIAL_SIGNALS:
        return "C"
    return "I"


def _classify_post_type(keyword: str) -> str:
    kl = keyword.lower()
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
    if any(w in kl for w in ("policy", "policies", "terms", "privacy", "refund", "legal", "disclaimer", "faq", "warranty")):
        return "policy"
    return "other"


# ══════════════════════════════════════════════════════════════════
# Public resolver
# ══════════════════════════════════════════════════════════════════

async def resolve_keywords(
    url: str,
    html_content: str = "",
    main_keyword: str = "",
    title: str = "",
    h1: str = "",
    **kwargs,
) -> KeywordBundle:
    """
    Resolve the primary keyword for a URL using on-page signals only.

    No external API calls are made. This is designed to run during crawl
    time. The resolved keyword is later used by KeywordMetrics (batch)
    to query DataForSEO for volume / KD / CPC.

    Parameters
    ----------
    url           : Page URL.
    html_content  : Raw HTML of the crawled page.
    main_keyword  : User-provided keyword (highest priority).
    title         : Pre-parsed <title> text (avoids re-parsing HTML).
    h1            : Pre-parsed <h1> text (avoids re-parsing HTML).

    Returns
    -------
    KeywordBundle with primary_keyword, keyword_source, intent, post_category_type.
    """

    # Extract on-page signals if HTML is available
    on_page = _extract_on_page(html_content) if html_content else {}
    if not title:
        title = on_page.get("title", "")
    if not h1:
        h1 = on_page.get("h1", "")
    meta_desc = on_page.get("meta_desc", "")

    primary_keyword = ""
    keyword_source = ""

    # Priority 1: User-provided keyword
    if main_keyword and main_keyword.strip():
        primary_keyword = _sanitize(main_keyword.strip())
        keyword_source = "provided"

    # Priority 2: <title> tag
    if not primary_keyword and title:
        candidate = _keyword_from_title(title)
        if candidate:
            primary_keyword = _sanitize(candidate)
            keyword_source = "title"

    # Priority 3: <h1> tag
    if not primary_keyword and h1 and len(h1.strip()) >= 3:
        primary_keyword = _sanitize(_shorten_keyword(h1.strip()))
        keyword_source = "h1"

    # Priority 4: <meta description>
    if not primary_keyword and meta_desc:
        clause = _leading_clause(meta_desc)
        candidate = clause if clause and len(clause.split()) >= 2 else meta_desc[:80]
        if candidate and len(candidate.strip()) >= 3:
            primary_keyword = _sanitize(_shorten_keyword(candidate.strip()))
            keyword_source = "meta_desc"

    # Priority 5: URL slug
    if not primary_keyword:
        slug_kw = _keyword_from_slug(url)
        if slug_kw:
            primary_keyword = _sanitize(slug_kw)
            keyword_source = "slug"

    # Classify intent and post type
    intent = _classify_intent(primary_keyword) if primary_keyword else "I"
    post_type = _classify_post_type(primary_keyword) if primary_keyword else "other"

    bundle = KeywordBundle(
        primary_keyword=primary_keyword,
        keyword_source=keyword_source,
        intent=intent,
        post_category_type=post_type,
    )

    logger.info(
        "[KF] %s -> keyword='%s' source=%s intent=%s type=%s",
        url, bundle.primary_keyword, bundle.keyword_source,
        bundle.intent, bundle.post_category_type,
    )

    return bundle

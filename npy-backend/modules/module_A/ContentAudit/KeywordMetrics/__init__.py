"""
Keyword Metrics Sub-module — Batch keyword metrics extraction via DataForSEO.

Fields produced: volume_global, volume_us, kd_us, cpc_usd

Two public functions:
  extract_keyword_metrics()        – per-URL: resolves main_keyword from on-page signals
  extract_keyword_metrics_batch()  – post-crawl batch: sends keywords to DataForSEO

Workflow (per-URL, during crawl):
  Resolves the primary keyword using the same priority chain as KeywordFinder:
    1. Use provided main_keyword if non-empty.
    2. Extract from <title> (strip brand suffix after | – —).
    3. Fall back to first <h1>.
  Returns {main_keyword, keyword_source}. Volume/KD/CPC are filled in batch.

Workflow (batch, post-crawl):
  1. Collect all unique keywords that need metric fetching.
  2. Generate candidate phrasings per keyword (full, truncated, content-core)
     so that even title-derived long-tail phrases resolve to a shorter,
     DataForSEO-indexed variant.
  3. Keywords Data API (2 calls: global + US) -> volume_global, volume_us, cpc_usd.
  4. KD Labs API (1 call) -> kd_us.
  5. Map results back to each item. Never overwrite existing values.
"""

import logging
import re
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup

try:
    from orchestrator.checkpoint.executor import execute_task
except ImportError:
    execute_task = None

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Constants — keyword candidate generation
# ═══════════════════════════════════════════════════════════════════════════════

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
    "using", "see", "look", "want", "help", "try", "start", "work",
    "run", "keep", "check", "ways", "tips", "guide", "guides", "idea",
    "ideas", "list", "things", "every", "each", "own", "must", "key",
    "right", "good", "great", "better", "different", "important",
    "effective", "complete", "full", "while", "since", "ever", "still",
    "even", "might", "really", "often", "now", "today", "always",
    "never", "already", "yet", "only", "should", "would", "could",
})

_BAD_CHARS_RE = re.compile(r"[^a-zA-Z0-9\s\-']")
_CLAUSE_SPLIT_RE = re.compile(r"\s*[:;|]\s*|\s+[\u2013\u2014-]\s+")
_BRAND_SPLIT_RE = re.compile(r"\s*[|\u2013\u2014]\s*")


def _sanitize_keyword(kw: str) -> str:
    """Strip characters rejected by DataForSEO APIs and collapse whitespace."""
    cleaned = _BAD_CHARS_RE.sub("", kw).strip()
    return re.sub(r"\s+", " ", cleaned)


def _extract_keyword_clause(kw: str) -> str:
    """Reduce article-style titles to a search-oriented leading clause."""
    normalized = re.sub(r"\s+", " ", (kw or "").strip())
    if not normalized:
        return ""
    parts = [p.strip() for p in _CLAUSE_SPLIT_RE.split(normalized) if p.strip()]
    if not parts:
        return normalized
    lead = parts[0]
    return lead if len(lead.split()) >= 2 else normalized


def _keyword_candidates(
    kw: str,
    max_words: int = 10,
    trunc_words: int = 5,
    core_words: int = 3,
) -> List[str]:
    """
    Generate an ordered list of candidate API keyword strings.

    Candidates (tried in priority order for API result mapping):
      1. Leading clause (if different from full).
      2. Full keyword (up to max_words).
      3. Truncated to trunc_words (if longer).
      4. Content-core words (stop-words removed, up to core_words).
    """
    words = kw.split()
    candidates: List[str] = []
    seen: set = set()

    def _add(phrase: str) -> None:
        phrase = _sanitize_keyword(phrase)
        if phrase and phrase not in seen:
            seen.add(phrase)
            candidates.append(phrase)

    clause = _extract_keyword_clause(kw)
    if clause and clause != kw:
        _add(clause)

    _add(" ".join(words[:max_words]))

    if len(words) > trunc_words:
        _add(" ".join(words[:trunc_words]))

    content = [
        w for w in words
        if w.lower() not in _STOP_WORDS
        and not w.isdigit()
        and any(c.isalnum() for c in w)
    ]
    if len(content) >= 2:
        _add(" ".join(content[:core_words]))

    return candidates


# ═══════════════════════════════════════════════════════════════════════════════
# Per-URL keyword resolution (title / H1 fallback)
# ═══════════════════════════════════════════════════════════════════════════════

def _keyword_from_title(title: str) -> str:
    """Strip brand suffix and return cleaned leading clause."""
    if not title:
        return ""
    parts = _BRAND_SPLIT_RE.split(title, maxsplit=1)
    candidate = _extract_keyword_clause(parts[0].strip())
    return candidate if len(candidate) >= 3 else ""


def _extract_title_from_html(html_content: str) -> str:
    if not html_content:
        return ""
    try:
        soup = BeautifulSoup(html_content, "lxml")
        tag = soup.find("title")
        return tag.get_text(strip=True) if tag else ""
    except Exception:
        return ""


def _extract_h1_from_html(html_content: str) -> str:
    if not html_content:
        return ""
    try:
        soup = BeautifulSoup(html_content, "lxml")
        tag = soup.find("h1")
        return tag.get_text(strip=True) if tag else ""
    except Exception:
        return ""


async def extract_keyword_metrics(
    url: str = "",
    html_content: str = "",
    main_keyword: str = "",
    title: str = "",
    h1: str = "",
    existing_item: Optional[Dict[str, Any]] = None,
    **kwargs,
) -> Dict[str, Any]:
    """
    Resolve the main keyword for a single page.
    Volume / KD / CPC are filled later by the batch step.
    """
    resolved = ""
    source = ""

    if main_keyword and main_keyword.strip():
        resolved = main_keyword.strip()
        source = "provided"

    if not resolved:
        raw_title = title or _extract_title_from_html(html_content)
        candidate = _keyword_from_title(raw_title)
        if candidate:
            resolved = candidate
            source = "title"

    if not resolved:
        raw_h1 = h1 or _extract_h1_from_html(html_content)
        if raw_h1 and len(raw_h1.strip()) >= 3:
            resolved = raw_h1.strip()
            source = "h1"

    return {"main_keyword": resolved, "keyword_source": source}


# ═══════════════════════════════════════════════════════════════════════════════
# Value check helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _has_value(val: Any) -> bool:
    """True when val is populated (not None, not empty string). Zero IS valid."""
    return val is not None and val != ""


def _all_fields_present(item: Dict[str, Any]) -> bool:
    return (
        _has_value(item.get("volume_global"))
        and _has_value(item.get("volume_us"))
        and _has_value(item.get("cpc_usd"))
        and _has_value(item.get("kd_us"))
    )


# ═══════════════════════════════════════════════════════════════════════════════
# DataForSEO: Keywords Data API (volume_global + volume_us + cpc_usd)
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_search_volume(keywords: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Two Keywords Data API calls:
      1. No location_code          -> volume_global (worldwide).
      2. location_code=2840 (US)   -> volume_us + cpc_usd.

    Multi-candidate strategy: for each keyword, up to 3-4 phrase variants are
    sent so that title-derived long-tail keywords resolve to a shorter,
    DataForSEO-indexed variant.

    Returns {keyword_lower: {volume_global, volume_us, cpc_usd}}.
    """
    if not execute_task or not keywords:
        return {}

    cache: Dict[str, Dict[str, Any]] = {}

    # Build candidate keywords and reverse mapping
    kw_to_candidates: Dict[str, List[str]] = {}
    api_kw_to_originals: Dict[str, List[str]] = {}

    for kw in keywords:
        sanitized = _sanitize_keyword(kw)
        if not sanitized:
            continue
        candidates = _keyword_candidates(sanitized)
        kw_to_candidates[kw] = candidates
        for c in candidates:
            api_kw_to_originals.setdefault(c, []).append(kw)

    api_keywords = list(api_kw_to_originals.keys())
    if not api_keywords:
        return {}

    logger.debug(
        "[KM] Volume batch: %d original keywords -> %d API candidates",
        len(keywords), len(api_keywords),
    )

    try:
        # Call 1: Global volume (no location)
        global_vol: Dict[str, int] = {}
        resp_global = await execute_task(
            task_name="keywords_search_volume",
            input_data={
                "endpoint": "/keywords_data/google_ads/search_volume/live",
                "payload": [{"keywords": api_keywords, "language_code": "en"}],
            },
            provider="dataforseo",
        )
        if resp_global and resp_global.success:
            t0 = ((resp_global.data or {}).get("tasks") or [{}])[0]
            if t0.get("status_code") == 20000:
                for entry in (t0.get("result") or []):
                    api_kw = (entry.get("keyword") or "").strip().lower()
                    sv = entry.get("search_volume")
                    if api_kw and sv is not None:
                        global_vol[api_kw] = sv
            else:
                logger.warning(
                    "[KM] Global volume status %s: %s",
                    t0.get("status_code"), t0.get("status_message"),
                )
        else:
            logger.warning(
                "[KM] Global volume call failed: %s",
                resp_global.error if resp_global else "no response",
            )

        # Call 2: US volume + CPC (location_code=2840)
        us_vol: Dict[str, Dict[str, Any]] = {}
        resp_us = await execute_task(
            task_name="keywords_search_volume",
            input_data={
                "endpoint": "/keywords_data/google_ads/search_volume/live",
                "payload": [
                    {
                        "keywords": api_keywords,
                        "location_code": 2840,
                        "language_code": "en",
                    }
                ],
            },
            provider="dataforseo",
        )
        if resp_us and resp_us.success:
            t1 = ((resp_us.data or {}).get("tasks") or [{}])[0]
            if t1.get("status_code") == 20000:
                for entry in (t1.get("result") or []):
                    api_kw = (entry.get("keyword") or "").strip().lower()
                    if api_kw:
                        us_vol[api_kw] = {
                            "volume_us": entry.get("search_volume"),
                            "cpc_usd": entry.get("cpc"),
                        }
            else:
                logger.warning(
                    "[KM] US volume status %s: %s",
                    t1.get("status_code"), t1.get("status_message"),
                )
        else:
            logger.warning(
                "[KM] US volume call failed: %s",
                resp_us.error if resp_us else "no response",
            )

        # Map results back to original keywords
        for kw, candidates in kw_to_candidates.items():
            vol_global = None
            vol_us = None
            cpc_usd = None
            for api_kw in candidates:
                if vol_global is None and api_kw in global_vol:
                    vol_global = global_vol[api_kw]
                if vol_us is None and api_kw in us_vol:
                    us_data = us_vol[api_kw]
                    vol_us = us_data["volume_us"]
                    cpc_usd = us_data["cpc_usd"]
                if vol_global is not None and vol_us is not None:
                    break

            if vol_global is not None or vol_us is not None:
                cache[kw] = {
                    "volume_global": vol_global,
                    "volume_us": vol_us,
                    "cpc_usd": cpc_usd,
                }

    except Exception as exc:
        logger.error("[KM] Keywords Data API exception: %s", exc, exc_info=True)

    return cache


# ═══════════════════════════════════════════════════════════════════════════════
# DataForSEO Labs: Bulk Keyword Difficulty (kd_us)
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_keyword_difficulty_batch(keywords: List[str]) -> Dict[str, int]:
    """
    Single DataForSEO Labs call for all keywords.
    Returns {keyword_lower: kd_value}.
    Same multi-candidate strategy as _fetch_search_volume.
    """
    if not execute_task or not keywords:
        return {}

    cache: Dict[str, int] = {}

    kw_to_candidates: Dict[str, List[str]] = {}
    api_kw_to_originals: Dict[str, List[str]] = {}

    for kw in keywords:
        sanitized = _sanitize_keyword(kw)
        if not sanitized:
            continue
        candidates = _keyword_candidates(sanitized)
        kw_to_candidates[kw] = candidates
        for c in candidates:
            api_kw_to_originals.setdefault(c, []).append(kw)

    api_keywords = list(api_kw_to_originals.keys())
    if not api_keywords:
        return {}

    logger.debug(
        "[KM] KD batch: %d original keywords -> %d API candidates",
        len(keywords), len(api_keywords),
    )

    try:
        resp = await execute_task(
            task_name="keyword_difficulty",
            input_data={
                "endpoint": "/dataforseo_labs/google/bulk_keyword_difficulty/live",
                "payload": [
                    {
                        "keywords": api_keywords,
                        "location_code": 2840,
                        "language_code": "en",
                    }
                ],
            },
            provider="dataforseo",
        )

        if not (resp and resp.success):
            logger.warning(
                "[KM] KD API failed: %s",
                resp.error if resp else "no response",
            )
            return cache

        tasks_data = (resp.data or {}).get("tasks", [])
        if not tasks_data:
            return cache

        task0 = tasks_data[0]
        if task0.get("status_code") != 20000:
            logger.warning(
                "[KM] KD API status %s: %s",
                task0.get("status_code"), task0.get("status_message"),
            )
            return cache

        result_list = task0.get("result") or []
        if not result_list:
            return cache

        items = result_list[0].get("items") or []

        api_kd_results: Dict[str, int] = {}
        for entry in items:
            api_kw = (entry.get("keyword") or "").strip().lower()
            kd = entry.get("keyword_difficulty")
            if api_kw and kd is not None:
                api_kd_results[api_kw] = kd

        for kw, candidates in kw_to_candidates.items():
            for api_kw in candidates:
                if api_kw in api_kd_results:
                    cache[kw] = api_kd_results[api_kw]
                    break

    except Exception as exc:
        logger.error("[KM] KD API exception: %s", exc, exc_info=True)

    return cache


# ═══════════════════════════════════════════════════════════════════════════════
# Public batch API
# ═══════════════════════════════════════════════════════════════════════════════

async def extract_keyword_metrics_batch(
    items: List[Dict[str, Any]],
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Batch extraction of keyword metrics for all items in a job.

    Each item must have: url, main_keyword.
    May already have: volume_global, volume_us, kd_us, cpc_usd, status_code.

    Sends unique keywords to DataForSEO (volume + KD), maps results back,
    and returns a result dict per item with all 4 metric fields populated.
    """
    if not items:
        return []

    # Collect unique keywords needing API fetches
    keywords_needing_volume: set[str] = set()
    keywords_needing_kd: set[str] = set()
    skipped_no_keyword = 0

    for item in items:
        kw = (item.get("main_keyword") or "").strip()
        if not kw:
            skipped_no_keyword += 1
            continue

        kw_lower = kw.lower()

        if (
            not _has_value(item.get("volume_global"))
            or not _has_value(item.get("volume_us"))
            or not _has_value(item.get("cpc_usd"))
        ):
            keywords_needing_volume.add(kw_lower)

        if not _has_value(item.get("kd_us")):
            keywords_needing_kd.add(kw_lower)

    logger.info(
        "[KM] Batch: %d items | volume fetch: %d keywords | KD fetch: %d keywords | no keyword: %d",
        len(items), len(keywords_needing_volume), len(keywords_needing_kd), skipped_no_keyword,
    )

    # Fetch from DataForSEO
    keyword_cache: Dict[str, Dict[str, Any]] = {}
    if keywords_needing_volume:
        keyword_cache = await _fetch_search_volume(list(keywords_needing_volume))

    kd_cache: Dict[str, int] = {}
    if keywords_needing_kd:
        kd_cache = await _fetch_keyword_difficulty_batch(list(keywords_needing_kd))

    # Map results back to items
    fields_found = 0
    fields_fetched = 0
    fields_still_null = 0
    results: List[Dict[str, Any]] = []

    for item in items:
        url = item.get("url", "")
        kw_raw = (item.get("main_keyword") or "").strip()
        kw_lower = kw_raw.lower()
        audit_log: Dict[str, str] = {}

        if not kw_raw:
            results.append({
                "url": url,
                "main_keyword": None,
                "status_code": item.get("status_code"),
                "volume_global": None,
                "volume_us": None,
                "kd_us": None,
                "cpc_usd": None,
                "audit_log": {
                    k: "SKIPPED-NO-KEYWORD"
                    for k in ("volume_global", "volume_us", "kd_us", "cpc_usd")
                },
            })
            continue

        vol_data = keyword_cache.get(kw_lower, {})

        # volume_global
        if _has_value(item.get("volume_global")):
            volume_global = item["volume_global"]
            audit_log["volume_global"] = "FOUND"
            fields_found += 1
        elif "volume_global" in vol_data and vol_data["volume_global"] is not None:
            volume_global = vol_data["volume_global"]
            audit_log["volume_global"] = "FETCHED"
            fields_fetched += 1
        else:
            volume_global = None
            audit_log["volume_global"] = "NULL"
            fields_still_null += 1

        # volume_us
        if _has_value(item.get("volume_us")):
            volume_us = item["volume_us"]
            audit_log["volume_us"] = "FOUND"
            fields_found += 1
        elif "volume_us" in vol_data and vol_data["volume_us"] is not None:
            volume_us = vol_data["volume_us"]
            audit_log["volume_us"] = "FETCHED"
            fields_fetched += 1
        else:
            volume_us = None
            audit_log["volume_us"] = "NULL"
            fields_still_null += 1

        # cpc_usd
        if _has_value(item.get("cpc_usd")):
            cpc_usd = item["cpc_usd"]
            audit_log["cpc_usd"] = "FOUND"
            fields_found += 1
        elif "cpc_usd" in vol_data and vol_data["cpc_usd"] is not None:
            cpc_usd = vol_data["cpc_usd"]
            audit_log["cpc_usd"] = "FETCHED"
            fields_fetched += 1
        else:
            cpc_usd = None
            audit_log["cpc_usd"] = "NULL"
            fields_still_null += 1

        # kd_us
        if _has_value(item.get("kd_us")):
            kd_us = item["kd_us"]
            audit_log["kd_us"] = "FOUND"
            fields_found += 1
        elif kw_lower in kd_cache:
            kd_us = kd_cache[kw_lower]
            audit_log["kd_us"] = "FETCHED"
            fields_fetched += 1
        else:
            kd_us = None
            audit_log["kd_us"] = "NULL"
            fields_still_null += 1

        results.append({
            "url": url,
            "main_keyword": kw_raw,
            "status_code": item.get("status_code"),
            "volume_global": volume_global,
            "volume_us": volume_us,
            "kd_us": kd_us,
            "cpc_usd": cpc_usd,
            "audit_log": audit_log,
        })

    # Summary
    total_fields = len(results) * 4
    fill_rate = round(fields_fetched / max(total_fields, 1) * 100, 1)
    logger.info(
        "[KM] Batch complete: found=%d fetched=%d (%.1f%%) null=%d",
        fields_found, fields_fetched, fill_rate, fields_still_null,
    )

    return results

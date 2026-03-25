"""
Keyword Metrics Sub-module  —  Per-page keyword resolution + Batch field extraction

Fields: Volume (Global), Volume (US), KDs (US), CPC ($)

Two public functions:
  extract_keyword_metrics()        – per-URL: resolves main_keyword from title/H1
  extract_keyword_metrics_batch()  – call once per job after crawl with all items

Workflow (per-URL, during crawl):
  1. Use provided main_keyword if non-empty.
  2. Else extract from <title> (strip brand suffix after | – —).
  3. Else fall back to first <h1>.

Workflow (batch, post-crawl):
  1. Pre-flight: skip items with no main_keyword; skip fields already populated.
  2. Collect & deduplicate keywords across the entire batch.
  3. Single Keywords Data API call → volume_global, volume_us, cpc_usd.
     For each keyword, up to 3 candidate phrasings are sent (full, 5-word truncated,
     stop-word-stripped core) so that even title-derived long-tail phrases resolve
     to a shorter, searchable variant.  Only one extra-wide batch call is made.
  4. Single KD Labs API call → kd_us (same multi-candidate strategy).
  5. Write cached results back to each item; never overwrite existing values.
"""
import asyncio
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

# English stop-words that carry no SEO signal on their own
_STOP_WORDS: frozenset = frozenset({
    # Articles / conjunctions / prepositions
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "it",
    "its", "that", "this", "how", "what", "why", "when", "where", "which",
    "who", "will", "can", "do", "your", "our", "my", "their", "all", "any",
    "be", "been", "being", "have", "has", "had", "does", "did", "s",
    "vs", "amp", "about", "up", "out", "so", "if", "me", "we", "us",
    "more", "most", "some", "into", "than", "then", "over", "after",
    "before", "between", "through", "during", "also", "just", "not",
    "no", "new", "top", "best",
    # Common blog-title filler words (don't appear in search queries)
    "you", "them", "they", "he", "she", "here", "these", "those",
    "need", "get", "make", "take", "give", "let", "go", "put", "set",
    "know", "learn", "find", "use", "used", "using", "see", "look",
    "want", "help", "try", "start", "work", "run", "keep", "check",
    "ways", "tips", "guide", "guides", "idea", "ideas", "list", "things",
    "every", "each", "own", "must", "key", "right", "good", "great",
    "better", "different", "important", "effective", "complete", "full",
    "while", "since", "ever", "still", "even", "might", "really", "often",
    "now", "today", "always", "never", "already", "yet", "only",
    "should", "would", "could", "adopt", "boost", "grow", "leading",
    "popular", "ultimate", "essential", "powerful", "proven",
})

_BAD_CHARS_RE = re.compile(r"[^a-zA-Z0-9\s\-']")


def _sanitize_keyword(kw: str) -> str:
    """Strip characters rejected by the DataForSEO APIs and collapse whitespace."""
    cleaned = _BAD_CHARS_RE.sub("", kw).strip()
    return re.sub(r"\s+", " ", cleaned)


def _keyword_candidates(kw: str, max_words: int = 10, trunc_words: int = 5, core_words: int = 3) -> List[str]:
    """
    Return an ordered, deduplicated list of candidate API keyword strings for
    a single input keyword.  Candidates are tried in priority order when mapping
    API results back to originals:

      1. Full keyword (up to *max_words* words).
      2. First *trunc_words* words (only when longer than trunc_words).
      3. Core content words (stop-words, pure-punctuation tokens and leading
         digits removed), at most *core_words* words.  Only added when the
         resulting phrase is ≥ 2 words and distinct from the above.

    Keeping the content-core short (3 words by default) maximises the chance
    that the phrase is indexed by Google Ads / DataForSEO Labs, which are
    sparse for long-tail blog-title phrases.
    """
    words = kw.split()
    candidates: List[str] = []
    seen: set = set()

    def _add(phrase: str) -> None:
        phrase = phrase.strip()
        if phrase and phrase not in seen:
            seen.add(phrase)
            candidates.append(phrase)

    # 1. Full phrase (hard capped at max_words)
    _add(" ".join(words[:max_words]))

    # 2. trunc_words truncation (only distinct from full)
    if len(words) > trunc_words:
        _add(" ".join(words[:trunc_words]))

    # 3. Content-word core: strip stop-words, pure-punctuation tokens and digits
    content = [
        w for w in words
        if w.lower() not in _STOP_WORDS
        and not w.isdigit()
        and any(c.isalnum() for c in w)  # skip bare hyphens / dashes
    ]
    if len(content) >= 2:
        _add(" ".join(content[:core_words]))

    return candidates


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers — keyword resolution from title / H1
# ═══════════════════════════════════════════════════════════════════════════════

_BRAND_SPLIT_RE = re.compile(r"\s*[|\u2013\u2014]\s*")


def _keyword_from_title(title: str) -> str:
    """Strip brand suffix (text after |, –, —) and return cleaned phrase."""
    if not title:
        return ""
    parts = _BRAND_SPLIT_RE.split(title, maxsplit=1)
    candidate = parts[0].strip()
    # Reject very short results (likely just a brand name)
    if len(candidate) < 3:
        return ""
    return candidate


def _extract_title_from_html(html_content: str) -> str:
    """Parse <title> from raw HTML."""
    if not html_content:
        return ""
    try:
        soup = BeautifulSoup(html_content, "lxml")
        tag = soup.find("title")
        return tag.get_text(strip=True) if tag else ""
    except Exception:
        return ""


def _extract_h1_from_html(html_content: str) -> str:
    """Parse first <h1> from raw HTML."""
    if not html_content:
        return ""
    try:
        soup = BeautifulSoup(html_content, "lxml")
        tag = soup.find("h1")
        return tag.get_text(strip=True) if tag else ""
    except Exception:
        return ""


# ═══════════════════════════════════════════════════════════════════════════════
# Per-URL keyword resolution (called by orchestrator during crawl)
# ═══════════════════════════════════════════════════════════════════════════════

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
    Resolve the main keyword for this page.  Returns
    {"main_keyword": str, "keyword_source": str}.

    Volume / KD / CPC are filled later by the batch step.
    """
    resolved = ""
    source = ""

    # Strategy 1: explicit keyword provided (site-level or override)
    if main_keyword and main_keyword.strip():
        resolved = main_keyword.strip()
        source = "provided"

    # Strategy 2: derive from <title> (strip brand suffix)
    if not resolved:
        raw_title = title or _extract_title_from_html(html_content)
        candidate = _keyword_from_title(raw_title)
        if candidate:
            resolved = candidate
            source = "title"

    # Strategy 3: fall back to <h1>
    if not resolved:
        raw_h1 = h1 or _extract_h1_from_html(html_content)
        if raw_h1 and len(raw_h1.strip()) >= 3:
            resolved = raw_h1.strip()
            source = "h1"

    return {
        "main_keyword": resolved,
        "keyword_source": source,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers — value checks
# ═══════════════════════════════════════════════════════════════════════════════

def _has_value(val: Any) -> bool:
    """Return True when *val* is populated (not None, not empty string).
    Zero IS a valid value for kd_us."""
    return val is not None and val != ""


def _has_nonzero(val: Any) -> bool:
    """Return True when *val* is a non-null, non-zero numeric value."""
    if val is None or val == "":
        return False
    try:
        return float(val) != 0
    except (TypeError, ValueError):
        return False


def _all_fields_present(item: Dict[str, Any]) -> bool:
    """True when all 4 keyword metric fields are already populated."""
    return (
        _has_value(item.get("volume_global"))
        and _has_value(item.get("volume_us"))
        and _has_value(item.get("cpc_usd"))
        and _has_value(item.get("kd_us"))
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Step 2 — Keywords Data API  (volume_global + volume_us + cpc_usd)
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_search_volume(keywords: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Single API call for US location (2840).
    Returns {original_keyword_str: {volume_us, volume_global, cpc_usd}}.

    For each input keyword up to 3 candidate phrases are generated
    (full, 5-word truncation, stop-word-stripped core) and sent in the
    same batch.  Results are mapped back using a priority fallback so that
    even title-derived long-tail keywords resolve to a searchable variant.
    """
    if not execute_task or not keywords:
        return {}

    cache: Dict[str, Dict[str, Any]] = {}

    # ── Build candidate API keywords and reverse map ───────────────────
    # kw_to_candidates : original_kw → ordered candidate list
    # api_kw_to_originals : api_kw → [original_kws that listed it as a candidate]
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

    logger.debug(
        "[KM] Volume batch: %d original keywords → %d API candidates",
        len(keywords), len(api_keywords),
    )

    try:
        resp = await execute_task(
            task_name="keywords_search_volume",
            input_data={
                "endpoint": "/keywords_data/google_ads/search_volume/live",
                "payload": [
                    {
                        "keywords": api_keywords,
                        "location_code": 2840,
                        "language_code": "en",
                    },
                ],
            },
            provider="dataforseo",
        )

        if not (resp and resp.success):
            logger.warning(
                "[KM] Keywords Data API failed: %s",
                resp.error if resp else "no response",
            )
            return cache

        tasks_data = (resp.data or {}).get("tasks", [])
        if not tasks_data:
            return cache

        task0 = tasks_data[0]
        status = task0.get("status_code")
        if status != 20000:
            logger.warning(
                "[KM] Keywords Data API task status %s: %s",
                status, task0.get("status_message"),
            )
            return cache

        # Build a map: api_kw_returned → data  (only when search_volume is non-null)
        api_results: Dict[str, Dict[str, Any]] = {}
        for entry in (task0.get("result") or []):
            api_kw = (entry.get("keyword") or "").strip().lower()
            sv = entry.get("search_volume")
            if api_kw and sv is not None:
                api_results[api_kw] = {
                    "volume_us": sv,
                    "volume_global": sv,
                    "cpc_usd": entry.get("cpc"),
                }

        # For each original keyword, walk its candidate list in priority order;
        # use the first candidate that has non-null search volume.
        resolved_via_fallback = 0
        for kw, candidates in kw_to_candidates.items():
            for idx, api_kw in enumerate(candidates):
                if api_kw in api_results:
                    cache[kw] = api_results[api_kw]
                    if idx > 0:
                        resolved_via_fallback += 1
                    break

        if resolved_via_fallback:
            logger.info(
                "[KM] Volume: %d/%d keywords resolved via shorter fallback phrase",
                resolved_via_fallback, len(keywords),
            )

    except Exception as exc:
        logger.error("[KM] Keywords Data API exception: %s", exc, exc_info=True)

    return cache


# ═══════════════════════════════════════════════════════════════════════════════
# Step 3 — DataForSEO Labs  (kd_us — batch, single API call)
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_keyword_difficulty_batch(keywords: List[str]) -> Dict[str, int]:
    """
    Single DataForSEO Labs call for ALL keywords → {original_keyword_lower: kd_value}.

    Same multi-candidate strategy as _fetch_search_volume: up to 3 phrase
    variants are sent per keyword so that keywords with no KD at full length
    resolve via a shorter, database-tracked phrase.
    """
    if not execute_task or not keywords:
        return {}

    cache: Dict[str, int] = {}

    # ── Build candidate API keywords and reverse map ───────────────────
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

    logger.debug(
        "[KM] KD batch: %d original keywords → %d API candidates",
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
                "[KM] KD Labs API failed: %s",
                resp.error if resp else "no response",
            )
            return cache

        tasks_data = (resp.data or {}).get("tasks", [])
        if not tasks_data:
            logger.warning("[KM] KD Labs API: no tasks in response")
            return cache

        task0 = tasks_data[0]
        status = task0.get("status_code")
        if status != 20000:
            logger.warning(
                "[KM] KD Labs API task status %s: %s",
                status, task0.get("status_message"),
            )
            return cache

        # Response: tasks[0].result[0].items[] → each has keyword + keyword_difficulty
        result_list = task0.get("result") or []
        if not result_list:
            logger.warning("[KM] KD Labs API: empty result list")
            return cache

        items = result_list[0].get("items") or []
        logger.info("[KM] KD Labs API: %d keyword items (from %d candidates)", len(items), len(api_keywords))

        # Build api_kw → kd map (only when kd is non-null)
        api_kd_results: Dict[str, int] = {}
        for entry in items:
            api_kw = (entry.get("keyword") or "").strip().lower()
            kd = entry.get("keyword_difficulty")
            if api_kw and kd is not None:
                api_kd_results[api_kw] = kd

        # For each original keyword, walk its candidate list in priority order;
        # use the first candidate that has a non-null KD value.
        resolved_via_fallback = 0
        for kw, candidates in kw_to_candidates.items():
            for idx, api_kw in enumerate(candidates):
                if api_kw in api_kd_results:
                    cache[kw] = api_kd_results[api_kw]
                    if idx > 0:
                        resolved_via_fallback += 1
                    break

        if resolved_via_fallback:
            logger.info(
                "[KM] KD: %d/%d keywords resolved via shorter fallback phrase",
                resolved_via_fallback, len(keywords),
            )

    except Exception as exc:
        logger.error("[KM] KD Labs API exception: %s", exc, exc_info=True)

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

    Each item dict must contain at minimum:
        url, main_keyword
    and may already contain:
        volume_global, volume_us, kd_us, cpc_usd

    Returns a list of result dicts (same order as input) with the 4 fields
    plus an audit_log.
    """
    if not items:
        return []

    total_urls = len(items)

    # ─── Pre-flight: collect unique keywords that need fetching ────────────
    keywords_needing_volume: set[str] = set()
    keywords_needing_kd: set[str] = set()
    skipped_no_keyword = 0

    for item in items:
        kw = (item.get("main_keyword") or "").strip()
        if not kw:
            skipped_no_keyword += 1
            continue

        kw_lower = kw.lower()

        # Check which fields are missing for this keyword
        needs_volume = (
            not _has_value(item.get("volume_global"))
            or not _has_value(item.get("volume_us"))
            or not _has_value(item.get("cpc_usd"))
        )
        needs_kd = not _has_value(item.get("kd_us"))

        if needs_volume:
            keywords_needing_volume.add(kw_lower)
        if needs_kd:
            keywords_needing_kd.add(kw_lower)

    # Keywords where ALL 4 fields already exist → already cached, no fetch
    all_unique_keywords = set()
    for item in items:
        kw = (item.get("main_keyword") or "").strip().lower()
        if kw:
            all_unique_keywords.add(kw)

    keywords_already_cached = all_unique_keywords - keywords_needing_volume - keywords_needing_kd
    keywords_to_fetch_volume = list(keywords_needing_volume)
    keywords_to_fetch_kd = list(keywords_needing_kd)

    logger.info(
        "[KM] Total URLs in batch: %d | Unique keywords to fetch volume: %d | "
        "Unique keywords to fetch KD: %d | Keywords already cached: %d | "
        "Keywords Data API calls required: %d | KD Labs API calls required: %d",
        total_urls,
        len(keywords_to_fetch_volume),
        len(keywords_to_fetch_kd),
        len(keywords_already_cached),
        1 if keywords_to_fetch_volume else 0,
        1 if keywords_to_fetch_kd else 0,
    )

    # ─── Step 2: Fetch volume + CPC (single API call) ─────────────────────
    keyword_cache: Dict[str, Dict[str, Any]] = {}
    volume_api_calls = 0

    if keywords_to_fetch_volume:
        keyword_cache = await _fetch_search_volume(keywords_to_fetch_volume)
        volume_api_calls = 1

    # ─── Step 3: Fetch KD via DataForSEO Labs (single batch call) ───────
    kd_cache: Dict[str, int] = {}
    kd_api_calls = 0

    if keywords_to_fetch_kd:
        kd_cache = await _fetch_keyword_difficulty_batch(keywords_to_fetch_kd)
        kd_api_calls = 1

    # ─── Step 4: Write back to items ──────────────────────────────────────
    fields_found = 0
    fields_fetched = 0
    fields_skipped_no_kw = 0
    fields_still_null = 0
    results: List[Dict[str, Any]] = []

    for item in items:
        url = item.get("url", "")
        kw_raw = (item.get("main_keyword") or "").strip()
        kw_lower = kw_raw.lower()
        audit_log: Dict[str, str] = {}

        # No keyword → skip all 4 fields
        if not kw_raw:
            audit_log["volume_global"] = "SKIPPED-NO-KEYWORD"
            audit_log["volume_us"] = "SKIPPED-NO-KEYWORD"
            audit_log["kd_us"] = "SKIPPED-NO-KEYWORD"
            audit_log["cpc_usd"] = "SKIPPED-NO-KEYWORD"
            fields_skipped_no_kw += 4
            results.append({
                "url": url,
                "main_keyword": None,
                "volume_global": None,
                "volume_us": None,
                "kd_us": None,
                "cpc_usd": None,
                "audit_log": audit_log,
            })
            continue

        vol_data = keyword_cache.get(kw_lower, {})

        # ── volume_global ──────────────────────────────────────────────
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

        # ── volume_us ─────────────────────────────────────────────────
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

        # ── cpc_usd ───────────────────────────────────────────────────
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

        # ── kd_us ─────────────────────────────────────────────────────
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
            "volume_global": volume_global,
            "volume_us": volume_us,
            "kd_us": kd_us,
            "cpc_usd": cpc_usd,
            "audit_log": audit_log,
        })

    # ─── Batch summary ────────────────────────────────────────────────────
    total_fields = len(results) * 4
    fill_rate = round(fields_fetched / max(total_fields, 1) * 100, 1)
    logger.info(
        "[KM] ═══ Batch Summary ═══\n"
        "  Keywords Data API calls made:  %d  (%d unique keywords, up to 3x candidates)\n"
        "  KD Labs API calls made:        %d  (%d unique keywords, up to 3x candidates)\n"
        "  Fields found (no fetch):       %d\n"
        "  Fields fetched:                %d  (%.1f%% fill rate)\n"
        "  Fields skipped (no keyword):   %d\n"
        "  Fields still null:             %d",
        volume_api_calls,
        len(keywords_to_fetch_volume),
        kd_api_calls,
        len(keywords_to_fetch_kd),
        fields_found,
        fields_fetched, fill_rate,
        fields_skipped_no_kw,
        fields_still_null,
    )

    return results

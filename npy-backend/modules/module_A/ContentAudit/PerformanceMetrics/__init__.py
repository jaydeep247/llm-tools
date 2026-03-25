"""
Performance Metrics Sub-module  —  Per-page stubs + Batch DataForSEO extraction

Fields:
  currentRanking      — DataForSEO SERP /v3/serp/google/organic/live/regular
  ga30DaysTraffic     — DataForSEO Traffic Analytics /v3/traffic_analytics/google/organic/live
  overallKeywords     — DataForSEO Domain Analytics /v3/domain_analytics/google/ranked_keywords/live
  firstPageKeywords   — Same Domain Analytics call, items with rank_absolute ≤ 10

Two public functions:
  extract_performance_metrics()        — per-URL stub (returns existing or 0/null; no API calls)
  extract_performance_metrics_batch()  — post-crawl batch: full DataForSEO implementation

Pre-flight rules (per field):
  - Value exists and is not null AND not "100+" AND not 0  → FOUND, skip
  - Value is "100+" or 0 (or null)                         → EXTRACTING
  For currentRanking only: also SKIPPED-NO-KEYWORD when main_keyword is absent

Batching rules:
  currentRanking    → 1 SERP call per unique keyword (deduped)
  ga30DaysTraffic   → 1 Traffic Analytics call batching all URLs
  overall/firstPage → 1 Domain Analytics call per URL (sequential, 0.5 s delay)
"""
import asyncio
import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union
from urllib.parse import urlparse

try:
    from orchestrator.checkpoint.executor import execute_task
except ImportError:
    execute_task = None

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def _normalise_url(url: str) -> str:
    """Strip scheme, www, and trailing slash for apples-to-apples URL comparison."""
    url = url.lower().strip()
    url = url.rstrip("/")
    url = url.replace("https://", "").replace("http://", "").replace("www.", "")
    return url


def _last_full_month_range() -> Tuple[str, str]:
    """Return (date_from, date_to) strings for the previous complete calendar month."""
    today = date.today()
    first_of_curr = today.replace(day=1)
    last_day_prev = first_of_curr - timedelta(days=1)
    first_day_prev = last_day_prev.replace(day=1)
    return first_day_prev.strftime("%Y-%m-%d"), last_day_prev.strftime("%Y-%m-%d")


def _is_valid_ranking(val: Any) -> bool:
    """True when current_ranking is a real positive integer (1-100), not a stub."""
    if val is None:
        return False
    if val == "100+" or val == 0:
        return False
    try:
        return int(val) > 0
    except (TypeError, ValueError):
        return False


def _needs_fetch(val: Any) -> bool:
    """True when a numeric field (traffic, keywords) needs to be fetched."""
    if val is None:
        return True
    if val == 0:
        return True
    return False


# ═══════════════════════════════════════════════════════════════════════════════
# DataForSEO — Field 1: Current Ranking (SERP)
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_serp_ranking_batch(
    keyword_to_urls: Dict[str, List[str]],
) -> Dict[str, Dict[str, Any]]:
    """
    Fetch SERP rankings for all unique keywords.

    Args:
        keyword_to_urls: {keyword: [page_url, ...]} — one SERP call per keyword,
                         result is used for all URLs that share that keyword.

    Returns:
        {keyword: {"raw_items": [...], "status_ok": bool}}
        Each caller matches its own URL against raw_items.
    """
    if not execute_task or not keyword_to_urls:
        return {}

    results: Dict[str, Dict[str, Any]] = {}
    unique_keywords = list(keyword_to_urls.keys())
    total = len(unique_keywords)

    logger.info("[PM][SERP] Fetching rankings for %d unique keyword(s)", total)

    for idx, kw in enumerate(unique_keywords, start=1):
        try:
            resp = await execute_task(
                task_name="serp_ranking",
                input_data={
                    "endpoint": "/serp/google/organic/live/regular",
                    "payload": [
                        {
                            "keyword": kw,
                            "location_code": 2840,
                            "language_code": "en",
                            "depth": 100,
                        }
                    ],
                },
                provider="dataforseo",
            )

            if not (resp and resp.success):
                logger.warning("[PM][SERP] [%d/%d] keyword=%r failed: %s", idx, total, kw, resp.error if resp else "no response")
                results[kw] = {"raw_items": [], "status_ok": False}
                continue

            tasks_data = (resp.data or {}).get("tasks", [])
            if not tasks_data:
                results[kw] = {"raw_items": [], "status_ok": False}
                continue

            task0 = tasks_data[0]
            status_code = task0.get("status_code")
            if status_code != 20000:
                logger.warning(
                    "[PM][SERP] [%d/%d] keyword=%r status %s: %s",
                    idx, total, kw, status_code, task0.get("status_message"),
                )
                results[kw] = {"raw_items": [], "status_ok": False}
                continue

            result_list = task0.get("result") or []
            items = result_list[0].get("items") or [] if result_list else []
            results[kw] = {"raw_items": items, "status_ok": True}

            logger.info("[PM][SERP] [%d/%d] keyword=%r → %d SERP items", idx, total, kw, len(items))

        except Exception as exc:
            logger.error("[PM][SERP] [%d/%d] keyword=%r exception: %s", idx, total, kw, exc, exc_info=True)
            results[kw] = {"raw_items": [], "status_ok": False}

    return results


def _extract_rank_from_serp(page_url: str, serp_items: List[Dict]) -> Union[int, str]:
    """
    Find page_url in serp_items (organic results only).

    Matching strategy (in order):
      1. Exact normalised URL comparison.
      2. Partial slug match — page path slug contained in item URL.

    Returns rank_absolute (int 1-100) or "100+" if not found.
    """
    norm_page = _normalise_url(page_url)
    slug = urlparse(page_url).path.rstrip("/")

    for item in serp_items:
        if item.get("type") != "organic":
            continue
        item_url = item.get("url", "")
        if not item_url:
            continue

        # Strategy 1: normalised full URL
        if _normalise_url(item_url) == norm_page:
            return item.get("rank_absolute", "100+")

        # Strategy 2: slug partial match (handles CDN redirects, query params, etc.)
        if slug and len(slug) > 1 and slug in item_url:
            return item.get("rank_absolute", "100+")

    return "100+"


# ═══════════════════════════════════════════════════════════════════════════════
# DataForSEO — Field 2: GA Traffic (Traffic Analytics)
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_traffic_batch(urls: List[str]) -> Dict[str, int]:
    """
    Single Traffic Analytics call for all URLs → {url: sessions_int}.

    Uses last full calendar month as the date window. Falls back to 0 on any error.
    """
    if not execute_task or not urls:
        return {}

    date_from, date_to = _last_full_month_range()
    logger.info(
        "[PM][TRAFFIC] Batching %d URL(s): %s → %s",
        len(urls), date_from, date_to,
    )

    payload = [
        {
            "target": u,
            "target_type": "page",
            "location_code": 2840,
            "language_code": "en",
            "date_from": date_from,
            "date_to": date_to,
        }
        for u in urls
    ]

    traffic_by_url: Dict[str, int] = {u: 0 for u in urls}

    try:
        resp = await execute_task(
            task_name="traffic_analytics",
            input_data={
                "endpoint": "/traffic_analytics/google/organic/live",
                "payload": payload,
            },
            provider="dataforseo",
        )

        if not (resp and resp.success):
            logger.warning(
                "[PM][TRAFFIC] API failed: %s",
                resp.error if resp else "no response",
            )
            return traffic_by_url

        tasks_data = (resp.data or {}).get("tasks", [])
        if not tasks_data:
            return traffic_by_url

        for idx, task in enumerate(tasks_data):
            url = urls[idx] if idx < len(urls) else None
            if not url:
                continue

            status_code = task.get("status_code")
            if status_code != 20000:
                logger.warning(
                    "[PM][TRAFFIC] %s | status %s: %s",
                    url, status_code, task.get("status_message"),
                )
                continue

            result_list = task.get("result") or []
            if not result_list:
                logger.info("[PM][TRAFFIC] %s | traffic=0 (no data from DataForSEO)", url)
                continue

            result = result_list[0]
            organic = result.get("organic") or {}
            sessions = organic.get("count") or organic.get("etv") or 0
            traffic_by_url[url] = int(sessions)
            logger.debug("[PM][TRAFFIC] %s | sessions=%d", url, sessions)

    except Exception as exc:
        logger.error("[PM][TRAFFIC] Exception: %s", exc, exc_info=True)

    return traffic_by_url


# ═══════════════════════════════════════════════════════════════════════════════
# DataForSEO — Fields 3 & 4: Overall Keywords + 1st Page Keywords (Domain Analytics)
# ═══════════════════════════════════════════════════════════════════════════════

async def _fetch_domain_analytics(url: str) -> Tuple[int, int]:
    """
    One Domain Analytics call for *url* → (overall_keywords, first_page_keywords).

    Tries URL as-is first; on zero result retries with toggled trailing slash.
    Returns (0, 0) on any error or when URL genuinely ranks for no keywords.
    """
    if not execute_task:
        return 0, 0

    async def _call(target_url: str) -> Optional[Dict]:
        try:
            resp = await execute_task(
                task_name="domain_analytics_keywords",
                input_data={
                    "endpoint": "/domain_analytics/google/ranked_keywords/live",
                    "payload": [
                        {
                            "target": target_url,
                            "target_type": "page",
                            "location_code": 2840,
                            "language_code": "en",
                            "filters": [
                                ["keyword_data.keyword_info.search_volume", ">", 0]
                            ],
                        }
                    ],
                },
                provider="dataforseo",
            )

            if not (resp and resp.success):
                logger.warning(
                    "[PM][DA] %s | failed: %s",
                    target_url, resp.error if resp else "no response",
                )
                return None

            tasks_data = (resp.data or {}).get("tasks", [])
            if not tasks_data:
                return None

            task0 = tasks_data[0]
            status_code = task0.get("status_code")
            if status_code != 20000:
                logger.warning(
                    "[PM][DA] %s | status %s: %s",
                    target_url, status_code, task0.get("status_message"),
                )
                return None

            result_list = task0.get("result") or []
            return result_list[0] if result_list else None

        except Exception as exc:
            logger.error("[PM][DA] %s | exception: %s", target_url, exc, exc_info=True)
            return None

    # Primary attempt
    result = await _call(url)

    # Retry with toggled trailing slash if zero results
    if result is not None and (result.get("total_count") or 0) == 0:
        alt_url = url.rstrip("/") if url.endswith("/") else url + "/"
        if alt_url != url:
            logger.debug("[PM][DA] %s | zero — retrying with %s", url, alt_url)
            alt_result = await _call(alt_url)
            if alt_result and (alt_result.get("total_count") or 0) > 0:
                result = alt_result

    if result is None:
        return 0, 0

    overall_keywords = result.get("total_count") or 0
    items = result.get("items") or []

    first_page_keywords = sum(
        1
        for item in items
        if (
            item.get("ranked_serp_element", {})
                .get("serp_item", {})
                .get("rank_absolute", 999)
        ) <= 10
    )

    logger.debug(
        "[PM][DA] %s | overall=%d first_page=%d",
        url, overall_keywords, first_page_keywords,
    )
    return overall_keywords, first_page_keywords


# ═══════════════════════════════════════════════════════════════════════════════
# Public API — per-URL stub (called during crawl)
# ═══════════════════════════════════════════════════════════════════════════════

async def extract_performance_metrics(
    url: str,
    html_content: str = "",
    main_keyword: str = "",
    ga_property_id: str = None,
    response_headers: Dict[str, str] = None,
    existing_item: Dict[str, Any] = None,
    h1: str = "",
    title: str = "",
    **kwargs,
) -> Dict[str, Any]:
    """
    Per-URL entry point called during crawl.

    Returns existing values when present and valid; otherwise returns stubs
    (null / 0). Actual DataForSEO API calls happen in extract_performance_metrics_batch()
    which runs as a post-crawl step with all pages available for efficient batching.
    """
    existing = existing_item or {}

    pm = existing.get("performance_metrics") or existing  # support both flat & nested existing

    current_ranking = pm.get("currentRanking") or None
    ga_traffic = pm.get("ga30DaysTraffic") or 0
    overall_kw = pm.get("overallKeywords") or 0
    first_page_kw = pm.get("firstPageKeywords") or 0

    logger.debug(
        "[PM] per-URL stub for %s | ranking=%s ga=%s overall=%s first=%s",
        url, current_ranking, ga_traffic, overall_kw, first_page_kw,
    )

    return {
        "currentRanking": current_ranking,
        "ga30DaysTraffic": ga_traffic,
        "overallKeywords": overall_kw,
        "firstPageKeywords": first_page_kw,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Public API — post-crawl batch (DataForSEO full flow)
# ═══════════════════════════════════════════════════════════════════════════════

async def extract_performance_metrics_batch(
    items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Post-crawl batch enrichment for all 4 performance fields.

    Each item must contain:
        url           : str
        main_keyword  : str  (may be empty)
        currentRanking      : int | "100+" | None
        ga30DaysTraffic     : int | None
        overallKeywords     : int | None
        firstPageKeywords   : int | None

    Returns a list of result dicts (one per input item) with shape:
        {
            "url":                str,
            "main_keyword":       str,
            "currentRanking":     int | "100+" | None,
            "ga30DaysTraffic":    int,
            "overallKeywords":    int,
            "firstPageKeywords":  int,
            "audit_log": {
                "currentRanking":    "FOUND" | "FETCHED" | "SKIPPED-NO-KEYWORD",
                "ga30DaysTraffic":   "FOUND" | "FETCHED" | "ZERO",
                "overallKeywords":   "FOUND" | "FETCHED" | "ZERO",
                "firstPageKeywords": "FOUND" | "FETCHED" | "ZERO",
            }
        }
    """
    if not items:
        return []

    # ── Pre-flight ────────────────────────────────────────────────────────────
    # Classify each item for each field: FOUND / EXTRACTING / SKIPPED-NO-KEYWORD

    need_ranking: List[Dict]  = []   # items where ranking must be fetched
    need_traffic: List[str]   = []   # URLs where traffic must be fetched
    need_da:      List[Dict]  = []   # items where domain-analytics must be fetched

    for item in items:
        url = item.get("url", "")
        kw  = (item.get("main_keyword") or "").strip()

        # Field 1 — currentRanking
        cr = item.get("currentRanking")
        if _is_valid_ranking(cr):
            item["_rank_status"] = "FOUND"
        elif not kw:
            item["_rank_status"] = "SKIPPED-NO-KEYWORD"
        else:
            item["_rank_status"] = "EXTRACTING"
            need_ranking.append(item)

        # Field 2 — ga30DaysTraffic
        gt = item.get("ga30DaysTraffic")
        if gt is not None and gt != 0:
            item["_traffic_status"] = "FOUND"
        else:
            item["_traffic_status"] = "EXTRACTING"
            need_traffic.append(url)

        # Fields 3 & 4 — overallKeywords / firstPageKeywords
        ok = item.get("overallKeywords")
        if ok is not None and ok != 0:
            item["_da_status"] = "FOUND"
        else:
            item["_da_status"] = "EXTRACTING"
            need_da.append(item)

    logger.info(
        "[PM][BATCH] Pre-flight → ranking: %d to fetch | traffic: %d to fetch | DA: %d to fetch",
        len(need_ranking), len(need_traffic), len(need_da),
    )

    # ── Field 1: Current Ranking ──────────────────────────────────────────────
    # Deduplicate by keyword, 1 SERP call per unique keyword, cache full response.
    serp_cache: Dict[str, Dict] = {}

    if need_ranking:
        kw_to_item_urls: Dict[str, List[str]] = {}
        for item in need_ranking:
            kw = item["main_keyword"].strip()
            kw_to_item_urls.setdefault(kw, []).append(item["url"])

        serp_cache = await _fetch_serp_ranking_batch(kw_to_item_urls)

        for item in need_ranking:
            kw = item["main_keyword"].strip()
            serp_data = serp_cache.get(kw, {})
            if not serp_data.get("status_ok"):
                item["_resolved_ranking"] = "100+"
            else:
                item["_resolved_ranking"] = _extract_rank_from_serp(
                    item["url"], serp_data.get("raw_items", [])
                )
                logger.debug(
                    "[PM][SERP] %s | keyword=%r → rank=%s",
                    item["url"], kw, item["_resolved_ranking"],
                )

    # ── Field 2: GA Traffic ───────────────────────────────────────────────────
    # Single batch call for all URLs that need traffic data.
    traffic_map: Dict[str, int] = {}

    if need_traffic:
        # Deduplicate URLs (same URL may appear twice in multi-keyword scenarios)
        unique_traffic_urls = list(dict.fromkeys(need_traffic))
        traffic_map = await _fetch_traffic_batch(unique_traffic_urls)

    # ── Fields 3 & 4: Domain Analytics ───────────────────────────────────────
    # Sequential, 1 call per URL, 0.5 s gap between calls.
    da_map: Dict[str, Tuple[int, int]] = {}  # url → (overall, first_page)
    da_total = len(need_da)

    for idx, item in enumerate(need_da):
        url = item["url"]
        if idx > 0:
            await asyncio.sleep(0.5)
        overall, first_page = await _fetch_domain_analytics(url)
        da_map[url] = (overall, first_page)
        logger.info(
            "[PM][DA] [%d/%d] %s | overall=%d first_page=%d",
            idx + 1, da_total, url, overall, first_page,
        )

    # ── Assemble results ──────────────────────────────────────────────────────
    output: List[Dict[str, Any]] = []

    # Counters for batch summary
    cnt_rank_fetched  = cnt_rank_100plus = 0
    cnt_traffic_fetched = cnt_traffic_zero = 0
    cnt_da_fetched    = cnt_da_zero       = 0
    sum_rank = sum_traffic = sum_da = 0
    n_rank_int = n_traffic_nz = n_da_nz = 0

    for item in items:
        url = item.get("url", "")
        kw  = (item.get("main_keyword") or "").strip()

        # --- ranking ---
        rank_status = item.get("_rank_status", "EXTRACTING")
        if rank_status == "FOUND":
            current_ranking = item.get("currentRanking")
            audit_rank = "FOUND"
        elif rank_status == "SKIPPED-NO-KEYWORD":
            current_ranking = item.get("currentRanking", None)
            audit_rank = "SKIPPED-NO-KEYWORD"
        else:
            current_ranking = item.get("_resolved_ranking", "100+")
            audit_rank = "FETCHED"
            cnt_rank_fetched += 1
            if current_ranking == "100+":
                cnt_rank_100plus += 1
            else:
                try:
                    sum_rank += int(current_ranking)
                    n_rank_int += 1
                except (TypeError, ValueError):
                    pass

        # --- traffic ---
        traffic_status = item.get("_traffic_status", "EXTRACTING")
        if traffic_status == "FOUND":
            ga_traffic = item.get("ga30DaysTraffic", 0)
            audit_traffic = "FOUND"
        else:
            ga_traffic = traffic_map.get(url, 0)
            cnt_traffic_fetched += 1
            if ga_traffic == 0:
                cnt_traffic_zero += 1
                audit_traffic = "ZERO"
            else:
                sum_traffic += ga_traffic
                n_traffic_nz += 1
                audit_traffic = "FETCHED"

        # --- domain analytics ---
        da_status = item.get("_da_status", "EXTRACTING")
        if da_status == "FOUND":
            overall_kw    = item.get("overallKeywords", 0)
            first_page_kw = item.get("firstPageKeywords", 0)
            audit_da_overall    = "FOUND"
            audit_da_firstpage  = "FOUND"
        else:
            overall_kw, first_page_kw = da_map.get(url, (0, 0))
            cnt_da_fetched += 1
            if overall_kw == 0:
                cnt_da_zero += 1
                audit_da_overall   = "ZERO"
                audit_da_firstpage = "ZERO"
            else:
                sum_da += overall_kw
                n_da_nz += 1
                audit_da_overall   = "FETCHED"
                audit_da_firstpage = "FETCHED"

        output.append(
            {
                "url":               url,
                "main_keyword":      kw,
                "currentRanking":    current_ranking,
                "ga30DaysTraffic":   int(ga_traffic),
                "overallKeywords":   int(overall_kw),
                "firstPageKeywords": int(first_page_kw),
                "audit_log": {
                    "currentRanking":    audit_rank,
                    "ga30DaysTraffic":   audit_traffic,
                    "overallKeywords":   audit_da_overall,
                    "firstPageKeywords": audit_da_firstpage,
                },
            }
        )

    # ── Batch Summary ─────────────────────────────────────────────────────────
    n_total        = len(items)
    avg_rank       = round(sum_rank / n_rank_int, 1) if n_rank_int else "—"
    avg_traffic    = round(sum_traffic / n_traffic_nz, 0) if n_traffic_nz else "—"
    avg_da         = round(sum_da / n_da_nz, 0) if n_da_nz else "—"
    serp_calls     = len(set(i["main_keyword"].strip() for i in need_ranking))
    traffic_calls  = 1 if need_traffic else 0
    da_calls       = len(need_da)
    total_calls    = serp_calls + traffic_calls + da_calls

    logger.info(
        "\n"
        "═══════════════════════════════════════════════════\n"
        "  PERFORMANCE METRICS — BATCH SUMMARY\n"
        "═══════════════════════════════════════════════════\n"
        "  URLs processed:                 %d\n"
        "  Current Ranking fetched:        %d  (avg position: %s)\n"
        "  Current Ranking = 100+:         %d\n"
        "  GA Traffic fetched:             %d  (avg sessions: %s)\n"
        "  GA Traffic = 0:                 %d\n"
        "  Overall Keywords fetched:       %d  (avg: %s kw/page)\n"
        "  1st Page Keywords fetched:      %d\n"
        "\n"
        "  SERP API calls:                 %d\n"
        "  Traffic Analytics API calls:    %d  (batched)\n"
        "  Domain Analytics API calls:     %d\n"
        "  Total DataForSEO calls:         %d\n"
        "═══════════════════════════════════════════════════",
        n_total,
        cnt_rank_fetched, avg_rank,
        cnt_rank_100plus,
        cnt_traffic_fetched, avg_traffic,
        cnt_traffic_zero,
        cnt_da_fetched, avg_da,
        cnt_da_fetched - cnt_da_zero,
        serp_calls,
        traffic_calls,
        da_calls,
        total_calls,
    )

    return output

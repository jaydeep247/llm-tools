"""
Performance Metrics Sub-module.

Data sources:
  1. DataForSEO Labs ranked_keywords/live  (fields 3.1, 3.3, 3.4)
     - Call A: no position filter  → total_count = overallKeywords;
               scan items for main keyword → rank_group = currentRanking
     - Call B: rank_absolute <= 10 → total_count = firstPageKeywords

  2. GA4 30-day traffic is fetched via user OAuth from the Node backend (field 3.2)
     - Stored in ga30DaysTraffic when available

Fields stored:
    currentRanking    – rank_group for the page's main keyword (int or "100+")
    ga30DaysTraffic   – GA4 sessions for the page in the last 30 days (int)
    overallKeywords   – total ranked keywords for the URL
    firstPageKeywords – ranked keywords in positions 1–10
"""

import asyncio
import logging
import os
import re
from datetime import date, timedelta
from typing import Any, Dict, List, Literal, Optional, Tuple, Union
from urllib.parse import urlsplit, urlunsplit

try:
    from orchestrator.checkpoint.executor import execute_task
except ImportError:
    execute_task = None

logger = logging.getLogger(__name__)

APIStatus = Literal["ok", "rate_limit", "api_error"]

_KEYWORD_SPLIT_RE = re.compile(r"\s*(?:[:|]|\s+-\s+)\s*")
_KEYWORD_NORMALIZE_RE = re.compile(r"[^a-z0-9]+")


def _normalise_keyword(value: str) -> str:
    return _KEYWORD_NORMALIZE_RE.sub(" ", (value or "").lower()).strip()


def _extract_domain(url: str) -> str:
    parts = urlsplit(str(url or "").strip())
    host = (parts.netloc or parts.path or "").lower().strip()
    if host.startswith("www."):
        host = host[4:]
    return host.split(":", 1)[0]


def _url_to_page_path(url: str) -> str:
    """Return the path portion of a URL suitable for GA4 pagePath dimension."""
    parts = urlsplit(str(url or "").strip())
    path = parts.path or "/"
    if not path.startswith("/"):
        path = "/" + path
    return path


def _last_30_day_range() -> Tuple[str, str]:
    today = date.today()
    start = today - timedelta(days=30)
    return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


def _target_variants(url: str) -> List[str]:
    """
    Build DataForSEO-compatible target variants from a crawled URL.

    DataForSEO ranked_keywords/live expects the target WITHOUT the protocol
    prefix (e.g. ``attrock.com/blog/`` not ``https://attrock.com/blog/``).
    For the root page (``/``) we emit just the bare domain so that the API
    returns domain-wide keyword counts.
    """
    raw = str(url or "").strip()
    if not raw:
        return []

    variants: List[str] = []

    def _add(candidate: str) -> None:
        normalized = candidate.strip()
        if normalized and normalized not in variants:
            variants.append(normalized)

    parts = urlsplit(raw)
    host = (parts.netloc or "").strip()
    path = (parts.path or "").strip()

    if host:
        # Strip www. prefix — DataForSEO normalises it anyway
        bare_host = host.lower().removeprefix("www.")
        if not path or path == "/":
            # Root URL → use bare domain (returns domain-wide keywords)
            _add(bare_host)
        else:
            # Page URL → domain + path, with and without trailing slash
            _add(f"{bare_host}{path}")
            toggled = path[:-1] if path.endswith("/") else f"{path}/"
            _add(f"{bare_host}{toggled}")
    else:
        # Fallback: use the raw value stripped of any protocol
        stripped = re.sub(r"^https?://", "", raw)
        _add(stripped)

    return variants


def _keyword_variants(main_keyword: str) -> List[str]:
    raw = (main_keyword or "").strip()
    if not raw:
        return []

    variants: List[str] = []
    for candidate in [raw, *_KEYWORD_SPLIT_RE.split(raw)]:
        normalized = _normalise_keyword(candidate)
        if normalized and normalized not in variants:
            variants.append(normalized)
    return variants


def _is_valid_ranking(value: Any) -> bool:
    if value is None or value == "100+":
        return False
    try:
        return int(value) > 0
    except (TypeError, ValueError):
        return False


def _has_numeric_value(value: Any) -> bool:
    if value is None:
        return False
    try:
        return float(value) != 0
    except (TypeError, ValueError):
        return False


def _to_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _classify_task_response(resp: Any) -> Tuple[APIStatus, str, Optional[Dict[str, Any]]]:
    if not (resp and resp.success):
        message = resp.error if resp else "no response"
        return "api_error", str(message), None

    tasks = (resp.data or {}).get("tasks") or []
    if not tasks:
        return "api_error", "missing tasks in DataForSEO response", None

    task = tasks[0]
    status_code = int(task.get("status_code") or 0)
    status_message = str(task.get("status_message") or "")

    if status_code == 20000:
        return "ok", status_message, task

    if status_code == 40203 or "money limit per day" in status_message.lower():
        return "rate_limit", status_message, task

    return "api_error", status_message or f"status {status_code}", task


async def _ranked_keywords_call(
    target: str,
    *,
    filters: Optional[List] = None,
    limit: int = 1000,
    skip_cache: bool = False,
) -> Tuple[APIStatus, str, Dict[str, Any]]:
    """Single ranked_keywords/live API call. Returns (status, message, result_dict)."""
    if not execute_task:
        return "api_error", "DataForSEO executor unavailable", {}

    payload: Dict[str, Any] = {
        "target": target,
        "location_code": 2840,
        "language_code": "en",
        "item_types": ["organic"],
        "limit": limit,
    }
    if filters:
        payload["filters"] = filters

    try:
        resp = await execute_task(
            task_name="domain_analytics_keywords",
            input_data={
                "endpoint": "/dataforseo_labs/google/ranked_keywords/live",
                "payload": [payload],
            },
            provider="dataforseo",
            options={"skip_cache": skip_cache},
        )
    except Exception as exc:
        logger.error("[PM][LABS] exception for target=%s: %s", target, exc, exc_info=True)
        return "api_error", str(exc), {}

    status, message, task = _classify_task_response(resp)
    if status != "ok":
        logger.warning("[PM][LABS] API %s for target=%s filters=%s: %s", status, target, filters, message)
        return status, message, {}

    result_list = (task or {}).get("result") or []
    result = result_list[0] if result_list else {}
    tc = result.get("total_count")
    ic = result.get("items_count")
    logger.debug("[PM][LABS] target=%s filters=%s total_count=%s items_count=%s", target, filters, tc, ic)
    return "ok", message, result


def _build_url_filter(domain: str, path: str) -> Optional[List]:
    """
    Build a DataForSEO ``like`` filter on ``ranked_serp_element.serp_item.url``
    so the API returns only keywords where the specified page (or section) ranks.

    For the root path (``/``) no URL filter is needed — the domain-level query
    already returns all keywords.
    """
    if not path or path == "/":
        return None
    # ``like`` with ``%`` wildcards matches any keyword whose ranking URL
    # contains the domain + path prefix (captures sub-pages too).
    return ["ranked_serp_element.serp_item.url", "like", f"%{domain}{path}%"]


async def _fetch_ranked_keywords_snapshot(url: str, *, force_refresh: bool = False) -> Dict[str, Any]:
    """
    Two parallel DataForSEO calls per URL:
      Call A – URL filter (no rank filter)  → total_count = overallKeywords
               + items scanned for main keyword → rank_group = currentRanking
      Call B – URL filter + rank_absolute ≤ 10 → total_count = firstPageKeywords

    The ``target`` is always the bare domain.  Per-page scoping is achieved via
    a ``like`` filter on ``ranked_serp_element.serp_item.url``.

    When force_refresh=True the orchestrator's disk cache is bypassed.
    """
    empty = {
        "status": "api_error",
        "message": "no DataForSEO response",
        "items": [],
        "total_count_all": 0,
        "total_count_first_page": 0,
        "url": url,
    }

    domain = _extract_domain(url)
    if not domain:
        return empty

    parts = urlsplit(str(url or "").strip())
    path = parts.path or "/"

    url_filter = _build_url_filter(domain, path)

    # Build filter lists for the two calls
    filters_a: Optional[List] = None
    filters_b: List = [["ranked_serp_element.serp_item.rank_absolute", "<=", 10]]

    if url_filter:
        filters_a = [url_filter]
        filters_b = [url_filter, "and", ["ranked_serp_element.serp_item.rank_absolute", "<=", 10]]

    # Fire both calls in parallel
    (status_a, msg_a, result_a), (status_b, msg_b, result_b) = await asyncio.gather(
        _ranked_keywords_call(domain, filters=filters_a, limit=1000, skip_cache=force_refresh),
        _ranked_keywords_call(domain, filters=filters_b, limit=1000, skip_cache=force_refresh),
    )

    if status_a == "rate_limit":
        return {**empty, "status": "rate_limit", "message": msg_a}

    if status_a != "ok":
        return {**empty, "status": status_a, "message": msg_a}

    total_count_all = int(result_a.get("total_count") or 0)
    items = result_a.get("items") or []

    total_count_first_page = 0
    if status_b == "ok":
        total_count_first_page = int(result_b.get("total_count") or 0)
    else:
        logger.warning("[PM][LABS] Call-B %s for domain=%s path=%s: %s", status_b, domain, path, msg_b)

    snapshot = {
        "status": "ok",
        "message": msg_a,
        "items": items,
        "total_count_all": total_count_all,
        "total_count_first_page": total_count_first_page,
        "url": url,
        "target": domain,
    }

    if total_count_all > 0 or items:
        logger.info(
            "[PM][LABS] ✓ domain=%s path=%s  overall=%d  fp=%d  items=%d",
            domain, path, total_count_all, total_count_first_page, len(items),
        )
        return snapshot

    logger.info("[PM][LABS] ✗ no data for url=%s domain=%s path=%s", url, domain, path)
    return {**empty, "status": "ok", "message": msg_a}


async def _fetch_ranked_keywords_snapshots(
    urls: List[str],
    concurrency: int = 5,
    force_refresh: bool = False,
) -> Dict[str, Dict[str, Any]]:
    if not urls:
        return {}

    semaphore = asyncio.Semaphore(concurrency)

    async def _fetch_one(target_url: str) -> Tuple[str, Dict[str, Any]]:
        async with semaphore:
            return target_url, await _fetch_ranked_keywords_snapshot(
                target_url, force_refresh=force_refresh
            )

    results = await asyncio.gather(*[_fetch_one(url) for url in urls])
    return {url: snapshot for url, snapshot in results}


def _extract_rank_from_items(main_keyword: str, items: List[Dict[str, Any]]) -> Union[int, str]:
    """
    Scan ranked_keywords items for the main keyword.
    Returns rank_group (spec 3.1) if found, else "100+".
    """
    variants = set(_keyword_variants(main_keyword))
    if not variants:
        return "100+"

    best_rank: Optional[int] = None
    for item in items:
        keyword_data = item.get("keyword_data") or {}
        keyword_properties = item.get("keyword_properties") or {}
        ranked_serp_element = item.get("ranked_serp_element") or {}
        serp_item = ranked_serp_element.get("serp_item") or {}

        candidates = {
            _normalise_keyword(str(keyword_data.get("keyword") or "")),
            _normalise_keyword(str(keyword_properties.get("core_keyword") or "")),
        }
        candidates.discard("")
        if not candidates.intersection(variants):
            continue

        # Spec 3.1: use rank_group, not rank_absolute
        rank_group = _to_int(serp_item.get("rank_group"))
        if rank_group is None:
            continue

        if best_rank is None or rank_group < best_rank:
            best_rank = rank_group

    return best_rank if best_rank is not None else "100+"



# ---------------------------------------------------------------------------
# Public API — single-item (kept for backward compat with orchestrator)
# ---------------------------------------------------------------------------

async def extract_performance_metrics(
    url: str,
    html_content: str = "",
    main_keyword: str = "",
    response_headers: Dict[str, str] = None,
    existing_item: Dict[str, Any] = None,
    h1: str = "",
    title: str = "",
    **kwargs,
) -> Dict[str, Any]:
    existing = existing_item or {}
    pm = existing.get("performance_metrics") or existing

    return {
        "currentRanking": pm.get("currentRanking"),
        "ga30DaysTraffic": pm.get("ga30DaysTraffic"),
        "overallKeywords": pm.get("overallKeywords"),
        "firstPageKeywords": pm.get("firstPageKeywords"),
    }


# ---------------------------------------------------------------------------
# Public API — batch
# ---------------------------------------------------------------------------

async def extract_performance_metrics_batch(
    items: List[Dict[str, Any]],
    force_refresh: bool = False,
) -> List[Dict[str, Any]]:
    if not items:
        return []

    urls_to_fetch: List[str] = []
    seen_urls: set = set()

    for item in items:
        url = item.get("url", "")
        keyword = (item.get("main_keyword") or "").strip()

        needs_keyword_snapshot = force_refresh or any(
            [
                not _has_numeric_value(item.get("overallKeywords")),
                not _has_numeric_value(item.get("firstPageKeywords")),
                bool(keyword) and not _is_valid_ranking(item.get("currentRanking")),
            ]
        )

        if needs_keyword_snapshot and url and url not in seen_urls:
            seen_urls.add(url)
            urls_to_fetch.append(url)

    logger.info(
        "[PM][BATCH] ranked_keywords snapshots: %d URL(s)",
        len(urls_to_fetch),
    )

    snapshots = await _fetch_ranked_keywords_snapshots(urls_to_fetch, force_refresh=force_refresh)

    output: List[Dict[str, Any]] = []
    keyword_fetched_count = 0
    keyword_rate_limit_count = 0
    keyword_api_error_count = 0
    ranking_not_found_count = 0

    for item in items:
        url = item.get("url", "")
        keyword = (item.get("main_keyword") or "").strip()
        domain = _extract_domain(url)
        snapshot = snapshots.get(url)

        current_ranking = item.get("currentRanking")
        traffic = item.get("ga30DaysTraffic")
        overall_keywords = item.get("overallKeywords")
        first_page_keywords = item.get("firstPageKeywords")

        audit_ranking = (
            "FOUND" if _is_valid_ranking(current_ranking)
            else "SKIPPED-NO-KEYWORD" if not keyword
            else "PENDING"
        )
        audit_traffic = "FOUND" if _has_numeric_value(traffic) else "SKIPPED-GA4-VIA-FRONTEND"
        audit_overall = "FOUND" if _has_numeric_value(overall_keywords) else "PENDING"
        audit_first_page = "FOUND" if _has_numeric_value(first_page_keywords) else "PENDING"

        # ── DataForSEO snapshot ──────────────────────────────────────────────
        if snapshot:
            status = snapshot.get("status")
            if status == "ok":
                keyword_fetched_count += 1

                if force_refresh or audit_overall == "PENDING":
                    overall_keywords = snapshot["total_count_all"]
                    audit_overall = "FETCHED" if overall_keywords else "FETCHED-ZERO"

                if force_refresh or audit_first_page == "PENDING":
                    first_page_keywords = snapshot["total_count_first_page"]
                    audit_first_page = "FETCHED" if first_page_keywords else "FETCHED-ZERO"

                if keyword and (force_refresh or audit_ranking == "PENDING"):
                    current_ranking = _extract_rank_from_items(keyword, snapshot.get("items") or [])
                    if current_ranking == "100+":
                        ranking_not_found_count += 1
                        audit_ranking = "FETCHED-NOT-RANKING"
                    else:
                        audit_ranking = "FETCHED"
                elif not keyword:
                    audit_ranking = "SKIPPED-NO-KEYWORD"

            else:
                if status == "rate_limit":
                    keyword_rate_limit_count += 1
                    unavailable = "UNAVAILABLE-RATE-LIMIT"
                else:
                    keyword_api_error_count += 1
                    unavailable = "UNAVAILABLE-API"

                if force_refresh or audit_overall == "PENDING":
                    audit_overall = unavailable
                if force_refresh or audit_first_page == "PENDING":
                    audit_first_page = unavailable
                if keyword and (force_refresh or audit_ranking == "PENDING"):
                    audit_ranking = unavailable

        # ── GA4 traffic is now fetched via user OAuth from the frontend/nnode-backend ──

        output.append(
            {
                "url": url,
                "domain": domain,
                "main_keyword": keyword,
                "currentRanking": current_ranking,
                "ga30DaysTraffic": _to_int(traffic),
                "overallKeywords": _to_int(overall_keywords),
                "firstPageKeywords": _to_int(first_page_keywords),
                "audit_log": {
                    "currentRanking": audit_ranking,
                    "ga30DaysTraffic": audit_traffic,
                    "overallKeywords": audit_overall,
                    "firstPageKeywords": audit_first_page,
                },
            }
        )

    logger.info(
        "\n"
        "═══════════════════════════════════════════════════\n"
        "  PERFORMANCE METRICS — BATCH SUMMARY\n"
        "═══════════════════════════════════════════════════\n"
        "  URLs processed:               %d\n"
        "  Keyword snapshots (ok):        %d  / %d fetched\n"
        "  Keyword rate-limited:          %d\n"
        "  Keyword API errors:            %d\n"
        "  Ranking not found (100+):      %d\n"
        "═══════════════════════════════════════════════════",
        len(items),
        keyword_fetched_count,
        len(urls_to_fetch),
        keyword_rate_limit_count,
        keyword_api_error_count,
        ranking_not_found_count,
    )

    return output
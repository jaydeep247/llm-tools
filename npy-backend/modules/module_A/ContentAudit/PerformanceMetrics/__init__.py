"""
Performance Metrics Sub-module.

This implementation follows a two-source DataForSEO Labs flow:

1. URL-level keywords and ranking
     POST /v3/dataforseo_labs/google/ranked_keywords/live

2. Domain-level organic traffic
     POST /v3/dataforseo_labs/google/historical_bulk_traffic_estimation/live

Fields:
    - currentRanking: rank of the page for its main keyword
    - ga30DaysTraffic: estimated organic traffic for the domain (legacy key retained)
    - overallKeywords: total ranking keywords for the URL
    - firstPageKeywords: URL keywords ranking in positions 1-10
"""

import asyncio
import logging
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


def _last_30_day_range() -> Tuple[str, str]:
    today = date.today()
    start = today - timedelta(days=30)
    return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


def _target_variants(url: str) -> List[str]:
    raw = str(url or "").strip()
    if not raw:
        return []

    variants: List[str] = []

    def _add(candidate: str) -> None:
        normalized = candidate.strip()
        if normalized and normalized not in variants:
            variants.append(normalized)

    _add(raw)

    parts = urlsplit(raw)
    if parts.scheme and parts.netloc:
        path = parts.path or ""
        if path and path != "/":
            toggled_path = path[:-1] if path.endswith("/") else f"{path}/"
            _add(urlunsplit((parts.scheme, parts.netloc, toggled_path, parts.query, parts.fragment)))

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


async def _fetch_ranked_keywords_snapshot(url: str) -> Dict[str, Any]:
    if not execute_task:
        return {
            "status": "api_error",
            "message": "DataForSEO executor unavailable",
            "metrics": {},
            "items": [],
            "total_count": 0,
            "url": url,
        }

    last_failure: Optional[Dict[str, Any]] = None
    for target in _target_variants(url):
        try:
            resp = await execute_task(
                task_name="domain_analytics_keywords",
                input_data={
                    "endpoint": "/dataforseo_labs/google/ranked_keywords/live",
                    "payload": [
                        {
                            "target": target,
                            "location_code": 2840,
                            "language_code": "en",
                            "item_types": ["organic"],
                            "historical_serp_mode": "live",
                            "limit": 1000,
                            "filters": [["keyword_data.keyword_info.search_volume", ">", 0]],
                        }
                    ],
                },
                provider="dataforseo",
            )
        except Exception as exc:
            logger.error("[PM][LABS] %s | exception for target=%s: %s", url, target, exc, exc_info=True)
            last_failure = {
                "status": "api_error",
                "message": str(exc),
                "metrics": {},
                "items": [],
                "total_count": 0,
                "url": url,
            }
            continue

        status, message, task = _classify_task_response(resp)
        if status != "ok":
            logger.warning("[PM][LABS] %s | %s for target=%s: %s", url, status, target, message)
            failure = {
                "status": status,
                "message": message,
                "metrics": {},
                "items": [],
                "total_count": 0,
                "url": url,
            }
            if status == "rate_limit":
                return failure
            last_failure = failure
            continue

        result_list = (task or {}).get("result") or []
        result = result_list[0] if result_list else {}
        snapshot = {
            "status": "ok",
            "message": message,
            "metrics": result.get("metrics") or {},
            "items": result.get("items") or [],
            "total_count": int(result.get("total_count") or 0),
            "items_count": int(result.get("items_count") or 0),
            "url": url,
            "target": target,
        }

        if snapshot["total_count"] > 0 or snapshot["items"]:
            return snapshot

        if last_failure is None:
            last_failure = snapshot

    return last_failure or {
        "status": "api_error",
        "message": "no DataForSEO response",
        "metrics": {},
        "items": [],
        "total_count": 0,
        "url": url,
    }


async def _fetch_ranked_keywords_snapshots(urls: List[str], concurrency: int = 5) -> Dict[str, Dict[str, Any]]:
    if not urls:
        return {}

    semaphore = asyncio.Semaphore(concurrency)

    async def _fetch_one(target_url: str) -> Tuple[str, Dict[str, Any]]:
        async with semaphore:
            return target_url, await _fetch_ranked_keywords_snapshot(target_url)

    results = await asyncio.gather(*[_fetch_one(url) for url in urls])
    return {url: snapshot for url, snapshot in results}


async def _fetch_url_traffic_snapshots(urls: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Fetch per-URL organic traffic using dataforseo_labs bulk_traffic_estimation/live.
    This endpoint accepts full URLs as targets and returns URL-scoped ETV per target.
    Results are keyed by the lowercased URL.
    """
    if not execute_task or not urls:
        return {}

    results: Dict[str, Dict[str, Any]] = {}

    for index in range(0, len(urls), 1000):
        chunk = urls[index:index + 1000]
        try:
            resp = await execute_task(
                task_name="traffic_analytics",
                input_data={
                    "endpoint": "/dataforseo_labs/google/bulk_traffic_estimation/live",
                    "payload": [
                        {
                            "targets": chunk,
                            "location_code": 2840,
                            "language_code": "en",
                        }
                    ],
                },
                provider="dataforseo",
            )
        except Exception as exc:
            logger.error("[PM][BTE] chunk exception: %s", exc, exc_info=True)
            for url in chunk:
                results[url.lower()] = {
                    "status": "api_error",
                    "message": str(exc),
                    "etv": None,
                }
            continue

        status, message, task = _classify_task_response(resp)
        if status != "ok":
            logger.warning("[PM][BTE] %s | %s", status, message)
            for url in chunk:
                results[url.lower()] = {
                    "status": status,
                    "message": message,
                    "etv": None,
                }
            continue

        result_list = (task or {}).get("result") or []
        result = result_list[0] if result_list else {}
        items = result.get("items") or []
        for item in items:
            target = str(item.get("target") or "").strip()
            if not target:
                continue
            metrics = item.get("metrics") or {}
            organic = metrics.get("organic") or {}
            etv = _to_int(organic.get("etv"))
            results[target.lower()] = {
                "status": "ok",
                "message": message,
                "etv": etv,
            }

        for url in chunk:
            results.setdefault(url.lower(), {
                "status": "ok",
                "message": message,
                "etv": None,
            })

    return results


def _extract_keyword_metrics(snapshot: Dict[str, Any]) -> Tuple[int, int]:
    items = snapshot.get("items") or []
    total_count = int(snapshot.get("total_count") or 0)

    keyword_count = total_count or len(items)
    first_page_count = sum(
        1
        for item in items
        if (_to_int(((item.get("ranked_serp_element") or {}).get("serp_item") or {}).get("rank_absolute")) or 999) <= 10
    )

    if not first_page_count:
        organic = (snapshot.get("metrics") or {}).get("organic") or {}
        first_page_count = sum(
            int(organic.get(bucket) or 0)
            for bucket in ("pos_1", "pos_2_3", "pos_4_10")
        )

    return keyword_count, first_page_count


def _extract_rank_from_items(main_keyword: str, items: List[Dict[str, Any]]) -> Union[int, str]:
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

        rank_absolute = _to_int(serp_item.get("rank_absolute"))
        if rank_absolute is None:
            continue

        if best_rank is None or rank_absolute < best_rank:
            best_rank = rank_absolute

    return best_rank if best_rank is not None else "100+"


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
    existing = existing_item or {}
    pm = existing.get("performance_metrics") or existing

    return {
        "currentRanking": pm.get("currentRanking"),
        "ga30DaysTraffic": pm.get("ga30DaysTraffic"),
        "overallKeywords": pm.get("overallKeywords"),
        "firstPageKeywords": pm.get("firstPageKeywords"),
    }


async def extract_performance_metrics_batch(
    items: List[Dict[str, Any]],
    force_refresh: bool = False,
) -> List[Dict[str, Any]]:
    if not items:
        return []

    urls_to_fetch: List[str] = []
    traffic_urls_to_fetch: List[str] = []
    seen_urls: set = set()
    seen_traffic_urls: set = set()

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
        needs_traffic = force_refresh or not _has_numeric_value(item.get("ga30DaysTraffic"))

        if needs_keyword_snapshot and url and url not in seen_urls:
            seen_urls.add(url)
            urls_to_fetch.append(url)

        # bulk_traffic_estimation/live accepts full URLs — returns per-URL ETV.
        if needs_traffic and url and url.lower() not in seen_traffic_urls:
            seen_traffic_urls.add(url.lower())
            traffic_urls_to_fetch.append(url)

    logger.info(
        "[PM][BATCH] Ranked keyword snapshots: %d URL(s) | traffic snapshots: %d URL(s)",
        len(urls_to_fetch),
        len(traffic_urls_to_fetch),
    )

    snapshots, traffic_snapshots = await asyncio.gather(
        _fetch_ranked_keywords_snapshots(urls_to_fetch),
        _fetch_url_traffic_snapshots(traffic_urls_to_fetch),
    )

    output: List[Dict[str, Any]] = []
    keyword_fetched_count = 0
    keyword_rate_limit_count = 0
    keyword_api_error_count = 0
    traffic_fetched_count = 0
    traffic_rate_limit_count = 0
    traffic_api_error_count = 0
    ranking_not_found_count = 0

    for item in items:
        url = item.get("url", "")
        keyword = (item.get("main_keyword") or "").strip()
        domain = _extract_domain(url)
        snapshot = snapshots.get(url)
        traffic_snapshot = traffic_snapshots.get(url.lower())

        current_ranking = item.get("currentRanking")
        traffic = item.get("ga30DaysTraffic")
        overall_keywords = item.get("overallKeywords")
        first_page_keywords = item.get("firstPageKeywords")

        audit_ranking = "FOUND" if _is_valid_ranking(current_ranking) else "SKIPPED-NO-KEYWORD" if not keyword else "PENDING"
        audit_traffic = "FOUND" if _has_numeric_value(traffic) else "PENDING"
        audit_overall = "FOUND" if _has_numeric_value(overall_keywords) else "PENDING"
        audit_first_page = "FOUND" if _has_numeric_value(first_page_keywords) else "PENDING"

        if snapshot:
            status = snapshot.get("status")
            if status == "ok":
                keyword_fetched_count += 1
                ranked_overall, ranked_first_page = _extract_keyword_metrics(snapshot)

                if force_refresh or audit_overall == "PENDING":
                    overall_keywords = ranked_overall
                    audit_overall = "FETCHED" if overall_keywords not in (None, 0) else "FETCHED-ZERO"

                if force_refresh or audit_first_page == "PENDING":
                    first_page_keywords = ranked_first_page
                    audit_first_page = "FETCHED" if first_page_keywords not in (None, 0) else "FETCHED-ZERO"

                # Use URL-level ETV from ranked_keywords/live first (URL-scoped).
                # bulk_traffic_estimation will fill in the rest below.
                if force_refresh or audit_traffic == "PENDING":
                    kw_etv = _to_int(((snapshot.get("metrics") or {}).get("organic") or {}).get("etv"))
                    if kw_etv is not None:
                        traffic = kw_etv
                        audit_traffic = "FETCHED" if kw_etv != 0 else "FETCHED-ZERO"

                if keyword:
                    if force_refresh or audit_ranking == "PENDING":
                        current_ranking = _extract_rank_from_items(keyword, snapshot.get("items") or [])
                        if current_ranking == "100+":
                            ranking_not_found_count += 1
                            audit_ranking = "FETCHED-NOT-RANKING"
                        else:
                            audit_ranking = "FETCHED"
                else:
                    current_ranking = item.get("currentRanking")
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

        if traffic_snapshot:
            traffic_status = traffic_snapshot.get("status")
            if traffic_status == "ok":
                traffic_fetched_count += 1
                # Use bulk_traffic_estimation ETV only when ranked_keywords gave no result.
                if force_refresh or audit_traffic == "PENDING":
                    bte_etv = traffic_snapshot.get("etv")
                    if bte_etv is not None:
                        traffic = bte_etv
                        audit_traffic = "FETCHED" if bte_etv != 0 else "FETCHED-ZERO"
            else:
                if traffic_status == "rate_limit":
                    traffic_rate_limit_count += 1
                    unavailable = "UNAVAILABLE-RATE-LIMIT"
                else:
                    traffic_api_error_count += 1
                    unavailable = "UNAVAILABLE-API"

                if force_refresh or audit_traffic == "PENDING":
                    audit_traffic = unavailable

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
        "  URLs processed:                 %d\n"
        "  Ranked keyword API calls:       %d\n"
        "  Successful keyword snapshots:   %d\n"
        "  Keyword rate-limited:           %d\n"
        "  Keyword API errors:             %d\n"
        "  Traffic API calls:              %d (URL-level)\n"
        "  Successful traffic snapshots:   %d\n"
        "  Traffic rate-limited:           %d\n"
        "  Traffic API errors:             %d\n"
        "  Ranking not found:              %d\n"
        "═══════════════════════════════════════════════════",
        len(items),
        len(urls_to_fetch),
        keyword_fetched_count,
        keyword_rate_limit_count,
        keyword_api_error_count,
        (len(traffic_urls_to_fetch) + 999) // 1000 if traffic_urls_to_fetch else 0,
        traffic_fetched_count,
        traffic_rate_limit_count,
        traffic_api_error_count,
        ranking_not_found_count,
    )

    return output
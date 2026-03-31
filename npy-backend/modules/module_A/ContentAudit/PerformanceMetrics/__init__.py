"""
Performance Metrics Sub-module.

Data sources:
  1. DataForSEO Labs ranked_keywords/live  (fields 3.1, 3.3, 3.4)
     - Call A: no position filter  → total_count = overallKeywords;
               scan items for main keyword → rank_group = currentRanking
     - Call B: rank_absolute <= 10 → total_count = firstPageKeywords

Fields stored:
    currentRanking    – rank_group for the page's main keyword (int or "100+")
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


def _normalize_url_key(url: str) -> str:
    """Normalize URL for matching: strip protocol, www, trailing slash, lowercase."""
    url = str(url or "").strip().lower()
    url = re.sub(r"^https?://", "", url)
    if url.startswith("www."):
        url = url[4:]
    return url.rstrip("/")


async def _ranked_keywords_call(
    target: str,
    *,
    filters: Optional[List] = None,
    limit: int = 1000,
    offset: int = 0,
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
        "offset": offset,
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


async def _fetch_domain_keyword_groups(
    domain: str,
    *,
    force_refresh: bool = False,
    max_total: int = 10000,
) -> Tuple[APIStatus, str, Dict[str, Dict[str, Any]]]:
    """
    Fetch ALL ranked keywords for a domain via paginated calls, then group
    by SERP URL.  Returns (status, message, url_groups) where url_groups maps
    ``normalized_url_key`` → {"overall": int, "first_page": int, "items": [...]}.

    Falls back to empty dict if the domain has more than *max_total* keywords
    (caller should use per-URL calls instead).
    """
    # Probe call to learn total_count
    status, msg, probe = await _ranked_keywords_call(
        domain, limit=1, skip_cache=force_refresh,
    )
    if status != "ok":
        return status, msg, {}

    total = int(probe.get("total_count") or 0)
    if total == 0:
        logger.info("[PM][DOMAIN] %s has 0 keywords", domain)
        return "ok", msg, {}
    if total > max_total:
        logger.info(
            "[PM][DOMAIN] %s has %d keywords (> %d), skipping domain-level aggregation",
            domain, total, max_total,
        )
        return "ok", msg, {}  # caller will fall back

    # Paginate through ALL items
    all_items: List[Dict[str, Any]] = []
    offset = 0
    page_size = 1000
    while offset < total:
        s, m, result = await _ranked_keywords_call(
            domain, limit=page_size, offset=offset, skip_cache=force_refresh,
        )
        if s == "rate_limit":
            return "rate_limit", m, {}
        if s != "ok":
            break
        items = result.get("items") or []
        all_items.extend(items)
        if len(items) < page_size:
            break
        offset += page_size

    logger.info("[PM][DOMAIN] %s  total_count=%d  fetched=%d items in %d pages",
                domain, total, len(all_items), (offset // page_size) + 1)

    # Group by SERP URL
    url_groups: Dict[str, Dict[str, Any]] = {}
    for item in all_items:
        serp = (item.get("ranked_serp_element") or {}).get("serp_item") or {}
        serp_url = (serp.get("url") or "").strip()
        if not serp_url:
            continue

        key = _normalize_url_key(serp_url)
        if key not in url_groups:
            url_groups[key] = {"overall": 0, "first_page": 0, "items": []}

        url_groups[key]["overall"] += 1
        url_groups[key]["items"].append(item)

        rank_group = serp.get("rank_group")
        if rank_group is not None:
            try:
                if int(rank_group) <= 10:
                    url_groups[key]["first_page"] += 1
            except (TypeError, ValueError):
                pass

    logger.info("[PM][DOMAIN] %s  unique URLs in SERP data: %d", domain, len(url_groups))
    return "ok", msg, url_groups


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

    # ── Group input URLs by domain ───────────────────────────────────────
    domain_urls: Dict[str, List[str]] = {}
    for item in items:
        url = item.get("url", "")
        if not url:
            continue
        domain = _extract_domain(url)
        if domain:
            domain_urls.setdefault(domain, []).append(url)

    # ── Fetch domain-level keyword groups (paginated, ~5 calls per domain) ─
    domain_groups: Dict[str, Dict[str, Dict[str, Any]]] = {}
    domain_statuses: Dict[str, APIStatus] = {}
    for domain, urls in domain_urls.items():
        status, msg, groups = await _fetch_domain_keyword_groups(
            domain, force_refresh=force_refresh,
        )
        domain_statuses[domain] = status
        if groups:
            domain_groups[domain] = groups

    total_api_urls = sum(len(g) for g in domain_groups.values())
    logger.info(
        "[PM][BATCH] domain-level aggregation: %d domain(s), %d unique SERP URLs found",
        len(domain_groups),
        total_api_urls,
    )

    # ── Build output ─────────────────────────────────────────────────────
    output: List[Dict[str, Any]] = []
    keyword_fetched_count = 0
    keyword_rate_limit_count = 0
    keyword_api_error_count = 0
    ranking_not_found_count = 0

    for item in items:
        url = item.get("url", "")
        keyword = (item.get("main_keyword") or "").strip()
        domain = _extract_domain(url)
        url_key = _normalize_url_key(url)

        current_ranking = item.get("currentRanking")
        overall_keywords = item.get("overallKeywords")
        first_page_keywords = item.get("firstPageKeywords")

        audit_ranking = (
            "FOUND" if _is_valid_ranking(current_ranking)
            else "SKIPPED-NO-KEYWORD" if not keyword
            else "PENDING"
        )
        audit_overall = "FOUND" if _has_numeric_value(overall_keywords) else "PENDING"
        audit_first_page = "FOUND" if _has_numeric_value(first_page_keywords) else "PENDING"

        domain_status = domain_statuses.get(domain, "api_error")

        if domain_status == "rate_limit":
            keyword_rate_limit_count += 1
            unavailable = "UNAVAILABLE-RATE-LIMIT"
            if force_refresh or audit_overall == "PENDING":
                audit_overall = unavailable
            if force_refresh or audit_first_page == "PENDING":
                audit_first_page = unavailable
            if keyword and (force_refresh or audit_ranking == "PENDING"):
                audit_ranking = unavailable
        elif domain_status != "ok":
            keyword_api_error_count += 1
            unavailable = "UNAVAILABLE-API"
            if force_refresh or audit_overall == "PENDING":
                audit_overall = unavailable
            if force_refresh or audit_first_page == "PENDING":
                audit_first_page = unavailable
            if keyword and (force_refresh or audit_ranking == "PENDING"):
                audit_ranking = unavailable
        elif domain in domain_groups:
            # Domain was fetched successfully — look up this URL
            url_group = domain_groups[domain].get(url_key)
            keyword_fetched_count += 1

            if url_group:
                if force_refresh or audit_overall == "PENDING":
                    overall_keywords = url_group["overall"]
                    audit_overall = "FETCHED" if overall_keywords else "FETCHED-ZERO"

                if force_refresh or audit_first_page == "PENDING":
                    first_page_keywords = url_group["first_page"]
                    audit_first_page = "FETCHED" if first_page_keywords else "FETCHED-ZERO"

                if keyword and (force_refresh or audit_ranking == "PENDING"):
                    current_ranking = _extract_rank_from_items(keyword, url_group.get("items") or [])
                    if current_ranking == "100+":
                        ranking_not_found_count += 1
                        audit_ranking = "FETCHED-NOT-RANKING"
                    else:
                        audit_ranking = "FETCHED"
                elif not keyword:
                    audit_ranking = "SKIPPED-NO-KEYWORD"
            else:
                # URL not present in any SERP data — genuinely has 0 keywords
                if force_refresh or audit_overall == "PENDING":
                    overall_keywords = 0
                    audit_overall = "FETCHED-ZERO"
                if force_refresh or audit_first_page == "PENDING":
                    first_page_keywords = 0
                    audit_first_page = "FETCHED-ZERO"
                if keyword and (force_refresh or audit_ranking == "PENDING"):
                    current_ranking = "100+"
                    ranking_not_found_count += 1
                    audit_ranking = "FETCHED-NOT-RANKING"
                elif not keyword:
                    audit_ranking = "SKIPPED-NO-KEYWORD"

        output.append(
            {
                "url": url,
                "domain": domain,
                "main_keyword": keyword,
                "currentRanking": current_ranking,
                "overallKeywords": _to_int(overall_keywords),
                "firstPageKeywords": _to_int(first_page_keywords),
                "audit_log": {
                    "currentRanking": audit_ranking,
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
        "  Keyword data resolved (ok):    %d\n"
        "  Keyword rate-limited:          %d\n"
        "  Keyword API errors:            %d\n"
        "  Ranking not found (100+):      %d\n"
        "═══════════════════════════════════════════════════",
        len(items),
        keyword_fetched_count,
        keyword_rate_limit_count,
        keyword_api_error_count,
        ranking_not_found_count,
    )

    return output
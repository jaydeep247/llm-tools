"""
Performance Metrics Sub-module.

Data Source: DataForSEO Labs — ranked_keywords/live

Two-tier fetch strategy
───────────────────────
Tier 1 — Domain batch (efficiency)
    One paginated call with target=<bare-domain> fetches ALL keywords the domain
    ranks for.  Each item carries the URL of the page that ranked (serp_item.url).
    We group items by that URL → per-URL overall / first-page counts + items for
    rank lookup.  Covers every page that is the domain's best result for ≥1 keyword.

Tier 2 — Per-URL targeted call (accuracy for pages NOT found in tier 1)
    A page that ranks but is never the domain's *best* result for any keyword
    (e.g. another blog post on the same site always ranks higher) will be absent
    from the tier-1 groups.  For such pages we call ranked_keywords/live with
    target=<domain/path-segment> — DataForSEO returns keywords for that specific
    page regardless of other domain pages.

    Key fixes vs old fallback
    • Try WITHOUT trailing slash first, then WITH (DataForSEO canonical form is
      usually no-trailing-slash; the previous code tried *with* slash first → 0).
    • After receiving items, verify whether the API returned per-URL or domain-wide
      data by comparing serp_item.url values against the requested URL.
    • If per-URL: total_count is the accurate overallKeywords.
    • If domain-wide (all items point to other pages): skip this variant and try
      the next URL-target form.
    • If mixed (some items match): count matching items as overallKeywords
      (conservative but correct; no domain inflation).

Fields stored
─────────────
    currentRanking    – rank_group for the page's main keyword (int | "100+")
    overallKeywords   – keywords this specific page ranks for on Google
    firstPageKeywords – subset where rank_group ≤ 10
"""

import asyncio
import logging
import re
from typing import Any, Dict, List, Literal, Optional, Tuple, Union
from urllib.parse import urlsplit

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


def _normalize_url_key(url: str) -> str:
    """
    Canonical string key for a URL used in dict lookups.

    Strips: protocol, www., query string, fragment, trailing slash.
    Lowercases everything so matching is case-insensitive.
    """
    url = str(url or "").strip().lower()
    url = re.sub(r"^https?://", "", url)
    if url.startswith("www."):
        url = url[4:]
    url = url.split("#")[0]
    url = url.split("?")[0]
    return url.rstrip("/")


def _url_to_targets(url: str) -> List[str]:
    """
    Build ordered list of DataForSEO-compatible targets for a crawled URL.

    Rules
    ─────
    • No protocol prefix  (attrock.com/blog/post, NOT https://attrock.com/blog/post)
    • www. stripped       (attrock.com, NOT www.attrock.com)
    • For page URLs: WITHOUT trailing slash first, then WITH trailing slash.
      DataForSEO canonical form is no-trailing-slash; trying that first avoids
      the "total_count=0 because exact target not found" failure.
    • For root / homepage: bare domain only (returns domain-wide data — handled
      separately in domain-level tier).
    """
    raw = str(url or "").strip()
    if not raw:
        return []

    parts = urlsplit(raw)
    host = (parts.netloc or "").strip()
    path = (parts.path or "").strip()

    if not host:
        # No scheme parsed — strip protocol manually
        stripped = re.sub(r"^https?://", "", raw)
        host = stripped.split("/")[0]
        rest = stripped[len(host):]
        path = rest or ""

    bare_host = host.lower().removeprefix("www.")

    if not path or path == "/":
        return [bare_host]

    # Page URL: prefer no-trailing-slash (DataForSEO canonical), then with slash
    path_no_slash = path.rstrip("/")
    path_with_slash = path_no_slash + "/"

    targets: List[str] = []
    seen: set = set()
    for p in [path_no_slash, path_with_slash]:
        t = f"{bare_host}{p}"
        if t not in seen:
            seen.add(t)
            targets.append(t)
    return targets


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
        logger.warning("[PM][LABS] API %s for target=%s: %s", status, target, message)
        return status, message, {}

    result_list = (task or {}).get("result") or []
    result = result_list[0] if result_list else {}
    tc = result.get("total_count")
    ic = result.get("items_count")
    logger.debug("[PM][LABS] target=%s total_count=%s items_count=%s", target, tc, ic)
    return "ok", message, result


def _build_serp_url(serp: Dict[str, Any]) -> str:
    """
    FIX: DataForSEO serp_item does NOT have a 'url' field.
    Build the full URL from 'main_domain' + 'relative_url' instead.
    """
    # Try direct url field first (future-proofing)
    direct = (serp.get("url") or "").strip()
    if direct:
        return direct

    main_domain = (serp.get("main_domain") or "").strip()
    relative_url = (serp.get("relative_url") or "").strip()

    if not main_domain:
        return ""

    # relative_url may be empty for root domain pages
    if not relative_url or relative_url == "/":
        return f"https://{main_domain}"

    # Ensure relative_url starts with /
    if not relative_url.startswith("/"):
        relative_url = f"/{relative_url}"

    return f"https://{main_domain}{relative_url}"


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
    last_result: Optional[Dict[str, Any]] = None  # FIX: track last result for metrics

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
        last_result = result  # FIX: keep updating last_result each page
        if len(items) < page_size:
            break
        offset += page_size

    logger.info("[PM][DOMAIN] %s  total_count=%d  fetched=%d items in %d pages",
                domain, total, len(all_items), (offset // page_size) + 1)

    # Group by SERP URL
    # FIX: use _build_serp_url() instead of serp.get("url") which is always empty
    url_groups: Dict[str, Dict[str, Any]] = {}
    for item in all_items:
        serp = (item.get("ranked_serp_element") or {}).get("serp_item") or {}

        serp_url = _build_serp_url(serp)  # FIX: was serp.get("url") → always empty
        if not serp_url:
            continue

        key = _normalize_url_key(serp_url)
        if key not in url_groups:
            url_groups[key] = {"overall": 0, "first_page": 0, "items": []}

        url_groups[key]["overall"] += 1
        url_groups[key]["items"].append(item)

        rank_absolute = serp.get("rank_absolute")
        if rank_absolute is not None:
            try:
                if int(rank_absolute) <= 10:
                    url_groups[key]["first_page"] += 1
            except (TypeError, ValueError):
                pass

    logger.info("[PM][DOMAIN] %s  unique URLs in SERP data: %d", domain, len(url_groups))

    # FIX: Read domain-level metrics from last_result (full paginated data),
    # NOT from probe (limit=1 probe metrics are unreliable / partial).
    metrics_source = last_result if last_result else probe
    probe_organic = (metrics_source.get("metrics") or {}).get("organic") or {}
    domain_overall = int(probe_organic.get("count") or total)
    domain_first_page = (
        int(probe_organic.get("pos_1") or 0)
        + int(probe_organic.get("pos_2_3") or 0)
        + int(probe_organic.get("pos_4_10") or 0)
    )

    url_groups["__domain__"] = {
        "overall": domain_overall,
        "first_page": domain_first_page,
        "items": all_items,   # full item list for keyword rank lookup
    }

    return "ok", msg, url_groups


async def _fetch_per_url_data(
    url: str,
    main_keyword: str,
    *,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    Per-URL ranked_keywords/live call for pages NOT found in tier-1 domain data.

    Strategy
    ────────
    Call ranked_keywords/live with the page URL as target (no protocol prefix,
    no www).  DataForSEO returns keyword data scoped to that target.

    Fields are read from the `metrics.organic` object — NOT from counting or
    filtering items by serp_item.url:

      overallKeywords   = metrics.organic.count
      firstPageKeywords = metrics.organic.pos_1 + pos_2_3 + pos_4_10
      currentRanking    = rank_absolute for the main keyword in items[]

    Why metrics.organic and NOT item counting?
    • For a page URL target (e.g. attrock.com/blog/category/ai), DataForSEO
      returns keywords for that target path.  The items[] show the SERP
      element that ranked — which for category/archive pages is typically the
      best post under that path, not the category page itself.  Filtering
      items by serp_item.url == category_page would return 0 and falsely
      conclude the page doesn't rank at all.
    • metrics.organic.count is authoritative: it is the total keyword count
      DataForSEO has on record for that exact target, regardless of which
      SERP element appeared in the returned sample.

    Tries target variants WITHOUT trailing slash first (DataForSEO canonical
    form), then WITH trailing slash.  Returns the first variant that yields
    metrics.organic.count > 0.
    """
    targets = _url_to_targets(url)
    if not targets:
        return {}

    for target in targets:
        if "/" not in target:
            # Bare-domain target: tier-1 normally covers this, but if we reach
            # here (e.g. tier-1 returned empty) call the API and read
            # metrics.organic directly — no per-item URL matching needed.
            logger.info("[PM][URL-FALLBACK] Bare-domain target=%r url=%s", target, url)
            status, _, result = await _ranked_keywords_call(
                target, limit=1, skip_cache=force_refresh,
            )
            if status == "rate_limit":
                return {"_status": "rate_limit"}
            if status == "ok" and result:
                organic = (result.get("metrics") or {}).get("organic") or {}
                overall = int(
                    organic.get("count") or result.get("total_count") or 0
                )
                if overall > 0:
                    first_page = (
                        int(organic.get("pos_1") or 0)
                        + int(organic.get("pos_2_3") or 0)
                        + int(organic.get("pos_4_10") or 0)
                    )
                    items = result.get("items") or []
                    current_ranking = (
                        _extract_rank_from_items(main_keyword, items)
                        if main_keyword else "100+"
                    )
                    logger.info(
                        "[PM][URL-FALLBACK] bare-domain target=%r  overall=%d  "
                        "first_page=%d  ranking=%s",
                        target, overall, first_page, current_ranking,
                    )
                    return {
                        "overall": overall,
                        "first_page": first_page,
                        "items": items,
                        "current_ranking": current_ranking,
                    }
            continue

        logger.info("[PM][URL-FALLBACK] Trying per-URL call for target=%r url=%s", target, url)
        status, _, result = await _ranked_keywords_call(
            target, limit=1000, skip_cache=force_refresh,
        )
        if status == "rate_limit":
            logger.warning("[PM][URL-FALLBACK] rate-limited for target=%r", target)
            return {"_status": "rate_limit"}
        if status != "ok" or not result:
            logger.info("[PM][URL-FALLBACK] No data for target=%r status=%s", target, status)
            continue

        # ── Read counts from metrics.organic (authoritative per-target counts) ─
        organic = (result.get("metrics") or {}).get("organic") or {}
        overall = int(organic.get("count") or 0)

        if overall == 0:
            # Also check total_count as a fallback sentinel (both should agree)
            overall = int(result.get("total_count") or 0)

        if overall == 0:
            logger.info("[PM][URL-FALLBACK] target=%r  count=0, trying next variant", target)
            continue

        first_page = (
            int(organic.get("pos_1") or 0)
            + int(organic.get("pos_2_3") or 0)
            + int(organic.get("pos_4_10") or 0)
        )

        items = result.get("items") or []
        current_ranking = (
            _extract_rank_from_items(main_keyword, items)
            if main_keyword
            else "100+"
        )

        logger.info(
            "[PM][URL-FALLBACK] target=%r  overall=%d  first_page=%d  ranking=%s",
            target, overall, first_page, current_ranking,
        )
        return {
            "overall": overall,
            "first_page": first_page,
            "items": items,
            "current_ranking": current_ranking,
        }

    logger.info("[PM][URL-FALLBACK] No rankings found for url=%s after all variants", url)
    return {}


def _extract_rank_from_items(main_keyword: str, items: List[Dict[str, Any]]) -> Union[int, str]:
    """
    Scan ranked_keywords items for the main keyword.
    Returns rank_absolute (actual SERP position 1–100) if found, else "100+".

    Searches both keyword_data.keyword and keyword_properties.core_keyword.
    Uses rank_absolute per DataForSEO docs (actual position across all types).
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

        # Use rank_absolute: the actual SERP position (1–100) across all types
        rank_absolute = _to_int(serp_item.get("rank_absolute"))
        if rank_absolute is None:
            continue

        if best_rank is None or rank_absolute < best_rank:
            best_rank = rank_absolute

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

    # ── URL-level fallback for any URL not found in domain data ──────────
    # Collect every URL that the domain call missed (i.e. not in domain_groups)
    # and fire concurrent ranked_keywords/live calls per URL.
    _missed_urls: List[str] = []
    for item in items:
        url = item.get("url", "")
        if not url:
            continue
        domain = _extract_domain(url)
        if domain_statuses.get(domain) != "ok":
            continue  # rate-limit / api error — skip fallback too
        url_key = _normalize_url_key(url)
        # If the domain has groups but this URL is missing, queue the fallback
        if domain in domain_groups and url_key not in domain_groups[domain]:
            _missed_urls.append(url)
        # If the domain has NO groups (0 results), try URL-level too
        elif domain not in domain_groups:
            _missed_urls.append(url)

    # Concurrently fetch URL-level data (cap at 5 parallel to avoid rate-limit)
    _url_fallback_results: Dict[str, Dict[str, Any]] = {}
    if _missed_urls:
        _semaphore = asyncio.Semaphore(5)

        async def _bounded_url_lookup(url: str, keyword: str) -> tuple:
            async with _semaphore:
                result = await _fetch_per_url_data(url, keyword, force_refresh=force_refresh)
                return url, result

        keyword_map = {item["url"]: (item.get("main_keyword") or "").strip() for item in items if item.get("url")}
        tasks = [_bounded_url_lookup(u, keyword_map.get(u, "")) for u in _missed_urls]
        resolved = await asyncio.gather(*tasks, return_exceptions=True)
        for entry in resolved:
            if isinstance(entry, Exception):
                logger.warning("[PM][URL-FALLBACK] gather exception: %s", entry)
                continue
            fb_url, fb_data = entry
            if fb_data:
                _url_fallback_results[_normalize_url_key(fb_url)] = fb_data

    logger.info(
        "[PM][BATCH] URL-level fallback: %d missed → %d resolved",
        len(_missed_urls), len(_url_fallback_results),
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
            # Domain was fetched successfully and has keyword data — look up this URL
            url_group = domain_groups[domain].get(url_key)
            # Root domain URL (e.g. attrock.com): sub-pages rank for keywords,
            # so the root key is never in the item groupings.  Fall back to the
            # pre-computed domain-level totals stored under "__domain__".
            if url_group is None and url_key == domain:
                url_group = domain_groups[domain].get("__domain__")
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
                # URL not in domain SERP data — check per-URL fallback result
                fb = _url_fallback_results.get(url_key)
                if fb and fb.get("_status") == "rate_limit":
                    keyword_rate_limit_count += 1
                    unavailable = "UNAVAILABLE-RATE-LIMIT"
                    if force_refresh or audit_overall == "PENDING":
                        audit_overall = unavailable
                    if force_refresh or audit_first_page == "PENDING":
                        audit_first_page = unavailable
                    if keyword and (force_refresh or audit_ranking == "PENDING"):
                        audit_ranking = unavailable
                elif fb:
                    if force_refresh or audit_overall == "PENDING":
                        overall_keywords = fb["overall"]
                        audit_overall = "FETCHED-URL-FALLBACK" if overall_keywords else "FETCHED-ZERO"
                    if force_refresh or audit_first_page == "PENDING":
                        first_page_keywords = fb["first_page"]
                        audit_first_page = "FETCHED-URL-FALLBACK" if first_page_keywords else "FETCHED-ZERO"
                    if keyword and (force_refresh or audit_ranking == "PENDING"):
                        current_ranking = fb["current_ranking"]
                        if current_ranking == "100+":
                            ranking_not_found_count += 1
                            audit_ranking = "FETCHED-NOT-RANKING"
                        else:
                            audit_ranking = "FETCHED-URL-FALLBACK"
                    elif not keyword:
                        audit_ranking = "SKIPPED-NO-KEYWORD"
                else:
                    # Genuinely no rankings found anywhere for this URL
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

        elif domain_status == "ok":
            # Domain API succeeded but returned 0 keywords domain-wide:
            # this page might still rank; check per-URL fallback.
            keyword_fetched_count += 1
            fb = _url_fallback_results.get(url_key)
            if fb and fb.get("_status") == "rate_limit":
                keyword_rate_limit_count += 1
                unavailable = "UNAVAILABLE-RATE-LIMIT"
                if force_refresh or audit_overall == "PENDING":
                    audit_overall = unavailable
                if force_refresh or audit_first_page == "PENDING":
                    audit_first_page = unavailable
                if keyword and (force_refresh or audit_ranking == "PENDING"):
                    audit_ranking = unavailable
            elif fb:
                if force_refresh or audit_overall == "PENDING":
                    overall_keywords = fb["overall"]
                    audit_overall = "FETCHED-URL-FALLBACK" if overall_keywords else "FETCHED-ZERO"
                if force_refresh or audit_first_page == "PENDING":
                    first_page_keywords = fb["first_page"]
                    audit_first_page = "FETCHED-URL-FALLBACK" if first_page_keywords else "FETCHED-ZERO"
                if keyword and (force_refresh or audit_ranking == "PENDING"):
                    current_ranking = fb["current_ranking"]
                    if current_ranking == "100+":
                        ranking_not_found_count += 1
                        audit_ranking = "FETCHED-NOT-RANKING"
                    else:
                        audit_ranking = "FETCHED-URL-FALLBACK"
                elif not keyword:
                    audit_ranking = "SKIPPED-NO-KEYWORD"
            else:
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
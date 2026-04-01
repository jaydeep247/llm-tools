"""
Backlink Metrics Sub-module

Extracts 8 backlink-related fields per URL in two separate phases:

  Crawl-time  (synchronous, zero API cost)
  ──────────────────────────────────────────
  2. internal_outlinks          – links from this page to same domain
  3. external_outlinks          – links from this page to other domains
  4. internal_external_ratio    – internal / external  (target ≥ 4.0)

  Post-crawl  (async, DataForSEO API)
  ──────────────────────────────────────────
  1. inlinks                    – internal pages linking TO this URL
  5. pr_score                   – DataForSEO page-level rank
  6. current_ref_domains        – unique external domains linking here
  7. min_required_ref_domains   – median RDs of top-10 SERP competitors
  8. need_to_acquire_ref_domains – gap to be competitive (can be negative)

Public API
──────────
  extract_crawltime_backlink_fields()   – call once per page during crawl
  extract_backlink_metrics_batch()      – call once per job after crawl
  compute_inlinks_for_batch()           – utility used by batch function
"""
import asyncio
import logging
import re
import statistics
from collections import defaultdict
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode, urljoin

from bs4 import BeautifulSoup

try:
    from orchestrator.checkpoint.executor import execute_task
except ImportError:
    execute_task = None

logger = logging.getLogger(__name__)

# Tracking query parameters stripped during normalisation
_TRACKING_PARAMS = frozenset({
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "utm_source_platform", "utm_creative_format", "utm_marketing_tactic",
    "fbclid", "gclid", "gclsrc", "dclid", "msclkid", "twclid",
    "mc_cid", "mc_eid", "oly_anon_id", "oly_enc_id",
    "vero_id", "vero_conv", "_hsenc", "_hsmi", "hsa_cam",
    "ref", "ref_src",
})

# ── Per-process keyword → min_required_rds cache ──────────────────────────────
_MIN_RDS_CACHE: Dict[str, int] = {}

def _normalize_url_for_api(url: Any) -> str:
    """Canonical normalisation for API lookups and the inlink graph.

    Steps: strip whitespace, lowercase host, https scheme, remove
    fragment, strip tracking params, collapse double-slashes, strip
    trailing slash.
    """
    if url is None:
        return ""
    u = str(url).strip()
    if not u:
        return ""
    try:
        parsed = urlparse(u)
        scheme = "https"
        netloc = (parsed.netloc or "").lower()
        path = re.sub(r'/+', '/', parsed.path) if parsed.path else '/'
        if path != '/' and path.endswith('/'):
            path = path[:-1]
        if parsed.query:
            kept = {
                k: v
                for k, v in parse_qs(parsed.query, keep_blank_values=True).items()
                if k.lower() not in _TRACKING_PARAMS
            }
            query = urlencode(kept, doseq=True) if kept else ""
        else:
            query = ""
        u = urlunparse((scheme, netloc, path, parsed.params, query, ''))
    except Exception:
        if u.endswith('/') and len(u) > 1:
            u = u[:-1]
    return u


# ── HTML link extraction (fallback when spider data is unavailable) ────────────


def _normalize_for_inlinks(raw_url: Any, base_url: str = "", base_domain: str = "") -> Optional[str]:
    """Normalise a URL for inlink graph construction.

    Unlike _normalize_url_for_api (which keeps non-tracking query params),
    this strips ALL query params and fragments to maximise inlink matching.

    Steps: resolve relative → absolute, filter external, strip fragment,
    strip ALL query params, normalise scheme to https, lowercase, collapse
    double-slashes, strip trailing slash.
    """
    if raw_url is None:
        return None
    u = str(raw_url).strip()
    if not u:
        return None
    try:
        # Step 1: Resolve relative → absolute
        if base_url:
            absolute = urljoin(base_url, u)
        else:
            absolute = u

        # Step 2: Filter external
        if base_domain:
            bd_parsed = urlparse(base_domain)
            bd_netloc = (bd_parsed.netloc or "").lower()
            bd_netloc = bd_netloc.replace("www.", "", 1) if bd_netloc.startswith("www.") else bd_netloc
            abs_parsed_tmp = urlparse(absolute)
            abs_netloc = (abs_parsed_tmp.netloc or "").lower()
            abs_netloc = abs_netloc.replace("www.", "", 1) if abs_netloc.startswith("www.") else abs_netloc
            if abs_netloc != bd_netloc and not abs_netloc.endswith("." + bd_netloc):
                return None

        parsed = urlparse(absolute)
        scheme = "https"
        netloc = (parsed.netloc or "").lower()
        # Strip www. so www.example.com and example.com resolve to same key
        netloc = netloc.replace("www.", "", 1) if netloc.startswith("www.") else netloc
        path = re.sub(r'/+', '/', parsed.path) if parsed.path else '/'

        # Build clean URL: scheme + host + path only (no query, no fragment)
        clean = f"{scheme}://{netloc}{path}"
        clean = clean.lower()

        # Strip trailing slash (keep root "/" as-is)
        root = f"{scheme}://{netloc}/"
        if clean != root:
            clean = clean.rstrip("/")

        return clean
    except Exception:
        return None

def _extract_links_from_html(html_content: str) -> List[str]:
    """Return all href values from anchor tags."""
    if not html_content:
        return []
    try:
        soup = BeautifulSoup(html_content, "html.parser")
        return [a["href"] for a in soup.find_all("a", href=True)]
    except Exception as exc:
        logger.debug("Link extraction failed: %s", exc)
        return []


def _compute_outlinks(links: List[str], site_domain: str) -> tuple:
    """
    Split raw href list into internal / external counts.
    Returns (internal_outlinks, external_outlinks, internal_url_list).

    Uses _normalize_url_for_api for full canonical normalisation (scheme,
    host case, trailing slash, fragments, tracking params).
    """
    raw_netloc = urlparse(site_domain).netloc
    site_netloc = raw_netloc.replace('www.', '', 1) if raw_netloc.startswith('www.') else raw_netloc
    site_netloc = site_netloc.lower()

    internal_urls: set = set()
    external_urls: set = set()

    for link in links:
        link = link.strip()
        if not link:
            continue
        try:
            norm_link = _normalize_url_for_api(link)
            if not norm_link:
                continue
            parsed = urlparse(norm_link)
            netloc_norm = (parsed.netloc or "").lower()
            netloc_norm = netloc_norm.replace('www.', '', 1) if netloc_norm.startswith('www.') else netloc_norm
            if netloc_norm in ('', site_netloc):
                internal_urls.add(norm_link)
            else:
                external_urls.add(norm_link)
        except Exception:
            pass

    return len(internal_urls), len(external_urls), list(internal_urls)


def _compute_internal_external_ratio(
    internal_outlinks: int,
    external_outlinks: int,
) -> Optional[float]:
    """internal / external ratio. Returns None when external_outlinks == 0."""
    if not external_outlinks:
        return None
    return round(internal_outlinks / external_outlinks, 2)


# ── Inlink graph (post-crawl) ──────────────────────────────────────────────────

def compute_inlinks_for_batch(
    all_items: List[Dict[str, Any]],
    redirect_map: Optional[Dict[str, str]] = None,
    sitemap_urls: Optional[List[str]] = None,
) -> Dict[str, int]:
    """
    Build a full inlink graph from all crawled items.
    Returns {normalized_target_url: inlink_count}.

    Improvements:
    - Uses _normalize_for_inlinks to strip ALL query params / fragments
      so URL variants resolve to the same node.
    - Builds a canonical_map from each item's canonical_url and resolves
      targets through it so inlinks attribute to the canonical page.
    - Applies redirect_map so inlinks target the final destination URL.
    - Pre-initialises every crawled URL (ensures orphan pages get 0).
    - Pre-seeds sitemap-discovered URLs (orphan detection for uncrawled pages).
    - Uses sets for source deduplication (prevents inflated counts).
    - Self-links are excluded.
    """
    # Derive base_domain from first item
    base_domain = ""
    for item in all_items:
        url = item.get("url", "")
        if url:
            p = urlparse(url)
            base_domain = f"https://{(p.netloc or '').lower()}"
            break

    # ── Build canonical map: {normalised_page_url: normalised_canonical_url}
    canonical_map: Dict[str, str] = {}
    for item in all_items:
        source_url = item.get("url", "")
        canonical_url = item.get("canonical_url") or ""
        if canonical_url and source_url:
            norm_source = _normalize_for_inlinks(source_url, base_domain=base_domain)
            norm_canonical = _normalize_for_inlinks(
                canonical_url, base_url=source_url, base_domain=base_domain,
            )
            if norm_source and norm_canonical and norm_source != norm_canonical:
                canonical_map[norm_source] = norm_canonical

    # ── Initialise inlink map with all crawled URLs
    link_graph: Dict[str, set] = {}
    for item in all_items:
        norm_url = _normalize_for_inlinks(item.get("url", ""), base_domain=base_domain)
        if norm_url:
            link_graph[norm_url] = set()

    # ── Pre-seed sitemap-discovered URLs (Fix 6) ──────────────────────
    # Pages in sitemap but never linked from crawled pages start at 0 (Orphan)
    if sitemap_urls:
        seeded = 0
        for smap_url in sitemap_urls:
            norm_smap = _normalize_for_inlinks(smap_url, base_domain=base_domain)
            if norm_smap and norm_smap not in link_graph:
                link_graph[norm_smap] = set()
                seeded += 1
        logger.debug("[INLINK-DEBUG] sitemap_urls seeded=%d", seeded)

    # ── Normalise redirect_map keys/values for consistent matching ────
    norm_redirect_map: Dict[str, str] = {}
    if redirect_map:
        for orig, final in redirect_map.items():
            norm_orig = _normalize_for_inlinks(orig, base_domain=base_domain)
            norm_final = _normalize_for_inlinks(final, base_domain=base_domain)
            if norm_orig and norm_final and norm_orig != norm_final:
                norm_redirect_map[norm_orig] = norm_final

    logger.debug(
        "[INLINK-DEBUG] compute_inlinks_for_batch | items=%d | "
        "base_domain='%s' | canonical_overrides=%d | redirect_overrides=%d | "
        "graph_init_keys=%d",
        len(all_items), base_domain, len(canonical_map),
        len(norm_redirect_map), len(link_graph),
    )

    # ── Build the graph
    total_outlinks_processed = 0
    targets_matched = 0
    targets_missed = 0
    targets_filtered_external = 0
    targets_self_skipped = 0
    for item in all_items:
        source = _normalize_for_inlinks(item.get("url", ""), base_domain=base_domain)
        if not source:
            continue
        for target in item.get("outlink_url_list") or []:
            total_outlinks_processed += 1
            norm_target = _normalize_for_inlinks(
                target, base_url=source, base_domain=base_domain,
            )
            if not norm_target:
                targets_filtered_external += 1
                continue
            # Resolve canonical — attribute link to canonical target,
            # but fall back to original if canonical target wasn't crawled
            resolved = canonical_map.get(norm_target, norm_target)
            final_target = resolved if resolved in link_graph else norm_target
            # Resolve redirects — attribute link to final destination (Fix 4)
            final_target = norm_redirect_map.get(final_target, final_target)
            if final_target == source:
                targets_self_skipped += 1
            elif final_target in link_graph:
                link_graph[final_target].add(source)
                targets_matched += 1
            else:
                targets_missed += 1

    logger.debug(
        "[INLINK-DEBUG] graph_build_done | outlinks_processed=%d | "
        "matched=%d | missed_not_in_graph=%d | filtered_external=%d | "
        "self_skipped=%d",
        total_outlinks_processed, targets_matched, targets_missed,
        targets_filtered_external, targets_self_skipped,
    )

    result = {url: len(sources) for url, sources in link_graph.items()}
    nonzero = sum(1 for c in result.values() if c > 0)
    logger.debug(
        "[INLINK-DEBUG] final_result | total_keys=%d | nonzero=%d",
        len(result), nonzero,
    )

    if targets_missed > 0:
        # Log a sample miss for debugging
        for item in all_items:
            source = _normalize_for_inlinks(item.get("url", ""), base_domain=base_domain)
            if not source:
                continue
            for target in item.get("outlink_url_list") or []:
                norm_target = _normalize_for_inlinks(
                    target, base_url=source, base_domain=base_domain,
                )
                if norm_target and norm_target not in link_graph:
                    resolved = canonical_map.get(norm_target, norm_target)
                    logger.warning(
                        "[INLINK-DEBUG] SAMPLE MISS | raw='%s' norm='%s' "
                        "resolved='%s' in_graph=%s | graph_sample=%s",
                        target, norm_target, resolved,
                        resolved in link_graph,
                        list(link_graph.keys())[:3],
                    )
                    break
            else:
                continue
            break

    return result


# ── DataForSEO helpers ─────────────────────────────────────────────────────────

async def _fetch_backlinks_summary(urls: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Batch-fetch PR score and referring domains via DataForSEO Backlinks Summary.
    Sends up to 100 URLs per API call.
    Returns {url: {"rank": int, "referring_domains": int}}.
    """
    if not execute_task:
        logger.warning("[BM] execute_task unavailable – skipping backlinks summary.")
        return {}
    if not urls:
        return {}

    results: Dict[str, Dict[str, Any]] = {}

    for i in range(0, len(urls), 100):
        chunk_raw = urls[i : i + 100]
        chunk = [_normalize_url_for_api(u) for u in chunk_raw]
        chunk = [u for u in chunk if u]
        payload = [{"target": u, "target_type": "page"} for u in chunk]

        try:
            resp = await execute_task(
                task_name="backlinks_summary",
                input_data={
                    "endpoint": "/backlinks/summary/live",
                    "payload": payload,
                },
                provider="dataforseo",
            )
            if not (resp and resp.success):
                logger.warning(
                    "[BM] Backlinks summary call failed: %s",
                    resp.error if resp else "no response",
                )
                continue

            for task_item in (resp.data or {}).get("tasks", []):
                result_list = task_item.get("result") or []
                if not result_list:
                    continue
                r = result_list[0]

                # DataForSEO usually puts the requested target in task_item.target.
                # Using r.get("target") often yields '' for this endpoint.
                target_url = (
                    task_item.get("target")
                    or task_item.get("url")
                    or r.get("target")
                    or ""
                )
                target_url = _normalize_url_for_api(target_url)
                if not target_url:
                    continue

                results[target_url] = {
                    "rank": r.get("rank", 0) or 0,
                    "referring_domains": r.get("referring_domains", 0) or 0,
                }
        except Exception as exc:
            logger.error("[BM] Backlinks summary exception: %s", exc, exc_info=True)

    return results


async def _fetch_min_required_rds(keyword: str) -> Optional[int]:
    """
    Fetch the median referring-domains count of the top-10 SERP competitors
    for *keyword*.  Result is cached so each unique keyword costs one call.
    """
    if not execute_task:
        logger.warning("[BM] execute_task unavailable – cannot compute min_required_rds.")
        return None
    if not keyword:
        return None
    if keyword in _MIN_RDS_CACHE:
        return _MIN_RDS_CACHE[keyword]

    try:
        serp_resp = await execute_task(
            task_name="serp_organic",
            input_data={
                "endpoint": "/serp/google/organic/live/regular",
                "payload": [{
                    "keyword": keyword,
                    "location_code": 2840,
                    "language_code": "en",
                    "depth": 10,
                }],
            },
            provider="dataforseo",
        )
        if not (serp_resp and serp_resp.success):
            logger.warning("[BM] SERP call failed for keyword=%r", keyword)
            return None

        tasks_data = (serp_resp.data or {}).get("tasks", [])
        if not tasks_data:
            return None

        result_rows = tasks_data[0].get("result") or []
        items = result_rows[0].get("items", []) if result_rows else []
        comp_urls = [
            it["url"] for it in items
            if it.get("type") == "organic" and it.get("url")
        ][:10]

        if not comp_urls:
            return None

        comp_data = await _fetch_backlinks_summary(comp_urls)
        rd_values = [
            v["referring_domains"]
            for v in comp_data.values()
            if v.get("referring_domains") is not None
        ]

        if not rd_values:
            return None

        median_rd = int(statistics.median(rd_values))
        _MIN_RDS_CACHE[keyword] = median_rd
        return median_rd

    except Exception as exc:
        logger.error(
            "[BM] min_required_rds failed for keyword=%r: %s", keyword, exc, exc_info=True
        )
        return None


# ── Phase 1: Crawl-time extraction (Fields 2, 3, 4 — synchronous, zero API) ───

def extract_crawltime_backlink_fields(
    url: str = "",
    site_domain: str = "",
    internal_outlinks: Optional[int] = None,
    external_outlinks: Optional[int] = None,
    outlink_url_list: Optional[List[str]] = None,
    html_content: str = "",
) -> Dict[str, Any]:
    """
    Synchronously extract Fields 2, 3, and 4 during the live crawl.

    Accepts pre-computed counts from the spider (preferred — no extra cost).
    Falls back to HTML parsing when counts are not available.

    Fields 1 and 5-8 require either the complete inlink graph or DataForSEO
    API access and are deferred to extract_backlink_metrics_batch().
    """
    audit_log: Dict[str, str] = {}

    if not site_domain and url:
        parsed = urlparse(url)
        site_domain = f"{parsed.scheme}://{parsed.netloc}"

    # ── Fields 2 & 3 ──────────────────────────────────────────────────────────
    if internal_outlinks is not None and external_outlinks is not None:
        # Both supplied by spider — fastest path, no HTML touched.
        audit_log["internal_outlinks"] = "FOUND"
        audit_log["external_outlinks"] = "FOUND"
        if outlink_url_list is None:
            outlink_url_list = []
    else:
        # Fall back to HTML parsing; extract both counts in a single pass.
        links = _extract_links_from_html(html_content)
        _io, _eo, _oul = _compute_outlinks(links, site_domain)
        if internal_outlinks is None:
            internal_outlinks = _io
            outlink_url_list = _oul
            audit_log["internal_outlinks"] = "EXTRACTING"
        else:
            audit_log["internal_outlinks"] = "FOUND"
        if external_outlinks is None:
            external_outlinks = _eo
            audit_log["external_outlinks"] = "EXTRACTING"
        else:
            audit_log["external_outlinks"] = "FOUND"

    # ── Field 4: Internal/External ratio (always recomputed from current values) ─
    internal_external_ratio = _compute_internal_external_ratio(internal_outlinks or 0, external_outlinks or 0)
    audit_log["internal_external_ratio"] = "COMPUTED"

    # Fields 1, 5-8 are deferred to the post-crawl batch step.
    # Keep explicit audit-log states so downstream consumers can
    # distinguish crawl-time extraction vs post-crawl API fills.
    audit_log["inlinks"] = "NULL-POST-CRAWL"
    audit_log["pr_score"] = "NULL"
    audit_log["current_ref_domains"] = "NULL"
    audit_log["min_required_ref_domains"] = "NULL"
    audit_log["need_to_acquire_ref_domains"] = "NULL"

    return {
        "url": url,
        "inlinks": None,
        "internal_outlinks": internal_outlinks,
        "external_outlinks": external_outlinks,
        "outlink_url_list": outlink_url_list or [],
        "internal_external_ratio": internal_external_ratio,
        "pr_score": None,
        "current_ref_domains": None,
        "min_required_ref_domains": None,
        "need_to_acquire_ref_domains": None,
        "audit_log": audit_log,
    }


# ── Phase 2: Post-crawl batch (all 8 fields — async, DataForSEO API) ──────────

async def extract_backlink_metrics_batch(
    items: List[Dict[str, Any]],
    site_domain: str = "",
    **kwargs,
) -> List[Dict[str, Any]]:
    """
    Compute all 8 backlink metric fields for a complete job after crawl.

    Steps
    ─────
    1. Build the inlink graph from each item's stored outlink_url_list.
    2. Single batched Backlinks Summary API call for all URLs (100 per call).
    3. One SERP call per unique keyword (deduplicated and cached).
    4. Assemble per-URL result dicts with accurate audit logs.

    Items must include at minimum: url, outlink_url_list, main_keyword.
    Existing pr_score / current_referring_domains fields are ignored so the
    post-crawl run always reflects the latest API data.
    """
    if not items:
        return []

    if not site_domain:
        first_url = items[0].get("url", "")
        if first_url:
            p = urlparse(first_url)
            site_domain = f"{p.scheme}://{p.netloc}"

    # ── Step 1: Inlink graph ───────────────────────────────────────────────────
    inlink_map = compute_inlinks_for_batch(items)

    # ── Step 2: Batch Backlinks Summary — one call per 100 URLs ───────────────
    all_urls = [item.get("url") for item in items if item.get("url")]
    urls_needing_api: List[str] = []
    for item in items:
        url = item.get("url")
        if not url:
            continue

        pr_existing = item.get("pr_score")
        current_rd_existing = item.get("current_ref_domains")

        # Spec: pr_score counts as "FOUND" only when value > 0.
        try:
            pr_found = pr_existing is not None and pr_existing != "" and float(pr_existing) > 0
        except Exception:
            pr_found = False

        # Spec: current_ref_domains counts as "FOUND" when not null/empty (0 is valid).
        curr_found = current_rd_existing is not None and current_rd_existing != ""

        if not pr_found or not curr_found:
            urls_needing_api.append(url)

    # Deduplicate while preserving order
    seen_urls = set()
    urls_needing_api = [u for u in urls_needing_api if not (u in seen_urls or seen_urls.add(u))]

    bl_data = await _fetch_backlinks_summary(urls_needing_api) if urls_needing_api else {}
    api_calls_backlinks = (len(urls_needing_api) + 99) // 100 if urls_needing_api else 0

    # ── Step 3: Min Required Ref Domains — one SERP call per unique keyword ──
    keywords_needing_rds = set()
    for item in items:
        kw = (item.get("main_keyword") or "").strip()
        if not kw:
            continue
        min_existing = item.get("min_required_ref_domains")
        if min_existing is None or min_existing == "":
            keywords_needing_rds.add(kw)

    keywords_to_fetch = keywords_needing_rds - set(_MIN_RDS_CACHE)
    if keywords_to_fetch:
        await asyncio.gather(
            *[_fetch_min_required_rds(kw) for kw in keywords_to_fetch],
            return_exceptions=True,
        )
    api_calls_serp = len(keywords_to_fetch)
    cache_hits_serp = len(keywords_needing_rds - keywords_to_fetch)

    # ── Step 4: Assemble results ───────────────────────────────────────────────
    results: List[Dict[str, Any]] = []
    ratio_flagged = 0
    pages_needing_rds = 0
    rd_gaps: List[int] = []
    fields_found = fields_fetched = fields_null = 0

    for item in items:
        url = item.get("url", "")
        main_keyword = item.get("main_keyword", "")
        audit_log: Dict[str, str] = {}

        # Field 1: Inlinks from graph
        # Normalize the lookup key so trailing-slash variants resolve to the
        # same entry (e.g. https://attrock.com == https://attrock.com/).
        inlinks_existing = item.get("inlinks")
        if inlinks_existing is not None and inlinks_existing != "":
            inlinks = int(inlinks_existing)
            audit_log["inlinks"] = "FOUND"
        else:
            inlinks = inlink_map.get(
                _normalize_for_inlinks(url, base_domain=site_domain), 0,
            )
            audit_log["inlinks"] = "EXTRACTING"

        # Fields 2 & 3: From stored crawl-time data
        internal_outlinks_existing = item.get("internal_outlinks")
        external_outlinks_existing = item.get("external_outlinks")
        outlink_url_list = item.get("outlink_url_list") or []

        internal_outlinks = int(internal_outlinks_existing) if internal_outlinks_existing not in (None, "") else None
        external_outlinks = int(external_outlinks_existing) if external_outlinks_existing not in (None, "") else None

        audit_log["internal_outlinks"] = "FOUND" if internal_outlinks_existing not in (None, "") else "NULL-REDIRECT"
        audit_log["external_outlinks"] = "FOUND" if external_outlinks_existing not in (None, "") else "NULL-REDIRECT"

        # Field 4: Internal/External ratio — always recomputed from unique counts.
        # Passes None through _compute_internal_external_ratio which treats it as 0.
        internal_external_ratio = _compute_internal_external_ratio(internal_outlinks or 0, external_outlinks or 0)
        audit_log["internal_external_ratio"] = "COMPUTED"

        # Fields 5 & 6: From batch API response
        pr_existing = item.get("pr_score")
        current_rd_existing = item.get("current_ref_domains")

        try:
            pr_found = pr_existing is not None and pr_existing != "" and float(pr_existing) > 0
        except Exception:
            pr_found = False

        curr_found = current_rd_existing is not None and current_rd_existing != ""

        api_url = _normalize_url_for_api(url)
        page_api = bl_data.get(api_url, {}) if bl_data else {}
        if pr_found:
            pr_score = int(pr_existing)
            audit_log["pr_score"] = "FOUND"
        else:
            if api_url in bl_data:
                pr_score = int(page_api.get("rank", 0) or 0)
                audit_log["pr_score"] = "FETCHED"
            else:
                pr_score = None
                audit_log["pr_score"] = "NULL"

        if curr_found:
            current_ref_domains = int(current_rd_existing)
            audit_log["current_ref_domains"] = "FOUND"
        else:
            if api_url in bl_data:
                current_ref_domains = int(page_api.get("referring_domains", 0) or 0)
                audit_log["current_ref_domains"] = "FETCHED"
            else:
                current_ref_domains = None
                audit_log["current_ref_domains"] = "NULL"

        # Redirect / non-HTML pages: outlink data is absent (internal_outlinks=None).
        # Referring-domain metrics are meaningless for pages whose content was never
        # crawled — null them out so the frontend shows "-" consistently.
        if internal_outlinks is None:
            current_ref_domains = None
            audit_log["current_ref_domains"] = "NULL-REDIRECT"

        # Field 7: Min Required Ref Domains (existing item overrides cache/API)
        min_required_existing = item.get("min_required_ref_domains")
        if min_required_existing is not None and min_required_existing != "":
            min_required_ref_domains = int(min_required_existing)
            audit_log["min_required_ref_domains"] = "FOUND"
        elif not main_keyword:
            min_required_ref_domains = None
            audit_log["min_required_ref_domains"] = "SKIPPED-NO-KEYWORD"
        else:
            min_required_ref_domains = _MIN_RDS_CACHE.get(main_keyword)
            audit_log["min_required_ref_domains"] = "FETCHED" if min_required_ref_domains is not None else "NULL"

        # Field 8: Need to acquire ref domains — allows negative (already above target)
        if current_ref_domains is None:
            need_to_acquire_ref_domains = None
            audit_log["need_to_acquire_ref_domains"] = "NULL"
        else:
            need_to_acquire_ref_domains = (min_required_ref_domains or 0) - current_ref_domains
            audit_log["need_to_acquire_ref_domains"] = "COMPUTED"

        result = {
            "url": url,
            "inlinks": inlinks,
            "internal_outlinks": internal_outlinks,
            "external_outlinks": external_outlinks,
            "outlink_url_list": outlink_url_list,
            "internal_external_ratio": internal_external_ratio,
            "pr_score": pr_score,
            "current_ref_domains": current_ref_domains,
            "min_required_ref_domains": min_required_ref_domains,
            "need_to_acquire_ref_domains": need_to_acquire_ref_domains,
            "audit_log": audit_log,
        }
        results.append(result)

        for status in audit_log.values():
            if status == "FOUND":
                fields_found += 1
            elif status in ("EXTRACTING", "FETCHED", "COMPUTED"):
                fields_fetched += 1
            else:
                fields_null += 1

        if internal_external_ratio is not None and internal_external_ratio < 4.0:
            ratio_flagged += 1
        if need_to_acquire_ref_domains is not None and need_to_acquire_ref_domains > 0:
            pages_needing_rds += 1
            rd_gaps.append(need_to_acquire_ref_domains)

    avg_gap = round(sum(rd_gaps) / len(rd_gaps), 1) if rd_gaps else 0
    logger.info(
        "[BM] BATCH SUMMARY | URLs: %d | FOUND: %d | Fetched/Computed: %d | "
        "Null: %d | Backlinks API calls: %d | SERP calls: %d (cache hits: %d) | "
        "Ratio flagged: %d | Need RDs: %d (avg gap: %.1f)",
        len(items), fields_found, fields_fetched, fields_null,
        api_calls_backlinks, api_calls_serp, cache_hits_serp,
        ratio_flagged, pages_needing_rds, avg_gap,
    )

    return results

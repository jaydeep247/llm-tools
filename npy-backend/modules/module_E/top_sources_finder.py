"""
Top Sources Finder — Module E

Discovers the real external pages that mention a brand/domain by:

  1. Extracting domain + brand name from the input URL
  2. Generating multiple SERP search queries  ("mybrand.com", "mybrand", etc.)
  3. Calling DataForSEO Google Organic SERP API for each query
  4. Filtering results to keep only pages that genuinely mention the brand
  5. Deduplicating URLs and ranking by frequency of appearance across queries
  6. Returning a clean, ranked list of {domain, url, title, snippet} records

This replaces the old approach that collected `top_domains` from the DataForSEO
Content Analysis phrase_trends endpoint — which used an unordered Python set and
produced random, non-deterministic results every run.
"""

import asyncio
import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_top_sources")


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# DataForSEO SERP endpoint (same one used by Module A)
_SERP_ENDPOINT = "/serp/google/organic/live/regular"

# Number of results to request per query from DataForSEO
_SERP_DEPTH = 20

# Location code: 2840 = United States (same default used everywhere in the project)
_LOCATION_CODE = 2840
_LANGUAGE_CODE = "en"

# Maximum unique sources to return
_MAX_SOURCES = 10

# Domains to exclude — they are brand-owned or infrastructure, not "sources"
_EXCLUDE_SELF_DOMAINS = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_domain(url: str) -> str:
    """
    Extract the bare domain (no www, no scheme) from a URL.

    Examples:
        https://www.mybrand.com/page  →  mybrand.com
        mybrand.com                   →  mybrand.com
    """
    if not url:
        return ""
    try:
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        netloc = urlparse(url).netloc or ""
        return netloc.lstrip("www.").lower().strip()
    except Exception:
        return ""


def _extract_brand(domain: str) -> str:
    """
    Extract a short brand name from a domain.

    Examples:
        mybrand.com     →  mybrand
        mybrand.co.uk   →  mybrand
        my-brand.com    →  my-brand
    """
    if not domain:
        return ""
    # Drop TLDs (.com, .co.uk, .io, etc.) — keep the leftmost label
    parts = domain.split(".")
    return parts[0] if parts else domain


def _build_queries(domain: str, brand: str) -> List[str]:
    """
    Build a list of SERP search queries designed to find pages that mention
    the brand/domain.

    Each query is distinct to maximize coverage across different surfaces
    (social media, review sites, press, etc.).
    """
    queries: List[str] = []

    if domain:
        queries.append(f'"{domain}"')          # exact domain mention

    if brand and brand.lower() != domain.lower():
        queries.append(f'"{brand}"')            # exact brand name mention
        queries.append(f'{brand} review')       # review pages
        queries.append(f'{brand} featured')     # press/features

    # Deduplicate while preserving order
    seen = set()
    unique: List[str] = []
    for q in queries:
        if q not in seen:
            seen.add(q)
            unique.append(q)

    return unique


def _extract_result_domain(url: str) -> str:
    """Extract domain from a SERP result URL."""
    return _extract_domain(url)


def _is_brand_mentioned(brand: str, domain: str, result_url: str, title: str, snippet: str) -> bool:
    """
    Return True if the SERP result page genuinely mentions the target brand.

    Checks:
    - The result URL does NOT belong to the brand's own domain (self-referential)
    - The brand name or domain appears in the title OR snippet text
    """
    if not result_url:
        return False

    result_domain = _extract_result_domain(result_url)

    # Skip the brand's own pages
    if _EXCLUDE_SELF_DOMAINS and domain and result_domain:
        if result_domain == domain or result_domain.endswith("." + domain):
            return False

    # Check title + snippet for brand mention
    brand_lower = brand.lower().strip()
    domain_lower = domain.lower().strip()
    haystack = f"{(title or '').lower()} {(snippet or '').lower()}"

    if brand_lower and brand_lower in haystack:
        return True
    if domain_lower and domain_lower in haystack:
        return True

    return False


def _parse_serp_items(tasks_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Parse DataForSEO SERP response tasks into a flat list of organic items.

    Each returned item has: url, title, snippet, rank_absolute.
    """
    items: List[Dict[str, Any]] = []
    try:
        result_rows = tasks_data[0].get("result") or [] if tasks_data else []
        for result_row in result_rows:
            for item in result_row.get("items") or []:
                if item.get("type") != "organic":
                    continue
                url = (item.get("url") or "").strip()
                if not url:
                    continue
                items.append({
                    "url": url,
                    "title": (item.get("title") or "").strip(),
                    "snippet": (item.get("description") or item.get("snippet") or "").strip(),
                    "rank_absolute": item.get("rank_absolute") or 999,
                })
    except Exception as e:
        logger.debug("Error parsing SERP items: %s", e)
    return items


async def _run_serp_query(query: str) -> List[Dict[str, Any]]:
    """
    Execute a single Google Organic SERP query via DataForSEO.

    Returns a flat list of organic items.
    """
    try:
        resp = await execute_task(
            task_name="module_e_top_sources_serp",
            input_data={
                "endpoint": _SERP_ENDPOINT,
                "payload": [{
                    "keyword": query,
                    "location_code": _LOCATION_CODE,
                    "language_code": _LANGUAGE_CODE,
                    "depth": _SERP_DEPTH,
                }],
            },
            provider="dataforseo",
        )
        if not (resp and resp.success):
            logger.warning(
                "SERP query failed | query=%r | error=%s",
                query, resp.error if resp else "no response"
            )
            return []

        tasks_data = (resp.data or {}).get("tasks", [])
        return _parse_serp_items(tasks_data)

    except Exception as e:
        logger.error("SERP query exception | query=%r | %s", query, e, exc_info=True)
        return []


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def find_top_sources(
    url: str,
    brand_name: Optional[str] = None,
    max_sources: int = _MAX_SOURCES,
) -> Dict[str, Any]:
    """
    Discover the top external pages that are mentioning / discussing a brand.

    Args:
        url:          The brand's website URL  (e.g. "https://mybrand.com")
        brand_name:   Optional override for the brand name. If not supplied,
                      the brand is inferred from the domain.
        max_sources:  Maximum number of unique source records to return.

    Returns:
        {
            "input_url":     str,
            "domain":        str,                  # "mybrand.com"
            "brand":         str,                  # "mybrand"
            "queries_used":  List[str],            # SERP queries that were run
            "sources": [
                {
                    "domain":        str,           # "forbes.com"
                    "url":           str,           # full URL of the mentioning page
                    "title":         str,
                    "snippet":       str,
                    "mention_count": int,           # how many queries found this URL
                },
                ...
            ],
            "total_found":   int,
            "scanned_at":    str,                  # ISO 8601 UTC timestamp
        }
    """
    domain = _extract_domain(url)
    brand = brand_name or _extract_brand(domain)

    logger.info(
        "[TOP_SOURCES] Starting | url=%r domain=%r brand=%r",
        url, domain, brand
    )

    queries = _build_queries(domain, brand)
    logger.info("[TOP_SOURCES] Queries generated: %s", queries)

    # Run all SERP queries in parallel
    query_results = await asyncio.gather(
        *[_run_serp_query(q) for q in queries],
        return_exceptions=True,
    )

    # ── Aggregate results ──────────────────────────────────────────────────────
    # mention_count[url] = how many distinct queries returned this URL
    mention_count: Dict[str, int] = {}
    # best_data[url] = {domain, url, title, snippet} — first-seen wins
    best_data: Dict[str, Dict[str, Any]] = {}

    for idx, items in enumerate(query_results):
        if isinstance(items, Exception):
            logger.error("[TOP_SOURCES] Query %r raised: %s", queries[idx], items)
            continue
        if not isinstance(items, list):
            continue

        seen_in_query: set = set()

        for item in items:
            result_url = item.get("url", "")
            title = item.get("title", "")
            snippet = item.get("snippet", "")

            # Filter: must genuinely mention the brand
            if not _is_brand_mentioned(brand, domain, result_url, title, snippet):
                continue

            # Deduplicate within a single query (same URL counted once per query)
            if result_url in seen_in_query:
                continue
            seen_in_query.add(result_url)

            # Track cross-query frequency
            mention_count[result_url] = mention_count.get(result_url, 0) + 1

            # Store metadata (first-seen wins for title/snippet)
            if result_url not in best_data:
                best_data[result_url] = {
                    "domain": _extract_result_domain(result_url),
                    "url": result_url,
                    "title": title,
                    "snippet": snippet,
                }

    # ── Remove duplicate domains — keep best-ranking URL per domain ───────────
    # Sort by mention_count DESC, then use that to pick one URL per domain
    sorted_urls = sorted(
        mention_count.keys(),
        key=lambda u: mention_count[u],
        reverse=True,
    )

    seen_domains: set = set()
    deduped_sources: List[Dict[str, Any]] = []

    for u in sorted_urls:
        data = best_data[u]
        d = data["domain"]
        if d in seen_domains:
            continue
        seen_domains.add(d)
        deduped_sources.append({
            **data,
            "mention_count": mention_count[u],
        })
        if len(deduped_sources) >= max_sources:
            break

    total_found = len(deduped_sources)
    logger.info(
        "[TOP_SOURCES] Done | domain=%r brand=%r queries=%d sources_found=%d",
        domain, brand, len(queries), total_found
    )

    return {
        "input_url": url,
        "domain": domain,
        "brand": brand,
        "queries_used": queries,
        "sources": deduped_sources,
        "total_found": total_found,
        "scanned_at": datetime.utcnow().isoformat() + "Z",
    }

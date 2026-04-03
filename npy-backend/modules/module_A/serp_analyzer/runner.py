"""SERP Analyzer runner — orchestrates the full analysis pipeline.

Called by ``workers/executors/module_a.py`` via::

    await run_serp_analyzer(
        job_id=..., session_id=..., url=...,
        keywords=[...], competitors=[...],
        ...
        dataforseo_login=..., dataforseo_password=...,
    )

Flow
----
1. For each keyword (with bounded concurrency):
   a. Call DataForSEO SERP live/advanced endpoint
   b. Persist raw JSON to MongoDB for re-parsing without re-calling API
   c. Parse the response into a KeywordSerpResult
2. Compute summary statistics
3. Compute volatility
4. Identify content gaps
5. Detect SERP opportunities
6. Persist the complete SerpAnalyzerResult to MongoDB
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from .analyzer import (
    compute_content_gaps,
    compute_summary,
    compute_volatility,
    detect_opportunities,
)
from .client import DataForSEOError, fetch_serp
from .models import (
    ContentGap,
    KeywordSerpResult,
    SerpAnalyzerResult,
)
from .parser import parse_serp_response
from .store import save_raw_serp_json, save_serp_result

logger = logging.getLogger(__name__)

# Maximum DataForSEO calls in flight at the same time.
# The default concurrency of 5 balances speed against rate-limit pressure.
_MAX_CONCURRENCY = 5


def _extract_domain(url: str) -> str:
    """Extract netloc from a URL and strip leading ``www.``."""
    if not url:
        return ""
    try:
        netloc = urlparse(url).netloc
        return re.sub(r"^www\.", "", netloc.lower())
    except Exception:
        return ""


async def _fetch_and_parse(
    keyword: str,
    target_domain: str,
    competitors: list[str],
    location_code: int,
    language_code: str,
    device: str,
    job_id: str,
    login: str,
    password: str,
    semaphore: asyncio.Semaphore,
) -> KeywordSerpResult | None:
    """Fetch, persist raw JSON, and parse a single keyword SERP."""
    async with semaphore:
        try:
            raw = await fetch_serp(
                keyword=keyword,
                login=login,
                password=password,
                location_code=location_code,
                language_code=language_code,
                device=device,
            )
            # Persist raw response for future re-parsing
            try:
                save_raw_serp_json(job_id, keyword, raw)
            except Exception as store_exc:
                logger.warning(
                    "[SERP RUNNER] Failed to persist raw JSON for keyword=%r: %s",
                    keyword,
                    store_exc,
                )

            return parse_serp_response(
                raw=raw,
                keyword=keyword,
                target_domain=target_domain,
                competitors=competitors,
                location_code=location_code,
                language_code=language_code,
                device=device,
            )
        except DataForSEOError as exc:
            logger.error(
                "[SERP RUNNER] DataForSEO error for keyword=%r: %s", keyword, exc
            )
            return None
        except Exception as exc:
            logger.error(
                "[SERP RUNNER] Unexpected error for keyword=%r: %s",
                keyword,
                exc,
                exc_info=True,
            )
            return None


async def run_serp_analyzer(
    *,
    job_id: str,
    session_id: str,
    url: str,
    keywords: list[str],
    competitors: list[str] | None = None,
    location_code: int = 2840,
    language_code: str = "en",
    device: str = "desktop",
    dataforseo_login: str,
    dataforseo_password: str,
) -> dict[str, Any]:
    """Run the full SERP Analyzer pipeline for a list of keywords.

    Returns a dict representation of the saved ``SerpAnalyzerResult``.
    """
    competitors = competitors or []
    target_domain = _extract_domain(url) or url

    logger.info(
        "[SERP RUNNER] Starting | job=%s keywords=%d target=%s",
        job_id,
        len(keywords),
        target_domain,
    )

    semaphore = asyncio.Semaphore(_MAX_CONCURRENCY)

    tasks = [
        _fetch_and_parse(
            keyword=kw,
            target_domain=target_domain,
            competitors=competitors,
            location_code=location_code,
            language_code=language_code,
            device=device,
            job_id=job_id,
            login=dataforseo_login,
            password=dataforseo_password,
            semaphore=semaphore,
        )
        for kw in keywords
    ]

    raw_results: list[KeywordSerpResult | None] = await asyncio.gather(*tasks)

    # Filter out failed fetches
    kw_results: list[KeywordSerpResult] = [r for r in raw_results if r is not None]

    if not kw_results:
        logger.warning("[SERP RUNNER] No keyword results obtained | job=%s", job_id)

    # ── Compute aggregates ─────────────────────────────────────────────────
    summary = compute_summary(kw_results)
    volatility = compute_volatility(kw_results)
    content_gaps = compute_content_gaps(kw_results)
    opportunities = detect_opportunities(kw_results, target_domain)

    now = datetime.now(timezone.utc).isoformat()

    result = SerpAnalyzerResult(
        jobId=job_id,
        sessionId=session_id,
        url=url,
        target_domain=target_domain,
        keywords=keywords,
        competitors=competitors,
        location_code=location_code,
        language_code=language_code,
        device=device,
        timestamp=now,
        keyword_results=kw_results,
        summary=summary,
        volatility=volatility,
        content_gaps=content_gaps,
        updatedAt=now,
    )

    doc = result.model_dump()

    # Attach opportunities as a top-level field (not in the Pydantic model so
    # the TypeScript side can pick it up if needed in future)
    doc["opportunities"] = opportunities

    try:
        save_serp_result(doc)
        logger.info(
            "[SERP RUNNER] ✅ Saved | job=%s keywords=%d ranked=%d",
            job_id,
            summary.total_keywords,
            summary.ranked_keywords,
        )
    except Exception as exc:
        logger.error("[SERP RUNNER] Failed to save result: %s", exc, exc_info=True)
        raise

    return doc

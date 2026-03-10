"""SERP Analyzer — core analysis engine.

Parses raw DataForSEO responses, extracts SERP features, ranking data,
competitors, PAA questions, ads, and derives aggregate metrics (summary,
volatility, content gaps).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from statistics import mean, stdev
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from .models import (
    AdResult,
    KeywordSerpResult,
    OrganicResult,
    PaaQuestion,
    SerpFeature,
    SerpAnalyzerResult,
    SERP_FEATURE_TYPES,
)

logger = logging.getLogger("serp_analyzer")


# ── Utilities ──────────────────────────────────────────────────────────────

def _extract_domain(url: str) -> str:
    """Return the bare hostname (without www.) from a URL."""
    try:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        host = parsed.netloc or parsed.path
        return re.sub(r"^www\.", "", host).lower()
    except Exception:
        return url.lower()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Feature extraction ────────────────────────────────────────────────────

_FEATURE_TYPE_MAP: Dict[str, str] = {
    # DataForSEO item type → canonical feature key
    "featured_snippet": "featured_snippet",
    "answer_box": "answer_box",
    "people_also_ask": "people_also_ask",
    "knowledge_graph": "knowledge_graph",
    "local_pack": "local_pack",
    "local_services": "local_pack",
    "image_carousel": "image_carousel",
    "images": "image_carousel",
    "video": "video_carousel",
    "video_carousel": "video_carousel",
    "news_box": "news_box",
    "top_stories": "news_box",
    "paid": "paid",
    "shopping": "shopping",
    "twitter": "twitter",
    "sitelinks": "sitelinks",
    "expanded_sitelinks": "sitelinks",
}


def _empty_features() -> Dict[str, SerpFeature]:
    return {ft: SerpFeature(type=ft, present=False) for ft in SERP_FEATURE_TYPES}


def _parse_items(
    items: List[Dict[str, Any]],
    target_domain: str,
    competitor_domains: List[str],
) -> Tuple[
    List[OrganicResult],
    Dict[str, SerpFeature],
    List[PaaQuestion],
    List[AdResult],
    Dict[str, int],
    Optional[int],
    Optional[int],
    Optional[str],
    Optional[str],
    Optional[str],
]:
    """Parse all SERP items from a DataForSEO task result."""

    features = _empty_features()
    organic: List[OrganicResult] = []
    paa: List[PaaQuestion] = []
    ads: List[AdResult] = []
    competitor_ranks: Dict[str, int] = {}

    target_rank: Optional[int] = None
    target_rank_group: Optional[int] = None
    target_url: Optional[str] = None
    target_title: Optional[str] = None
    target_description: Optional[str] = None

    for item in items:
        item_type = (item.get("type") or "").lower()
        rank_abs = item.get("rank_absolute") or 0
        rank_grp = item.get("rank_group") or 0

        # ── Map known feature types ────────────────────────────────────────
        canonical = _FEATURE_TYPE_MAP.get(item_type)
        if canonical and canonical in features:
            features[canonical] = SerpFeature(
                type=canonical,
                present=True,
                position=rank_abs,
                data=_extract_feature_data(item_type, item),
            )

        # ── Organic results ────────────────────────────────────────────────
        if item_type == "organic":
            url = item.get("url") or item.get("domain") or ""
            domain = _extract_domain(url)
            result = OrganicResult(
                rank_absolute=rank_abs,
                rank_group=rank_grp,
                url=url,
                domain=domain,
                title=item.get("title") or "",
                description=item.get("description") or "",
                breadcrumb=item.get("breadcrumb") or "",
                is_featured_snippet=item.get("is_featured_snippet") or False,
            )
            organic.append(result)

            # Target domain match?
            if domain == target_domain or target_domain in domain:
                if target_rank is None:
                    target_rank = rank_abs
                    target_rank_group = rank_grp
                    target_url = url
                    target_title = item.get("title")
                    target_description = item.get("description")

            # Competitor match?
            for comp in competitor_domains:
                comp_clean = _extract_domain(comp)
                if comp_clean and (comp_clean == domain or comp_clean in domain):
                    if comp_clean not in competitor_ranks:
                        competitor_ranks[comp_clean] = rank_abs

        # ── PAA ────────────────────────────────────────────────────────────
        elif item_type == "people_also_ask":
            for entry in (item.get("items") or []):
                paa.append(PaaQuestion(
                    question=entry.get("title") or entry.get("question") or "",
                    answer=entry.get("description") or entry.get("answer"),
                    answer_url=entry.get("url"),
                ))

        # ── Ads ────────────────────────────────────────────────────────────
        elif item_type == "paid":
            for ad in (item.get("items") or [item]):
                url = ad.get("url") or ad.get("domain") or ""
                ads.append(AdResult(
                    rank_absolute=ad.get("rank_absolute") or rank_abs,
                    url=url,
                    domain=_extract_domain(url),
                    title=ad.get("title") or "",
                    description=ad.get("description") or "",
                ))

    return (
        organic[:10],  # keep top-10 organic
        features,
        paa,
        ads,
        competitor_ranks,
        target_rank,
        target_rank_group,
        target_url,
        target_title,
        target_description,
    )


def _extract_feature_data(item_type: str, item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Extract a concise payload for specific feature types."""
    if item_type == "featured_snippet":
        return {
            "title": item.get("title"),
            "description": item.get("description"),
            "url": item.get("url"),
        }
    if item_type in ("people_also_ask",):
        return {
            "questions": [
                q.get("title") or q.get("question")
                for q in (item.get("items") or [])
                if q.get("title") or q.get("question")
            ]
        }
    if item_type == "knowledge_graph":
        return {
            "title": item.get("title"),
            "description": item.get("description"),
            "url": item.get("url"),
        }
    if item_type == "local_pack":
        return {
            "items_count": len(item.get("items") or []),
        }
    if item_type in ("news_box", "top_stories"):
        return {
            "items_count": len(item.get("items") or []),
        }
    return None


# ── Keyword result parser ─────────────────────────────────────────────────

def parse_keyword_result(
    keyword: str,
    raw_response: Dict[str, Any],
    target_domain: str,
    competitor_domains: List[str],
    location_code: int,
    language_code: str,
    device: str,
) -> KeywordSerpResult:
    """Parse a single DataForSEO response into a ``KeywordSerpResult``."""

    timestamp = _now_iso()

    tasks = raw_response.get("tasks") or []
    if not tasks or "error" in raw_response:
        logger.warning(f"[SERP] Empty/error result for keyword={keyword!r}")
        return KeywordSerpResult(
            keyword=keyword,
            location_code=location_code,
            language_code=language_code,
            device=device,
            timestamp=timestamp,
        )

    task = tasks[0]
    task_result_list = task.get("result") or []
    if not task_result_list:
        return KeywordSerpResult(
            keyword=keyword,
            location_code=location_code,
            language_code=language_code,
            device=device,
            timestamp=timestamp,
        )

    task_result = task_result_list[0]
    items: List[Dict[str, Any]] = task_result.get("items") or []
    total_count = task_result.get("total_count") or 0
    items_count = task_result.get("items_count") or len(items)
    se_count = task_result.get("se_results_count") or 0

    (
        organic_results,
        features,
        paa,
        ads,
        competitor_ranks,
        target_rank,
        target_rank_group,
        target_url,
        target_title,
        target_description,
    ) = _parse_items(items, target_domain, competitor_domains)

    return KeywordSerpResult(
        keyword=keyword,
        location_code=location_code,
        language_code=language_code,
        device=device,
        timestamp=timestamp,
        target_rank=target_rank,
        target_rank_group=target_rank_group,
        target_url=target_url,
        target_title=target_title,
        target_description=target_description,
        organic_results=organic_results,
        features=features,
        paa_questions=paa,
        ad_results=ads,
        competitor_ranks=competitor_ranks,
        total_count=total_count,
        items_count=items_count,
        se_results_count=se_count,
    )


# ── Aggregate analytics ───────────────────────────────────────────────────

def compute_summary(keyword_results: List[KeywordSerpResult]) -> Dict[str, Any]:
    """Compute high-level summary statistics across all keywords."""
    total = len(keyword_results)
    if total == 0:
        return {"total_keywords": 0}

    ranked = [r for r in keyword_results if r.target_rank is not None]
    unranked = total - len(ranked)
    ranks = [r.target_rank for r in ranked]

    top3 = sum(1 for r in ranks if r <= 3)
    top10 = sum(1 for r in ranks if r <= 10)
    top20 = sum(1 for r in ranks if r <= 20)
    top100 = sum(1 for r in ranks if r <= 100)

    avg_rank = round(mean(ranks), 1) if ranks else None

    # SERP feature frequency
    feature_freq: Dict[str, int] = {ft: 0 for ft in SERP_FEATURE_TYPES}
    for kw in keyword_results:
        for ft, feat in kw.features.items():
            if feat.present:
                feature_freq[ft] = feature_freq.get(ft, 0) + 1

    return {
        "total_keywords": total,
        "ranked_keywords": len(ranked),
        "unranked_keywords": unranked,
        "avg_rank": avg_rank,
        "top3": top3,
        "top10": top10,
        "top20": top20,
        "top100": top100,
        "feature_frequency": feature_freq,
    }


def compute_volatility(keyword_results: List[KeywordSerpResult]) -> Dict[str, Any]:
    """Derive a simple SERP volatility score from rank variance across keywords.

    With a single snapshot there is no inter-temporal variance; we instead
    use the standard deviation of ranks across different keywords as a proxy
    for "SERP instability" — a high spread suggests the site is in mixed
    positions and could benefit from consolidation.
    """
    ranks = [r.target_rank for r in keyword_results if r.target_rank is not None]
    if len(ranks) < 2:
        return {"score": 0, "level": "stable", "rank_std_dev": 0}

    std = round(stdev(ranks), 2)
    # Map std-dev to a 0-100 volatility score (capped at 50 std = 100 score)
    score = min(100, round((std / 50) * 100))
    level = "high" if score >= 60 else "medium" if score >= 30 else "stable"

    return {"score": score, "level": level, "rank_std_dev": std}


def compute_content_gaps(
    keyword_results: List[KeywordSerpResult],
    target_domain: str,
) -> List[Dict[str, Any]]:
    """Identify keywords where the target is not in top-10, with context."""
    gaps = []
    for kw in keyword_results:
        rank = kw.target_rank
        if rank is None or rank > 10:
            # Find who ranks #1
            top_url = kw.organic_results[0].url if kw.organic_results else ""
            top_domain = kw.organic_results[0].domain if kw.organic_results else ""
            gaps.append({
                "keyword": kw.keyword,
                "target_rank": rank,
                "top_ranking_url": top_url,
                "top_ranking_domain": top_domain,
                "has_featured_snippet": kw.features.get("featured_snippet", SerpFeature("featured_snippet", False)).present,
                "has_paa": kw.features.get("people_also_ask", SerpFeature("people_also_ask", False)).present,
                "paa_questions": [p.question for p in kw.paa_questions[:3]],
                "opportunity_type": "not_ranking" if rank is None else "low_ranking",
            })
    return gaps


# ── Main analyser entrypoint ──────────────────────────────────────────────

async def run_serp_analysis(
    job_id: str,
    session_id: str,
    url: str,
    keywords: List[str],
    competitors: List[str],
    location_code: int,
    language_code: str,
    device: str,
    dataforseo_login: str,
    dataforseo_password: str,
) -> SerpAnalyzerResult:
    """Run complete SERP analysis for all keywords and return aggregated result."""
    from .dataforseo_client import DataForSEOClient

    target_domain = _extract_domain(url)
    competitor_domains = [_extract_domain(c) for c in competitors if c]
    timestamp = _now_iso()

    keyword_results: List[KeywordSerpResult] = []

    async with DataForSEOClient(dataforseo_login, dataforseo_password) as client:
        raw_responses = await client.fetch_serp_batch(
            keywords=keywords,
            location_code=location_code,
            language_code=language_code,
            device=device,
        )

    for kw, raw in zip(keywords, raw_responses):
        if isinstance(raw, Exception) or "error" in (raw or {}):
            logger.error(f"[SERP] Skipping keyword {kw!r} due to error: {raw}")
            continue
        kw_result = parse_keyword_result(
            keyword=kw,
            raw_response=raw,
            target_domain=target_domain,
            competitor_domains=competitor_domains,
            location_code=location_code,
            language_code=language_code,
            device=device,
        )
        keyword_results.append(kw_result)

    summary = compute_summary(keyword_results)
    volatility = compute_volatility(keyword_results)
    content_gaps = compute_content_gaps(keyword_results, target_domain)

    return SerpAnalyzerResult(
        job_id=job_id,
        session_id=session_id,
        url=url,
        target_domain=target_domain,
        keywords=keywords,
        competitors=competitors,
        location_code=location_code,
        language_code=language_code,
        device=device,
        timestamp=timestamp,
        keyword_results=keyword_results,
        summary=summary,
        volatility=volatility,
        content_gaps=content_gaps,
    )

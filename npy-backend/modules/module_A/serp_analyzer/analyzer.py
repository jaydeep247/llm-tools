"""Compute aggregate analytics from per-keyword SERP results.

Covers:
  - Summary stats (ranked count, avg rank, feature frequency, …)
  - SERP volatility (rank std-dev → label)
  - Content gap detection
  - Opportunity flags (Part 4 of the spec)
"""

from __future__ import annotations

import math
import re
from typing import Any

from .models import (
    ContentGap,
    KeywordSerpResult,
    SerpAnalyzerSummary,
    SerpVolatility,
)

# ── Domain normalisation helper ───────────────────────────────────────────


def _norm(domain: str) -> str:
    return re.sub(r"^www\.", "", (domain or "").lower().strip("/"))


# ── Summary ───────────────────────────────────────────────────────────────


def compute_summary(kw_results: list[KeywordSerpResult]) -> SerpAnalyzerSummary:
    """Compute aggregate summary statistics across all keyword results."""
    total = len(kw_results)
    ranked = [kw for kw in kw_results if kw.target_rank is not None]
    ranks = [kw.target_rank for kw in ranked]  # all non-None

    avg_rank: float | None = None
    if ranks:
        avg_rank = round(sum(ranks) / len(ranks), 1)

    feature_freq: dict[str, int] = {}
    for kw in kw_results:
        for ft in kw.features:
            feature_freq[ft] = feature_freq.get(ft, 0) + 1

    return SerpAnalyzerSummary(
        total_keywords=total,
        ranked_keywords=len(ranked),
        unranked_keywords=total - len(ranked),
        avg_rank=avg_rank,
        top3=sum(1 for r in ranks if r <= 3),
        top10=sum(1 for r in ranks if r <= 10),
        top20=sum(1 for r in ranks if r <= 20),
        top100=sum(1 for r in ranks if r <= 100),
        feature_frequency=feature_freq,
    )


# ── Volatility ────────────────────────────────────────────────────────────


def compute_volatility(kw_results: list[KeywordSerpResult]) -> SerpVolatility:
    """Compute SERP volatility from rank spread across keywords.

    Volatility is modelled as the coefficient of variation (std-dev / mean)
    mapped to a 0-100 score, then labelled:
      - 0 – 30  → ``"stable"``
      - 31 – 60 → ``"medium"``
      - 61+     → ``"high"``
    """
    ranks = [
        kw.target_rank
        for kw in kw_results
        if kw.target_rank is not None
    ]

    if len(ranks) < 2:
        # Cannot compute meaningful volatility with fewer than two data points
        return SerpVolatility(score=0.0, level="stable", rank_std_dev=0.0)

    mean = sum(ranks) / len(ranks)
    variance = sum((r - mean) ** 2 for r in ranks) / len(ranks)
    std_dev = math.sqrt(variance)

    # Normalise std-dev to a 0-100 scale (cap at 50 rank points = 100 score)
    score = round(min((std_dev / 50.0) * 100, 100), 1)

    if score <= 30:
        level = "stable"
    elif score <= 60:
        level = "medium"
    else:
        level = "high"

    return SerpVolatility(
        score=score,
        level=level,
        rank_std_dev=round(std_dev, 2),
    )


# ── Content gaps ──────────────────────────────────────────────────────────


def _get_top_organic(kw: KeywordSerpResult) -> dict | None:
    """Return the #1 organic result dict, or ``None`` if empty."""
    if not kw.organic_results:
        return None
    return min(kw.organic_results, key=lambda r: r.rank_absolute)


def compute_content_gaps(kw_results: list[KeywordSerpResult]) -> list[ContentGap]:
    """Identify keywords where the target domain is not ranking or ranking low.

    A gap is reported for:
      - ``not_ranking`` — target domain not in top 100 for this keyword
      - ``low_ranking`` — target domain between positions 11 and 100
    """
    gaps: list[ContentGap] = []

    for kw in kw_results:
        rank = kw.target_rank

        if rank is not None and rank <= 10:
            # Good ranking — skip
            continue

        top = _get_top_organic(kw)
        top_url = top.url if top else ""
        top_domain = top.domain if top else ""

        # PAA questions in plain text form for the gap record
        paa_qs = [q.question for q in kw.paa_questions if q.question]

        snippet_feature = kw.features.get("featured_snippet")
        has_snippet = bool(snippet_feature and snippet_feature.present)

        gaps.append(
            ContentGap(
                keyword=kw.keyword,
                target_rank=rank,
                top_ranking_url=top_url,
                top_ranking_domain=top_domain,
                has_featured_snippet=has_snippet,
                has_paa=len(kw.paa_questions) > 0,
                paa_questions=paa_qs[:5],
                opportunity_type="not_ranking" if rank is None else "low_ranking",
            )
        )

    return gaps


# ── Opportunity flags (Part 4) ────────────────────────────────────────────


def detect_opportunities(
    kw_results: list[KeywordSerpResult],
    target_domain: str,
) -> list[dict[str, Any]]:
    """Run all 7 opportunity checks and return a list of flag dicts.

    Each flag dict has ``type``, ``message``, and optional ``data`` key,
    aggregated across all keywords.
    """
    target_domain = _norm(target_domain)
    flags: list[dict[str, Any]] = []

    for kw in kw_results:
        rank = kw.target_rank
        features = kw.features

        # 1. SNIPPET OPPORTUNITY
        snippet = features.get("featured_snippet")
        if (
            rank is not None
            and rank <= 5
            and snippet
            and snippet.present
            and isinstance(snippet.data, dict)
            and _norm(snippet.data.get("domain") or "") != target_domain
        ):
            flags.append(
                {
                    "type": "featured_snippet",
                    "keyword": kw.keyword,
                    "message": (
                        f"You rank #{rank} but don't own the snippet. "
                        "Optimise H2 headings + direct answer format."
                    ),
                    "data": {"rank": rank, "snippet_domain": snippet.data.get("domain")},
                }
            )

        # 2. PAA OPPORTUNITY
        if kw.paa_questions:
            unanswered = [
                q.question
                for q in kw.paa_questions
                if not q.answer_url or target_domain not in (q.answer_url or "")
            ]
            if unanswered:
                flags.append(
                    {
                        "type": "people_also_ask",
                        "keyword": kw.keyword,
                        "message": "Add FAQ schema targeting these questions.",
                        "data": {"questions": unanswered[:5]},
                    }
                )

        # 3. FAQ SCHEMA GAP
        faq_feat = features.get("faq_schema")
        organic_has_faq = (
            faq_feat
            and faq_feat.present
            and isinstance(faq_feat.data, dict)
            and _norm(faq_feat.data.get("url") or "") != target_domain
        )
        # Check top-5 competitors
        top5_domains = {
            _norm(r.domain)
            for r in kw.organic_results
            if r.rank_absolute <= 5
        }
        competitors_have_faq = organic_has_faq or bool(
            faq_feat and faq_feat.present and top5_domains
        )
        target_organic = next(
            (r for r in kw.organic_results if _norm(r.domain) == target_domain),
            None,
        )
        if competitors_have_faq and faq_feat is None and target_organic:
            flags.append(
                {
                    "type": "faq_schema",
                    "keyword": kw.keyword,
                    "message": "Add FAQ schema markup to this page.",
                    "data": None,
                }
            )

        # 4. REVIEW SCHEMA GAP
        review_feat = features.get("review_schema")
        competitors_have_review = review_feat and review_feat.present
        if competitors_have_review and target_organic and review_feat is None:
            flags.append(
                {
                    "type": "review_schema",
                    "keyword": kw.keyword,
                    "message": "Implement Product/Review schema.",
                    "data": None,
                }
            )

        # 5. SITELINKS OPPORTUNITY
        sitelinks_feat = features.get("sitelinks")
        if rank == 1 and (sitelinks_feat is None or not sitelinks_feat.present):
            flags.append(
                {
                    "type": "sitelinks",
                    "keyword": kw.keyword,
                    "message": (
                        "Improve internal linking + homepage authority to trigger sitelinks."
                    ),
                    "data": None,
                }
            )

        # 6. IMAGE PACK OPPORTUNITY
        img_feat = features.get("image_carousel")
        if img_feat and img_feat.present and isinstance(img_feat.data, dict):
            if not img_feat.data.get("target_domain_present"):
                flags.append(
                    {
                        "type": "image_pack",
                        "keyword": kw.keyword,
                        "message": (
                            "Add descriptive alt tags + filename optimisation for images on this page."
                        ),
                        "data": None,
                    }
                )

        # 7. NEWS BOX OPPORTUNITY
        news_feat = features.get("news_box")
        if news_feat and news_feat.present and isinstance(news_feat.data, dict):
            stories = news_feat.data.get("stories") or []
            target_in_news = any(
                target_domain in (s.get("url") or "") for s in stories
            )
            if not target_in_news:
                flags.append(
                    {
                        "type": "news_box",
                        "keyword": kw.keyword,
                        "message": "Publish timely content + add NewsArticle schema.",
                        "data": None,
                    }
                )

    return flags

"""SERP response parser — per-type extractors for all DataForSEO item types."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from .models import (
    AdResult,
    KeywordSerpResult,
    OrganicResult,
    PaaQuestion,
    SerpFeature,
)

# ── Domain helpers ────────────────────────────────────────────────────────


def _extract_domain(url: str) -> str:
    """Extract netloc from URL and strip leading www."""
    if not url:
        return ""
    try:
        netloc = urlparse(url).netloc
        return re.sub(r"^www\.", "", netloc.lower())
    except Exception:
        return ""


def _norm(domain: str) -> str:
    """Normalise a domain string for comparison."""
    return re.sub(r"^www\.", "", (domain or "").lower().strip("/"))


# ── Individual item parsers ───────────────────────────────────────────────


def _as_organic(item: dict) -> OrganicResult | None:
    """Convert a raw organic item dict into an OrganicResult."""
    url = item.get("url", "")
    if not url:
        return None
    domain = item.get("domain") or _extract_domain(url)
    return OrganicResult(
        rank_absolute=item.get("rank_absolute", 0),
        rank_group=item.get("rank_group", 0),
        url=url,
        domain=domain,
        title=item.get("title") or "",
        description=item.get("description") or "",
        breadcrumb=item.get("breadcrumb") or "",
        is_featured_snippet=bool(item.get("is_featured_snippet")),
    )


def _parse_featured_snippet(
    item: dict,
    target_domain: str,
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=featured_snippet."""
    url = item.get("url") or ""
    domain = _norm(item.get("domain") or _extract_domain(url))
    features["featured_snippet"] = SerpFeature(
        type="featured_snippet",
        present=True,
        position=item.get("rank_absolute"),
        data={
            "title": item.get("title"),
            "description": item.get("description"),
            "url": url,
            "domain": domain,
            "is_target_domain": domain == target_domain,
        },
    )


def _parse_answer_box(
    item: dict,
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=answer_box."""
    features["answer_box"] = SerpFeature(
        type="answer_box",
        present=True,
        position=item.get("rank_absolute"),
        data={
            "text": item.get("text") or item.get("description") or "",
            "url": item.get("url"),
        },
    )


def _parse_paa(
    item: dict,
    paa_questions: list[PaaQuestion],
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=people_also_ask.

    Each PAA item has a nested ``items`` array of sub-questions.
    """
    sub_items: list[dict] = item.get("items") or []
    for sub in sub_items:
        # DataForSEO PAA: answer info lives inside expanded_element[0]
        exp_list = sub.get("expanded_element") or []
        exp = exp_list[0] if isinstance(exp_list, list) and exp_list else (exp_list if isinstance(exp_list, dict) else {})
        answer = exp.get("description") or sub.get("description") or sub.get("answer") or None
        answer_url = exp.get("url") or sub.get("url") or None
        q = PaaQuestion(
            question=sub.get("title") or sub.get("question") or "",
            answer=answer,
            answer_url=answer_url,
        )
        if q.question:
            paa_questions.append(q)

    # Snapshot feature presence — data carries extracted questions
    features["people_also_ask"] = SerpFeature(
        type="people_also_ask",
        present=True,
        position=item.get("rank_absolute"),
        data={"question_count": len(paa_questions)},
    )


def _parse_knowledge_graph(
    item: dict,
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=knowledge_graph."""
    features["knowledge_graph"] = SerpFeature(
        type="knowledge_graph",
        present=True,
        position=item.get("rank_absolute"),
        data={
            "entity_name": item.get("title"),
            "description": item.get("description"),
            "url": item.get("url"),
            "attributes": item.get("items") or [],
        },
    )


def _parse_local_pack(
    item: dict,
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=local_pack."""
    sub_items: list[dict] = item.get("items") or []
    businesses = [
        {
            "business_name": sub.get("title"),
            "rating": sub.get("rating", {}).get("value") if isinstance(sub.get("rating"), dict) else None,
            "address": sub.get("address"),
            "phone": sub.get("phone"),
            "url": sub.get("url"),
        }
        for sub in sub_items
    ]
    features["local_pack"] = SerpFeature(
        type="local_pack",
        present=True,
        position=item.get("rank_absolute"),
        data={"businesses": businesses},
    )


def _parse_image_carousel(
    item: dict,
    target_domain: str,
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=images_pack or type=images."""
    sub_items: list[dict] = item.get("items") or []
    source_urls = [sub.get("source_url") or "" for sub in sub_items]
    target_present = any(target_domain in (u or "") for u in source_urls)
    features["image_carousel"] = SerpFeature(
        type="image_carousel",
        present=True,
        position=item.get("rank_absolute"),
        data={
            "image_count": len(sub_items),
            "source_urls": source_urls[:10],
            "target_domain_present": target_present,
        },
    )


def _parse_video_carousel(
    item: dict,
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=video."""
    sub_items: list[dict] = item.get("items") or []
    videos = [
        {
            "title": sub.get("title"),
            "channel": sub.get("channel"),
            "url": sub.get("url"),
            "duration": sub.get("timestamp"),
        }
        for sub in sub_items
    ]
    features["video_carousel"] = SerpFeature(
        type="video_carousel",
        present=True,
        position=item.get("rank_absolute"),
        data={"videos": videos[:10]},
    )


def _parse_top_stories(
    item: dict,
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=top_stories."""
    sub_items: list[dict] = item.get("items") or []
    stories = [
        {
            "headline": sub.get("title"),
            "source": sub.get("source"),
            "url": sub.get("url"),
            "published_at": sub.get("timestamp"),
        }
        for sub in sub_items
    ]
    features["news_box"] = SerpFeature(
        type="news_box",
        present=True,
        position=item.get("rank_absolute"),
        data={"stories": stories[:10]},
    )


def _parse_sitelinks(
    item: dict,
    target_domain: str,
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=sitelinks."""
    parent_url = item.get("url") or ""
    parent_domain = _norm(item.get("domain") or _extract_domain(parent_url))
    sub_items: list[dict] = item.get("items") or []
    sitelink_urls = [s.get("url") for s in sub_items if s.get("url")]
    features["sitelinks"] = SerpFeature(
        type="sitelinks",
        present=True,
        position=item.get("rank_absolute"),
        data={
            "parent_url": parent_url,
            "parent_domain": parent_domain,
            "sitelinks": sitelink_urls,
            "is_target_domain": parent_domain == target_domain,
        },
    )


def _check_how_to(
    item: dict,
    rank: int,
    features: dict[str, SerpFeature],
) -> None:
    """Check for HowTo rich snippet inside an organic item."""
    raw_ext = item.get("extended_snippet")
    ext = raw_ext if isinstance(raw_ext, dict) else {}
    if (ext.get("snippet_type") or "").lower() == "how_to":
        features.setdefault(
            "how_to",
            SerpFeature(
                type="how_to",
                present=True,
                position=rank,
                data={"steps": ext.get("items") or []},
            ),
        )


def _check_faq_schema(
    item: dict,
    url: str,
    rank: int,
    features: dict[str, SerpFeature],
) -> None:
    """Check for FAQ schema inside an organic item."""
    faq = item.get("faq")
    if faq:
        features.setdefault(
            "faq_schema",
            SerpFeature(
                type="faq_schema",
                present=True,
                position=rank,
                data={"url": url, "faq": faq},
            ),
        )


def _check_review_schema(
    item: dict,
    url: str,
    rank: int,
    features: dict[str, SerpFeature],
) -> None:
    """Check for Review/Rating schema inside an organic item."""
    rating = item.get("rating")
    if isinstance(rating, dict) and rating:
        features.setdefault(
            "review_schema",
            SerpFeature(
                type="review_schema",
                present=True,
                position=rank,
                data={
                    "url": url,
                    "rating_value": rating.get("value"),
                    "rating_count": rating.get("votes_count"),
                },
            ),
        )


def _parse_paid(
    item: dict,
    target_domain: str,
    ad_results: list[AdResult],
    features: dict[str, SerpFeature],
) -> None:
    """Parse type=paid (sponsored result)."""
    url = item.get("url") or ""
    domain = _norm(item.get("domain") or _extract_domain(url))
    rank = item.get("rank_absolute", 0)
    ad_results.append(
        AdResult(
            rank_absolute=rank,
            url=url,
            domain=domain,
            title=item.get("title") or "",
            description=item.get("description") or "",
        )
    )
    # Mark ads feature present (first ad wins the position)
    if "paid" not in features:
        features["paid"] = SerpFeature(
            type="paid",
            present=True,
            position=rank,
            data={
                "placement": "top" if rank < 4 else "bottom",
                "is_target_domain": domain == target_domain,
            },
        )


# ── Main entry point ──────────────────────────────────────────────────────


def parse_serp_response(
    raw: dict[str, Any],
    keyword: str,
    target_domain: str,
    competitors: list[str],
    location_code: int = 2840,
    language_code: str = "en",
    device: str = "desktop",
) -> KeywordSerpResult:
    """Parse a full DataForSEO API response dict into a ``KeywordSerpResult``.

    Args:
        raw: The raw JSON dict returned by ``fetch_serp()``.
        keyword: The queried keyword.
        target_domain: The website we are tracking (e.g. ``"example.com"``).
        competitors: Extra domains to track ranks for.
        location_code: DataForSEO location code.
        language_code: Language code (e.g. ``"en"``).
        device: ``"desktop"`` or ``"mobile"``.

    Returns:
        A ``KeywordSerpResult`` containing organic results, SERP features,
        PAA questions, ads, competitor ranks and the target domain's rank.
    """
    target_domain = _norm(target_domain)
    competitor_set = {_norm(c) for c in (competitors or []) if c}

    # ── Extract items list from DataForSEO response ────────────────────────
    items: list[dict] = []
    total_count = 0
    items_count = 0
    se_results_count = 0

    try:
        task_result = raw["tasks"][0]["result"][0]
        items = task_result.get("items") or []
        total_count = task_result.get("total_count") or 0
        items_count = task_result.get("items_count") or 0
        se_results_count = task_result.get("se_results_count") or 0
    except (KeyError, IndexError, TypeError):
        pass

    # ── Output containers ──────────────────────────────────────────────────
    organic_results: list[OrganicResult] = []
    paa_questions: list[PaaQuestion] = []
    ad_results: list[AdResult] = []
    features: dict[str, SerpFeature] = {}
    competitor_ranks: dict[str, int] = {}

    target_rank: int | None = None
    target_rank_group: int | None = None
    target_url: str | None = None
    target_title: str | None = None
    target_description: str | None = None

    # ── Walk items ─────────────────────────────────────────────────────────
    for item in items:
        item_type = (item.get("type") or "").lower()

        if item_type == "organic":
            r = _as_organic(item)
            if r is None:
                continue
            organic_results.append(r)
            dom = _norm(r.domain)

            # First match for target domain
            if dom == target_domain and target_rank is None:
                target_rank = r.rank_absolute
                target_rank_group = item.get("rank_group")
                target_url = r.url
                target_title = r.title
                target_description = r.description

            # Competitor rank tracking (first occurrence per domain)
            if dom in competitor_set and dom not in competitor_ranks:
                competitor_ranks[dom] = r.rank_absolute

            # Rich snippets embedded in organic items
            _check_faq_schema(item, r.url, r.rank_absolute, features)
            _check_review_schema(item, r.url, r.rank_absolute, features)
            _check_how_to(item, r.rank_absolute, features)

        elif item_type == "featured_snippet":
            _parse_featured_snippet(item, target_domain, features)

        elif item_type == "answer_box":
            _parse_answer_box(item, features)

        elif item_type == "people_also_ask":
            _parse_paa(item, paa_questions, features)

        elif item_type == "knowledge_graph":
            _parse_knowledge_graph(item, features)

        elif item_type == "local_pack":
            _parse_local_pack(item, features)

        elif item_type in ("images_pack", "images"):
            _parse_image_carousel(item, target_domain, features)

        elif item_type == "video":
            _parse_video_carousel(item, features)

        elif item_type == "top_stories":
            _parse_top_stories(item, features)

        elif item_type == "sitelinks":
            _parse_sitelinks(item, target_domain, features)

        elif item_type == "paid":
            _parse_paid(item, target_domain, ad_results, features)

        elif item_type in ("shopping", "product_groups", "find_results_on", "twitter"):
            features.setdefault(
                item_type,
                SerpFeature(
                    type=item_type,
                    present=True,
                    position=item.get("rank_absolute"),
                ),
            )

    return KeywordSerpResult(
        keyword=keyword,
        location_code=location_code,
        language_code=language_code,
        device=device,
        timestamp=datetime.now(timezone.utc).isoformat(),
        target_rank=target_rank,
        target_rank_group=target_rank_group,
        target_url=target_url,
        target_title=target_title,
        target_description=target_description,
        organic_results=organic_results[:20],  # keep top-20 for storage efficiency
        features=features,
        paa_questions=paa_questions,
        ad_results=ad_results,
        competitor_ranks=competitor_ranks,
        total_count=total_count,
        items_count=items_count,
        se_results_count=se_results_count,
    )

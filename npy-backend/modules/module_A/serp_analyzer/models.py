"""Pydantic models for SERP Analyzer — must match TypeScript interfaces in moduleAApi.ts."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ── Atomic SERP models ────────────────────────────────────────────────────


class OrganicResult(BaseModel):
    rank_absolute: int
    rank_group: int = 0
    url: str
    domain: str
    title: str
    description: str = ""
    breadcrumb: str = ""
    is_featured_snippet: bool = False


class SerpFeature(BaseModel):
    type: str
    present: bool
    position: int | None = None
    data: dict[str, Any] | list | None = None


class PaaQuestion(BaseModel):
    question: str
    answer: str | None = None
    answer_url: str | None = None


class AdResult(BaseModel):
    rank_absolute: int
    url: str
    domain: str
    title: str
    description: str = ""


# ── Per-keyword result ────────────────────────────────────────────────────


class KeywordSerpResult(BaseModel):
    keyword: str
    location_code: int
    language_code: str
    device: str
    timestamp: str

    # Target domain ranking
    target_rank: int | None = None
    target_rank_group: int | None = None
    target_url: str | None = None
    target_title: str | None = None
    target_description: str | None = None

    organic_results: list[OrganicResult] = Field(default_factory=list)
    features: dict[str, SerpFeature] = Field(default_factory=dict)
    paa_questions: list[PaaQuestion] = Field(default_factory=list)
    ad_results: list[AdResult] = Field(default_factory=list)
    competitor_ranks: dict[str, int] = Field(default_factory=dict)

    total_count: int = 0
    items_count: int = 0
    se_results_count: int = 0


# ── Aggregate models ──────────────────────────────────────────────────────


class SerpAnalyzerSummary(BaseModel):
    total_keywords: int
    ranked_keywords: int
    unranked_keywords: int
    avg_rank: float | None = None
    top3: int
    top10: int
    top20: int
    top100: int
    feature_frequency: dict[str, int] = Field(default_factory=dict)


class SerpVolatility(BaseModel):
    score: float
    level: str  # 'stable' | 'medium' | 'high'
    rank_std_dev: float


class ContentGap(BaseModel):
    keyword: str
    target_rank: int | None = None
    top_ranking_url: str = ""
    top_ranking_domain: str = ""
    has_featured_snippet: bool = False
    has_paa: bool = False
    paa_questions: list[str] = Field(default_factory=list)
    opportunity_type: str  # 'not_ranking' | 'low_ranking'


# ── Top-level result document ─────────────────────────────────────────────


class SerpAnalyzerResult(BaseModel):
    jobId: str
    sessionId: str
    url: str
    target_domain: str
    keywords: list[str]
    competitors: list[str]
    location_code: int
    language_code: str
    device: str
    timestamp: str
    keyword_results: list[KeywordSerpResult] = Field(default_factory=list)
    summary: SerpAnalyzerSummary
    volatility: SerpVolatility
    content_gaps: list[ContentGap] = Field(default_factory=list)
    updatedAt: str | None = None

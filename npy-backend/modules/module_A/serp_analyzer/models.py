"""Data models for SERP Analyzer results."""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


# ── SERP feature types returned by DataForSEO ─────────────────────────────

SERP_FEATURE_TYPES = [
    "featured_snippet",
    "answer_box",
    "people_also_ask",
    "knowledge_graph",
    "local_pack",
    "image_carousel",
    "video_carousel",
    "news_box",
    "top_stories",
    "sitelinks",
    "paid",
    "shopping",
    "twitter",
    "find_results_on",
]


@dataclass
class OrganicResult:
    rank_absolute: int
    rank_group: int
    url: str
    domain: str
    title: str
    description: str
    breadcrumb: str = ""
    is_featured_snippet: bool = False


@dataclass
class SerpFeature:
    type: str
    present: bool
    position: Optional[int] = None
    # Condensed payload for the most useful feature types
    data: Optional[Dict[str, Any]] = None


@dataclass
class PaaQuestion:
    question: str
    answer: Optional[str] = None
    answer_url: Optional[str] = None


@dataclass
class AdResult:
    rank_absolute: int
    url: str
    domain: str
    title: str
    description: str


@dataclass
class KeywordSerpResult:
    keyword: str
    location_code: int
    language_code: str
    device: str
    timestamp: str

    # Target domain ranking
    target_rank: Optional[int] = None        # absolute position (1-100)
    target_rank_group: Optional[int] = None  # organic-only rank
    target_url: Optional[str] = None
    target_title: Optional[str] = None
    target_description: Optional[str] = None

    # Full first-page organic results (up to 10)
    organic_results: List[OrganicResult] = field(default_factory=list)

    # Detected SERP features keyed by feature type
    features: Dict[str, SerpFeature] = field(default_factory=dict)

    # People Also Ask questions
    paa_questions: List[PaaQuestion] = field(default_factory=list)

    # Ad / paid results
    ad_results: List[AdResult] = field(default_factory=list)

    # Competitor domains → their absolute rank for this keyword
    competitor_ranks: Dict[str, int] = field(default_factory=dict)

    # Raw totals from DataForSEO
    total_count: int = 0
    items_count: int = 0
    se_results_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class SerpAnalyzerResult:
    """Aggregated result stored in MongoDB for one SERP Analyzer job."""

    job_id: str
    session_id: str
    url: str                 # target site URL / domain
    target_domain: str       # normalised domain
    keywords: List[str]
    competitors: List[str]
    location_code: int
    language_code: str
    device: str
    timestamp: str

    keyword_results: List[KeywordSerpResult] = field(default_factory=list)

    # Derived aggregate fields (computed by the runner)
    summary: Dict[str, Any] = field(default_factory=dict)
    volatility: Dict[str, Any] = field(default_factory=dict)
    content_gaps: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

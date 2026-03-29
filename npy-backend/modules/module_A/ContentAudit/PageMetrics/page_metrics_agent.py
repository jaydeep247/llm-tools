import re
import json
from collections import defaultdict
from urllib.parse import urlparse, urlunparse, urljoin
from bs4 import BeautifulSoup, Tag
from typing import Dict, Any, List, Tuple, Optional


# ══════════════════════════════════════════════════════════════════
# Intent classification signals (spec §1.6)
# ══════════════════════════════════════════════════════════════════

_TRANSACTIONAL_SIGNALS = [
    "buy", "price", "cheap", "discount", "deal", "coupon",
    "purchase", "order", "checkout",
    "download", "hire", "shop", "cart",
    "add to cart", "sign up", "signup", "register", "enroll",
    "get started", "free trial", "demo", "request demo",
    "payment", "quote", "estimate",
]
_COMMERCIAL_SIGNALS = [
    "best", "top", "vs", "comparison", "compare", "review", "reviews",
    "alternative", "alternatives", "versus", "recommend", "rated",
    "ranking", "ranked", "pros and cons", "advantages", "disadvantages",
    "benchmark", "evaluation", "assessment",
    "software", "tool", "platform", "solution", "provider",
    "for small business", "for enterprise", "for teams",
    "cheapest", "most affordable", "premium",
]
_INFORMATIONAL_SIGNALS = [
    "what is", "what are", "how to", "how do", "guide", "tutorial",
    "learn", "understand", "explain", "definition", "meaning",
    "example", "examples", "why", "when", "tips", "tricks",
    "strategy", "strategies", "ideas", "ways to",
    "benefits", "statistics", "stats", "trends", "forecast",
    "checklist", "template", "framework", "methodology",
    "introduction", "beginner", "advanced", "complete guide",
    "ultimate guide", "step by step", "overview",
    "types of", "difference between", "basics",
]
_NAVIGATIONAL_SIGNALS = [
    "login", "log in", "signin", "sign in", "my account",
    "dashboard", "settings", "profile",
]

# ══════════════════════════════════════════════════════════════════
# Schema.org @type → classification mappings
# ══════════════════════════════════════════════════════════════════

_SCHEMA_TO_POST_TYPE: Dict[str, str] = {
    "BlogPosting": "Blog", "Article": "Blog", "NewsArticle": "Blog",
    "TechArticle": "Blog", "ScholarlyArticle": "Blog", "Report": "Blog",
    "Product": "Product Page", "IndividualProduct": "Product Page",
    "SoftwareApplication": "Tool Page", "WebApplication": "Tool Page",
    "MobileApplication": "Tool Page",
    "Service": "Service Page", "ProfessionalService": "Service Page",
    "FinancialProduct": "Product Page",
    "FAQPage": "Resource", "HowTo": "Resource",
    "Course": "Resource", "LearningResource": "Resource",
    "CollectionPage": "Category Page", "ItemList": "Category Page",
    "AboutPage": "Landing Page", "ContactPage": "Landing Page",
    "WPAdBlock": "Landing Page",
}

_SCHEMA_TO_INTENT: Dict[str, str] = {
    "Product": "T", "Offer": "T", "Order": "T", "IndividualProduct": "T",
    "BuyAction": "T", "SoftwareApplication": "T",
    "Review": "C", "CriticReview": "C", "UserReview": "C",
    "ItemList": "C", "AggregateRating": "C",
    # Generic editorial types (Article, BlogPosting, HowTo, etc.) are
    # intentionally excluded — they must NOT override keyword-based intent.
}

_SCHEMA_TO_FORMAT: Dict[str, str] = {
    "HowTo": "How to",
    "Review": "Review", "CriticReview": "Review", "UserReview": "Review",
    "ItemList": "Listicle",
}

# ══════════════════════════════════════════════════════════════════
# Expanded URL path patterns → post type
# ══════════════════════════════════════════════════════════════════

_URL_POST_TYPE_PATTERNS: List[Tuple[str, str]] = [
    (r"/blog(?:s|/)|/article(?:s|/)|/news(?:/|$)|/post(?:s|/)|/journal/|/stories/|/insights/|/thought(?:s|-)?leadership/", "Blog"),
    (r"/product(?:s|/)|/shop/|/store/|/item(?:s|/)|/goods/|/marketplace/", "Product Page"),
    (r"/pricing|/plans(?:/|$)|/packages/|/subscription", "Landing Page"),
    (r"/tool(?:s|/)|/calculator/|/generator/|/checker/|/analyzer/|/widget/|/app(?:s|/)", "Tool Page"),
    (r"/service(?:s|/)|/solution(?:s|/)|/consulting/|/agency/|/what-we-do/", "Service Page"),
    (r"/resource(?:s|/)|/guide(?:s|/)|/whitepaper(?:s|/)|/ebook(?:s|/)|/download(?:s|/)|/library/|/knowledge/|/learn/", "Resource"),
    (r"/categor(?:y|ies)/|/tag(?:s|/)|/topic(?:s|/)|/archive/|/collection(?:s|/)", "Category Page"),
    (r"/about(?:-us)?(?:/|$)|/contact(?:-us)?(?:/|$)|/team/|/career(?:s|/)|/jobs?/", "Landing Page"),
    (r"/case-stud(?:y|ies)/|/testimonial(?:s|/)|/portfolio/|/showcase/|/success-stor(?:y|ies)/", "Landing Page"),
    (r"/faq(?:s|/)|/help(?:/|$)|/support/|/docs?(?:/|$)|/documentation/|/wiki/", "Resource"),
    (r"/landing/|/lp/|/offer(?:s|/)|/promo(?:tion)?(?:s|/)|/campaign/|/webinar/", "Landing Page"),
]

# URL patterns used as navigational-intent signals
_NAV_URL_PATTERNS = re.compile(
    r"/login|/signin|/sign-in|/register|/signup|/sign-up|/account|/dashboard|/my-|/auth/",
    re.IGNORECASE,
)

# ══════════════════════════════════════════════════════════════════
# Product / concept word sets for classification
# ══════════════════════════════════════════════════════════════════

_PRODUCT_SERVICE_WORDS = frozenset({
    "tool", "tools", "software", "service", "services", "platform", "platforms",
    "solution", "solutions", "agency", "agencies", "generator", "generators",
    "maker", "makers", "website", "websites", "analyzer", "analyzers", "checker",
    "checkers", "app", "apps", "application", "applications", "system", "systems",
    "provider", "providers", "plugin", "plugins", "extension", "extensions",
    "widget", "widgets", "crm", "erp", "cms",
})

_CONCEPT_WORDS = frozenset({
    "strategies", "strategy", "ideas", "tips", "practices",
    "times", "ways", "methods", "approaches", "techniques",
})


def _has_product_context(kw: str) -> bool:
    """Check if keyword refers to products/services/tools."""
    words = set(re.split(r'[\s-]+', kw.lower()))
    return bool(words & _PRODUCT_SERVICE_WORDS)


def _kw_has_signal(kw: str, signals: list) -> bool:
    """Check if keyword contains any signal using word-boundary matching."""
    for s in signals:
        if re.search(r'\b' + re.escape(s) + r'\b', kw):
            return True
    return False


def _classify_intent(
    keyword: str,
    url: str = "",
    schema_types: Optional[List[str]] = None,
    post_category_type: str = "",
) -> str:
    """
    Multi-signal intent classification.
    Returns "C" | "I" | "T" | "N".

    Priority:
      1. Navigational URL / keyword → N
      2. Schema.org definitive types (Product, Review) → T / C
      3. Transactional keyword signals → T
      4. Strong informational keyword patterns (how to, what is) → I
      5. Post category type (alternative, review, comparison) → C / I
      6. Product/service context without informational qualifier → C
      7. Commercial keyword signals → C
      8. Informational keyword signals → I
      9. Default → I
    """
    kw = keyword.lower()

    # 1. Navigational URL patterns (highest confidence for N)
    if url and _NAV_URL_PATTERNS.search(url):
        return "N"
    if url:
        p = urlparse(url).path
        if p in ("", "/", "/index.html", "/index.htm", "/home"):
            return "N"

    # 2. Navigational keyword signals
    if _kw_has_signal(kw, _NAVIGATIONAL_SIGNALS):
        return "N"

    # 3. Schema.org for definitive types only (Product → T, Review → C)
    #    Generic editorial types (Article, BlogPosting) excluded.
    if schema_types:
        for st in schema_types:
            mapped = _SCHEMA_TO_INTENT.get(st)
            if mapped:
                return mapped

    # 4. Strong informational patterns (override commercial & transactional)
    if (re.match(r'how\s+(to|do|does|can)\b', kw)
            or re.match(r'what\s+(is|are|does|do)\b', kw)
            or re.match(r'is\s+\w', kw)):
        return "I"

    # 4b. "best practices" is an educational phrase → I
    if re.search(r'\bbest\s+practices\b', kw):
        return "I"

    # 5. Post category type signals (when available from prior extraction)
    if post_category_type:
        pct_lower = post_category_type.lower()
        if pct_lower in ("alternative", "review"):
            return "C"
        if pct_lower == "comparison":
            # Most comparisons are commercial (brand vs brand)
            return "C"

    # 6. Product/service terms without informational qualifier → C
    if _has_product_context(kw) and not re.match(r'^(what|how|why|is|does|when|are|do)\b', kw):
        return "C"

    # 7. "best/top" prefix → C
    if re.match(r'^(best|top)\s+', kw):
        return "C"

    # 8. Other commercial keyword signals (word-boundary matching)
    if _kw_has_signal(kw, _COMMERCIAL_SIGNALS):
        return "C"

    # 9. Transactional keyword signals (word-boundary, after commercial)
    if _kw_has_signal(kw, _TRANSACTIONAL_SIGNALS):
        return "T"

    # 10. Informational keyword signals
    if _kw_has_signal(kw, _INFORMATIONAL_SIGNALS):
        return "I"

    return "I"  # default


def _classify_post_category_type(
    keyword: str,
    schema_types: Optional[List[str]] = None,
    h2_texts: Optional[List[str]] = None,
    has_comparison_table: bool = False,
    has_rating_elements: bool = False,
    has_ordered_steps: bool = False,
    word_count: int = 0,
    has_form: bool = False,
    has_toc: bool = False,
    has_article_tag: bool = False,
) -> str:
    """
    Weighted multi-signal content format classification.
    Returns: "Listicle" | "comparison" | "How to" | "What" | "Alternative" | "Review"
    """
    scores: Dict[str, float] = defaultdict(float)
    kw = keyword.lower().strip()

    # ── 1. Schema.org @type (strongest structured signal) ────────
    if schema_types:
        for st in schema_types:
            mapped = _SCHEMA_TO_FORMAT.get(st)
            if mapped:
                scores[mapped] += 10

    # ── 2. Keyword pattern matching (primary signal) ─────────────
    if kw:
        # Alternative — "X alternative(s)"
        if re.search(r'\balternative(s)?\b', kw):
            scores["Alternative"] += 12

        # Review — "X review(s)"
        if re.search(r'\breview(s|ed)?\b', kw):
            scores["Review"] += 12

        # Comparison — "X vs Y", "X versus Y", "X and Y" (integration/partnership)
        if re.search(r'\bvs\.?\b|\bversus\b|\bcompar(e|ison)\b', kw):
            scores["comparison"] += 12
        if re.search(r'\band\b', kw) and _has_product_context(kw):
            scores["comparison"] += 6

        # Listicle — "best/top X" with product context, or "X competitors"
        if any(kw.startswith(p) for p in ("best ", "top ", "top-")) or "list of" in kw:
            if _has_product_context(kw):
                scores["Listicle"] += 10
            else:
                kw_words = set(re.split(r'\s+', kw))
                if kw_words & _CONCEPT_WORDS:
                    # "best strategies/ideas/tips" → What (educational)
                    scores["What"] += 6
                else:
                    # "best hashtags/X" without concept words → Listicle
                    scores["Listicle"] += 10

        if re.search(r'\bcompetitors?\b', kw):
            scores["Alternative"] += 10

        # Product/tool listing keywords without "best" prefix → Listicle signal
        if (_has_product_context(kw)
                and not any(kw.startswith(p) for p in ("best ", "top ", "top-"))
                and not re.match(r'^(how|what|is|why|when|does|do|are)\s+', kw)):
            scores["Listicle"] += 6

        # How to — "how to X", "step by step", imperative action verbs
        if re.match(r'how\s+(to|do|does|can)\b', kw):
            scores["How to"] += 12
        if re.search(r'\bstep[\s-]by[\s-]step\b|\btutorial\b', kw):
            scores["How to"] += 8

        # Imperative / gerund verbs suggesting actionable content
        if re.match(r'(build|creat|design|develop|implement|set\s+up|start|grow|increas|improv|boost|optimiz|launch|scal)(e|es|ed|ing|s)?\s+', kw):
            scores["How to"] += 8

        # What — "what is/are X", "is X ...", "types of X"
        if re.match(r'what\s+(is|are|does|do)\b', kw):
            scores["What"] += 12
        if re.match(r'is\s+\w', kw) and not re.search(r'\balternative|\bvs\b|\breview\b', kw):
            scores["What"] += 8
        if re.search(r'\btypes\s+of\b', kw):
            scores["What"] += 8
        if re.match(r'define\b|meaning\s+of\b|definition\b', kw):
            scores["What"] += 10

        # Actionable signals: strategies, optimization, techniques, best practices
        if re.search(r'\bstrateg(y|ies)\b|\boptimization\b|\btechniques?\b|\bbest\s+practices\b', kw):
            if not any(kw.startswith(p) for p in ("best ", "top ")):
                scores["How to"] += 6
        if re.search(r'\btips\b|\btricks\b|\bhacks?\b', kw):
            if not any(kw.startswith(p) for p in ("best ", "top ")):
                scores["How to"] += 5

    # ── 3. Heading structure analysis (H2 patterns) ──────────────
    if h2_texts:
        numbered = sum(1 for h in h2_texts if re.match(r"^\d+[\.\):\s]", h))
        if numbered >= 3:
            scores["Listicle"] += 8
        elif numbered >= 1:
            scores["Listicle"] += 3
        steps = sum(1 for h in h2_texts if re.match(r"^step\s+\d", h, re.I))
        if steps >= 2:
            scores["How to"] += 8
        vs_count = sum(1 for h in h2_texts if re.search(r"\bvs\.?\b|\bversus\b", h, re.I))
        if vs_count >= 1:
            scores["comparison"] += 7

    # ── 4. Content structure signals ─────────────────────────────
    if has_comparison_table:
        scores["comparison"] += 8
    if has_rating_elements:
        scores["Review"] += 6
    if has_ordered_steps:
        scores["How to"] += 7

    # ── 5. Resolve ───────────────────────────────────────────────
    if scores:
        return max(scores, key=scores.get)

    # Default: "What" (general informational/explanatory content)
    return "What"


def _classify_post_type(
    url: str,
    schema_types: Optional[List[str]] = None,
    og_type: str = "",
    has_article_tag: bool = False,
    has_date_element: bool = False,
    has_author_element: bool = False,
    has_pricing_section: bool = False,
    has_product_elements: bool = False,
    word_count: int = 0,
    has_comments: bool = False,
    has_social_share: bool = False,
    has_author_bio: bool = False,
    has_related_posts: bool = False,
    has_form: bool = False,
    has_toc: bool = False,
) -> str:
    """
    Weighted multi-signal page type classification.
    Every signal contributes points to competing categories.
    The category with the highest total score wins.
    """
    scores: Dict[str, float] = defaultdict(float)
    parsed = urlparse(url)
    path = parsed.path

    # ── Homepage detection (definitive) ──────────────────────────
    if path in ("", "/", "/index.html", "/index.htm", "/home"):
        return "Homepage"

    # ── 1. Schema.org @type (strongest signal, 10 pts) ───────────
    if schema_types:
        for st in schema_types:
            mapped = _SCHEMA_TO_POST_TYPE.get(st)
            if mapped:
                scores[mapped] += 10

    # ── 2. Open Graph type (7 pts) ───────────────────────────────
    if og_type:
        og_lower = og_type.lower()
        if og_lower in ("article", "blog"):
            scores["Blog"] += 7
        elif og_lower == "product":
            scores["Product Page"] += 7

    # ── 3. HTML semantic structure ───────────────────────────────
    # Article tag + date + author = strong blog signal
    if has_article_tag:
        scores["Blog"] += 3
        if has_date_element:
            scores["Blog"] += 3  # cumulative: article+date = 6
        if has_author_element:
            scores["Blog"] += 2  # cumulative: article+date+author = 8

    # Individual date/author signals (weaker alone)
    if has_date_element and not has_article_tag:
        scores["Blog"] += 1
    if has_author_element and not has_article_tag:
        scores["Blog"] += 1

    # Blog-specific page components
    if has_comments:
        scores["Blog"] += 4
    if has_social_share:
        scores["Blog"] += 2
    if has_author_bio:
        scores["Blog"] += 3
    if has_related_posts:
        scores["Blog"] += 3

    # Product signals
    if has_product_elements:
        scores["Product Page"] += 6

    # Pricing = landing or product context
    if has_pricing_section:
        scores["Landing Page"] += 4

    # Form — very low weight for Landing Page (blogs also have forms)
    if has_form and not has_article_tag and word_count < 500:
        scores["Landing Page"] += 2

    # Table of contents = substantive content (blog/resource)
    if has_toc:
        scores["Blog"] += 2
        scores["Resource"] += 2

    # ── 4. URL path patterns (5 pts) ────────────────────────────
    path_lower = path.lower()
    for pattern, post_type in _URL_POST_TYPE_PATTERNS:
        if re.search(pattern, path_lower):
            scores[post_type] += 5
            break  # first match wins for URL

    # ── 5. Content depth signals ─────────────────────────────────
    if word_count > 1000:
        scores["Blog"] += 3
    elif word_count > 500:
        scores["Blog"] += 1
    elif word_count < 200:
        scores["Landing Page"] += 2

    # Shallow pages with no strong content signals lean toward landing
    depth = len([s for s in path.split("/") if s])
    if depth <= 1:
        scores["Landing Page"] += 2

    # ── 6. Resolve ───────────────────────────────────────────────
    if scores:
        return max(scores, key=scores.get)

    # No signals at all — shallow = landing page, deep = blog
    if depth <= 1:
        return "Landing Page"
    return "Landing Page"


def _classify_page_type(
    post_category_type: str = "",
    inlinks_count: int = 0,
    url_depth: int = 0,
    keyword: str = "",
) -> str:
    """
    Classify Hub / Spoke / Sub-Spoke.

    Primary signal: post_category_type (content format).
    Secondary signal: inlink count (fallback when format is unknown).

    Hub:       Listicle, Alternative (central resource / pillar pages)
    Spoke:     Comparison, Review, and broad How-to / What pages
    Sub-Spoke: Fallback for unknown format with low inlinks
    """
    pct = post_category_type.lower() if post_category_type else ""

    # Listicle / Alternative → Hub (pillar content)
    if pct in ("listicle", "alternative"):
        return "Hub"

    # Comparison / Review → Spoke (detailed topical pages)
    if pct in ("comparison", "review"):
        return "Spoke"

    # How to / What → Spoke (majority of informational content)
    # Exception: "best/top X" articles serve as pillar hub content
    if pct in ("how to", "what"):
        if keyword and re.match(r'(best|top)\s+', keyword.lower()):
            kw_words = set(re.split(r'\s+', keyword.lower()))
            # Exclude concept/strategy words — these are educational, not pillar
            if not (kw_words & frozenset({"strategies", "strategy", "techniques", "methods", "approaches", "practices"})):
                return "Hub"
        return "Spoke"

    # No post_category_type available: fall back to link-based heuristics
    if inlinks_count >= 30 and url_depth <= 2:
        return "Hub"
    if inlinks_count >= 10:
        return "Spoke"
    return "Sub-Spoke"


# Segments that are structural (not topical) — skipped when inferring category
_GENERIC_URL_SEGMENTS = frozenset({
    "blog", "blogs", "post", "posts", "article", "articles", "page", "pages",
    "category", "categories", "tag", "tags", "archive", "archives",
    "resources", "news", "stories", "insights", "en", "us", "www",
})


class PageMetricsAgent:
    """
    Content audit data extraction agent for Module 1 — Page Metrics.

    Resolves the 7 fields defined in the Content Audit spec:
      1.1  url                — normalised canonical URL
      1.2  page_category      — topic category (WP → breadcrumb → URL → meta fallback)
      1.3  post_category_type — content format (listicle/comparison/how-to/what/alternative/review)
      1.4  page_type          — Hub / Spoke / Sub-Spoke (inlink graph)
      1.5  post_type          — Blog / Landing Page / Tool Page / ...
      1.6  intent             — C / I / T / N
      1.7  primary_keyword    — from keyword_bundle or AI-extracted from title/H1
    """

    def __init__(
        self,
        url: str,
        existing_data: Dict[str, Any] = None,
        html_content: str = "",
        status_code: int = 200,
        headers: Dict[str, str] = None,
        crawl_graph: Dict[str, Any] = None,
        main_keyword: str = "",
        # keyword_bundle from KeywordFinder (preferred source)
        keyword_bundle=None,
        # pre-parsed title / h1 (avoids re-parsing giant HTML strings)
        title: str = "",
        h1: str = "",
        dfs_credentials: Tuple[str, str] = None,
    ):
        self.raw_url = url
        self.existing_data = existing_data or {}
        self.soup = BeautifulSoup(html_content, "lxml") if html_content else None
        self.status_code = status_code
        self.headers = {k.lower(): str(v) for k, v in (headers or {}).items()}
        self.crawl_graph = crawl_graph or {}
        self.main_keyword = main_keyword
        self.keyword_bundle = keyword_bundle
        self._title = title
        self._h1 = h1
        self.dfs_credentials = dfs_credentials

        self.audit_log: Dict[str, str] = {}
        self.metrics: Dict[str, Any] = {}

        self.parsed_url = urlparse(self.raw_url)
        self.base_url = f"{self.parsed_url.scheme}://{self.parsed_url.netloc}"
        self.path_segments = [p for p in self.parsed_url.path.split("/") if p]
        self.slug = self.path_segments[-1] if self.path_segments else ""
        self.folder_depth = len(self.path_segments)

        # Lazy-initialised page signals (populated once by _extract_page_signals)
        self._signals: Optional[Dict[str, Any]] = None

    # ─────────────────────────────────────────────
    # Page signal extraction (runs once, caches)
    # ─────────────────────────────────────────────

    def _extract_page_signals(self) -> Dict[str, Any]:
        """Extract all strong on-page signals from HTML once.

        Returns a dict with:
          schema_types, og_type, og_article_section,
          has_article_tag, has_date_element, has_author_element,
          has_pricing_section, has_product_elements,
          has_comparison_table, has_rating_elements, has_ordered_steps,
          has_comments, has_social_share, has_author_bio,
          has_related_posts, has_toc,
          h2_texts, word_count, wp_category, schema_article_section
        """
        if self._signals is not None:
            return self._signals

        sig: Dict[str, Any] = {
            "schema_types": [],
            "og_type": "",
            "og_article_section": "",
            "has_article_tag": False,
            "has_date_element": False,
            "has_author_element": False,
            "has_pricing_section": False,
            "has_product_elements": False,
            "has_comparison_table": False,
            "has_rating_elements": False,
            "has_ordered_steps": False,
            "has_comments": False,
            "has_social_share": False,
            "has_author_bio": False,
            "has_related_posts": False,
            "has_toc": False,
            "h2_texts": [],
            "word_count": 0,
            "wp_category": "",
            "schema_article_section": "",
        }

        if not self.soup:
            self._signals = sig
            return sig

        # ── Schema.org JSON-LD ──────────────────────────────────
        for script in self.soup.find_all("script", attrs={"type": "application/ld+json"}):
            try:
                raw = script.string
                if not raw:
                    continue
                data = json.loads(raw)
                items = data if isinstance(data, list) else [data]
                for item in items:
                    st = item.get("@type")
                    if st:
                        if isinstance(st, list):
                            sig["schema_types"].extend(st)
                        else:
                            sig["schema_types"].append(st)
                    # Schema articleSection
                    if not sig["schema_article_section"]:
                        sec = item.get("articleSection")
                        if sec:
                            sig["schema_article_section"] = sec if isinstance(sec, str) else sec[0]
                    # Schema about.name
                    if not sig["schema_article_section"]:
                        about = item.get("about")
                        if isinstance(about, dict) and about.get("name"):
                            sig["schema_article_section"] = about["name"]
            except (json.JSONDecodeError, TypeError, KeyError):
                pass

        # ── Open Graph & meta tags ──────────────────────────────
        for meta in self.soup.find_all("meta"):
            prop = str(meta.get("property", "")).lower()
            name = str(meta.get("name", "")).lower()
            content = str(meta.get("content", "")).strip()
            if prop == "og:type" and content:
                sig["og_type"] = content
            if prop == "article:section" and content:
                sig["og_article_section"] = content
            # WordPress category meta (used by Yoast and RankMath)
            if prop == "article:tag" and content and not sig["wp_category"]:
                sig["wp_category"] = content

        # ── HTML semantic structure ─────────────────────────────
        sig["has_article_tag"] = self.soup.find("article") is not None

        # Date elements: <time>, meta[property=article:published_time],
        # or common date class patterns
        sig["has_date_element"] = (
            self.soup.find("time") is not None
            or self.soup.find("meta", attrs={"property": "article:published_time"}) is not None
            or self.soup.find(attrs={"class": re.compile(r"date|published|posted", re.I)}) is not None
        )

        # Author detection: <a rel=author>, .author class, meta author
        sig["has_author_element"] = (
            self.soup.find("a", attrs={"rel": "author"}) is not None
            or self.soup.find(attrs={"class": re.compile(r"author", re.I)}) is not None
            or self.soup.find("meta", attrs={"name": "author"}) is not None
        )

        # Pricing section: elements with price/pricing class or schema Offer
        sig["has_pricing_section"] = (
            self.soup.find(attrs={"class": re.compile(r"pric(e|ing)", re.I)}) is not None
            or any(st in ("Offer", "AggregateOffer") for st in sig["schema_types"])
        )

        # Product elements: .product class, [itemprop=price], add-to-cart
        sig["has_product_elements"] = (
            self.soup.find(attrs={"class": re.compile(r"product", re.I)}) is not None
            or self.soup.find(attrs={"itemprop": "price"}) is not None
            or self.soup.find(attrs={"class": re.compile(r"add.to.cart|buy.now", re.I)}) is not None
            or any(st in ("Product", "IndividualProduct") for st in sig["schema_types"])
        )

        # ── Heading structure (H2s) ─────────────────────────────
        h2_tags = self.soup.find_all("h2")
        sig["h2_texts"] = [h2.get_text(strip=True) for h2 in h2_tags if h2.get_text(strip=True)]

        # Comparison table: tables with "vs" or "comparison" in caption/headers,
        # or tables with >2 cols inside an element with comparison-related class
        for table in self.soup.find_all("table"):
            caption = table.find("caption")
            if caption and re.search(r"\bvs\.?\b|compar|versus", caption.get_text(), re.I):
                sig["has_comparison_table"] = True
                break
            headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
            if len(headers) >= 3 and any(re.search(r"\bvs\.?\b|feature|compar", h) for h in headers):
                sig["has_comparison_table"] = True
                break

        # Rating elements: star ratings, review scores
        sig["has_rating_elements"] = (
            self.soup.find(attrs={"class": re.compile(r"rating|star|score|review", re.I)}) is not None
            or self.soup.find(attrs={"itemprop": re.compile(r"ratingValue|reviewRating", re.I)}) is not None
            or any(st in ("Review", "AggregateRating") for st in sig["schema_types"])
        )

        # Ordered steps: <ol> with >2 <li>, or heading+numbered paragraphs
        for ol in self.soup.find_all("ol"):
            lis = ol.find_all("li", recursive=False)
            if len(lis) >= 3:
                sig["has_ordered_steps"] = True
                break
        if not sig["has_ordered_steps"] and sig["h2_texts"]:
            step_count = sum(1 for h in sig["h2_texts"] if re.match(r"^step\s+\d", h, re.I))
            if step_count >= 2:
                sig["has_ordered_steps"] = True

        # Word count of main text content
        main_el = self.soup.find("main") or self.soup.find("article") or self.soup.find("body")
        if main_el:
            text = main_el.get_text(separator=" ", strip=True)
            sig["word_count"] = len(text.split())

        # ── Blog-specific page components ───────────────────────
        # Comments section: #comments, #disqus, .comments, comment-respond
        sig["has_comments"] = (
            self.soup.find(id=re.compile(r"comment|disqus|respond", re.I)) is not None
            or self.soup.find(attrs={"class": re.compile(r"comment(?:s|-section|-list|-area)", re.I)}) is not None
        )

        # Social sharing: share buttons, addthis, shareaholic
        sig["has_social_share"] = (
            self.soup.find(attrs={"class": re.compile(r"shar(e|ing)(?:-buttons|-bar|-icons|-widget)?", re.I)}) is not None
            or self.soup.find(attrs={"class": re.compile(r"social.shar", re.I)}) is not None
            or self.soup.find(attrs={"class": re.compile(r"addthis|shareaholic|sharethis", re.I)}) is not None
        )

        # Author bio section (distinct from author byline)
        sig["has_author_bio"] = (
            self.soup.find(attrs={"class": re.compile(r"author.bio|about.the.author|author.info|author.box|author.profile", re.I)}) is not None
        )

        # Related posts / recommended articles
        sig["has_related_posts"] = (
            self.soup.find(attrs={"class": re.compile(r"related.posts|related.articles|you.may.also|recommended|more.stories|further.reading", re.I)}) is not None
        )

        # Table of contents
        sig["has_toc"] = (
            self.soup.find(id=re.compile(r"^toc$|table.of.contents", re.I)) is not None
            or self.soup.find(attrs={"class": re.compile(r"\btoc\b|table.of.contents|article.index|ez-toc", re.I)}) is not None
        )

        self._signals = sig
        return sig

    # ─────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────

    def _is_valid(self, val: Any) -> bool:
        if val is None:
            return False
        if isinstance(val, str) and val.strip() in ("", "N/A"):
            return False
        return True

    def _check_existing(self, field: str) -> bool:
        val = self.existing_data.get(field)
        if field == "status_code" and val is not None and val != 0:
            self.metrics[field] = val
            self.audit_log[field] = "[FOUND]"
            return True
        if field != "status_code" and self._is_valid(val):
            self.metrics[field] = val
            self.audit_log[field] = "[FOUND]"
            return True
        return False

    def _get_title(self) -> str:
        if self._title:
            return self._title
        if self.soup:
            tag = self.soup.find("title")
            if tag:
                self._title = tag.get_text(strip=True)
                return self._title
        return ""

    def _get_h1(self) -> str:
        if self._h1:
            return self._h1
        if self.soup:
            tag = self.soup.find("h1")
            if tag:
                self._h1 = tag.get_text(strip=True)
                return self._h1
        return ""

    def _get_meta_desc(self) -> str:
        if self.soup:
            for meta in self.soup.find_all("meta"):
                if re.match(r"^description$", str(meta.get("name", "")), re.I):
                    return meta.get("content", "").strip()
        return ""

    def _has_form(self) -> bool:
        """Return True if the page contains a form with at least one input field."""
        if not self.soup:
            return False
        for form in self.soup.find_all("form"):
            if form.find(["input", "textarea", "select"]):
                return True
        return False

    # ─────────────────────────────────────────────
    # Field 1.1 — URL
    # ─────────────────────────────────────────────

    def extract_url(self):
        """Normalise: lowercase scheme+netloc, strip trailing slash, keep path as-is."""
        if self._check_existing("url"):
            return
        self.audit_log["url"] = "[EXTRACTING]"
        scheme = self.parsed_url.scheme.lower()
        netloc = self.parsed_url.netloc.lower()
        path = self.parsed_url.path
        if path != "/" and path.endswith("/"):
            path = path.rstrip("/")
        norm = urlunparse((
            scheme, netloc, path,
            self.parsed_url.params,
            self.parsed_url.query,
            self.parsed_url.fragment,
        ))
        self.metrics["url"] = norm
        self.audit_log["url"] = "[OK]"

    # ─────────────────────────────────────────────
    # Field 1.2 — Page Category
    # ─────────────────────────────────────────────

    def extract_page_category(self):
        """
        Multi-signal page category resolution.
        Priority:
          1. OG article:section — explicit category declared by the page
          2. Schema.org articleSection / about.name
          3. WordPress category meta tag (article:tag from Yoast / RankMath)
          4. Breadcrumb nav (second-to-last crumb)
          5. First meaningful URL segment (skip generic structural segments)
        """
        if self._check_existing("page_category"):
            return
        self.audit_log["page_category"] = "[EXTRACTING]"
        sig = self._extract_page_signals()

        # 1. OG article:section (explicit, highest confidence)
        if sig["og_article_section"]:
            self.metrics["page_category"] = sig["og_article_section"].title()
            self.audit_log["page_category"] = "[og:article:section]"
            return

        # 2. Schema.org articleSection or about.name
        if sig["schema_article_section"]:
            self.metrics["page_category"] = sig["schema_article_section"].title()
            self.audit_log["page_category"] = "[schema]"
            return

        # 3. WordPress / Yoast / RankMath category meta
        if sig["wp_category"]:
            self.metrics["page_category"] = sig["wp_category"].title()
            self.audit_log["page_category"] = "[wp-meta]"
            return

        # 4. Breadcrumb nav (second-to-last crumb = section)
        if self.soup:
            for sel in (
                "nav[aria-label*='breadcrumb'] a",
                "ol.breadcrumb a",
                "ul.breadcrumbs a",
                ".breadcrumb a",
                "[class*='breadcrumb'] a",
            ):
                crumbs = self.soup.select(sel)
                if len(crumbs) >= 2:
                    cat = crumbs[-2].get_text(strip=True)
                    if cat and cat.lower() not in ("home", ""):
                        self.metrics["page_category"] = cat.title()
                        self.audit_log["page_category"] = "[breadcrumb]"
                        return

        # 5. First meaningful URL segment (skip structural/generic/numeric)
        for seg in self.path_segments:
            seg_lower = seg.lower()
            if seg_lower not in _GENERIC_URL_SEGMENTS and not re.match(r"^\d+$", seg_lower):
                self.metrics["page_category"] = seg_lower.replace("-", " ").replace("_", " ").title()
                self.audit_log["page_category"] = "[url-segment]"
                return

        # 6. Title / H1 subject extraction — derive topic from the main heading
        for text in (self._get_title(), self._get_h1()):
            if text:
                # Strip brand suffix ("Title | Brand") and take the leading phrase
                base = re.split(r"\s*[|\u2013\u2014]\s*", text)[0].strip()
                # Take first noun-phrase before colon / dash
                phrase = re.split(r"\s*[:;]\s*", base)[0].strip()
                if len(phrase) >= 3:
                    self.metrics["page_category"] = phrase.title()
                    self.audit_log["page_category"] = "[title-derived]"
                    return

        # 7. Homepage fallback
        path = self.parsed_url.path
        if path in ("", "/", "/index.html", "/index.htm", "/home"):
            self.metrics["page_category"] = self.parsed_url.netloc.split(".")[0].title()
            self.audit_log["page_category"] = "[domain]"
            return

        # 8. Final: derive from slug (every URL segment carries meaning)
        if self.slug:
            self.metrics["page_category"] = self.slug.replace("-", " ").replace("_", " ").title()
            self.audit_log["page_category"] = "[slug]"
        else:
            self.metrics["page_category"] = self.parsed_url.netloc.split(".")[0].title()
            self.audit_log["page_category"] = "[domain]"

    # ─────────────────────────────────────────────
    # Field 1.3 — Post Category Type
    # ─────────────────────────────────────────────

    def extract_post_category_type(self):
        """
        Weighted multi-signal content format classification.
        Passes all available signals into a single scoring call; the scorer
        accumulates evidence from schema, headings, HTML, URL and keyword
        and returns the highest-scoring format.
        """
        if self._check_existing("post_category_type"):
            return
        self.audit_log["post_category_type"] = "[EXTRACTING]"
        sig = self._extract_page_signals()

        # Use keyword_bundle.post_category_type if already resolved upstream
        if self.keyword_bundle and getattr(self.keyword_bundle, "post_category_type", None):
            upstream = self.keyword_bundle.post_category_type
            if upstream and upstream != "other":
                self.metrics["post_category_type"] = upstream
                self.audit_log["post_category_type"] = "[keyword_bundle]"
                return

        # Collect all keyword sources to feed into the scorer
        keyword = self._resolve_primary_keyword() or ""
        h1 = self._get_h1() or ""
        slug_text = self.slug.replace("-", " ").replace("_", " ") if self.slug else ""

        # Common signal kwargs for the scorer
        signal_kwargs = dict(
            schema_types=sig["schema_types"],
            h2_texts=sig["h2_texts"],
            has_comparison_table=sig["has_comparison_table"],
            has_rating_elements=sig["has_rating_elements"],
            has_ordered_steps=sig["has_ordered_steps"],
            word_count=sig["word_count"],
            has_form=self._has_form(),
            has_toc=sig["has_toc"],
            has_article_tag=sig["has_article_tag"],
        )

        # Try with primary keyword (richest signal)
        result = _classify_post_category_type(keyword=keyword, **signal_kwargs)

        # If result is the generic default, try H1/slug for more specific signals
        if result == "What":
            if h1 and h1.lower() != keyword:
                h1_result = _classify_post_category_type(keyword=h1, **signal_kwargs)
                if h1_result != "What":
                    result = h1_result

        if result == "What":
            if slug_text and slug_text.lower() != keyword:
                slug_result = _classify_post_category_type(keyword=slug_text, **signal_kwargs)
                if slug_result != "What":
                    result = slug_result

        self.metrics["post_category_type"] = result
        self.audit_log["post_category_type"] = "[multi-signal]"

    # ─────────────────────────────────────────────
    # Field 1.4 — Page Type (Hub / Spoke / Sub-Spoke)
    # ─────────────────────────────────────────────

    def extract_page_type(self):
        """
        Classify Hub / Spoke / Sub-Spoke.
        Primary signal: post_category_type (must be extracted first).
        Fallback: inlink count + URL depth when format is unknown.
        """
        if self._check_existing("page_type"):
            return
        self.audit_log["page_type"] = "[EXTRACTING]"

        post_category_type = self.metrics.get("post_category_type", "")
        inlinks = self.crawl_graph.get("inlink_count", 0) or 0
        keyword = self._resolve_primary_keyword() or ""

        self.metrics["page_type"] = _classify_page_type(
            post_category_type=post_category_type,
            inlinks_count=inlinks,
            url_depth=self.folder_depth,
            keyword=keyword,
        )
        self.audit_log["page_type"] = "[content-type]" if post_category_type else "[link-heuristic]"

    # ─────────────────────────────────────────────
    # Field 1.5 — Post Type
    # ─────────────────────────────────────────────

    def extract_post_type(self):
        """
        Weighted multi-signal post type classification.
        Passes all HTML signals including blog-specific components
        (comments, social share, author bio, related posts) into
        the scorer for accurate differentiation.
        """
        if self._check_existing("post_type"):
            return
        self.audit_log["post_type"] = "[EXTRACTING]"
        sig = self._extract_page_signals()
        self.metrics["post_type"] = _classify_post_type(
            url=self.raw_url,
            schema_types=sig["schema_types"],
            og_type=sig["og_type"],
            has_article_tag=sig["has_article_tag"],
            has_date_element=sig["has_date_element"],
            has_author_element=sig["has_author_element"],
            has_pricing_section=sig["has_pricing_section"],
            has_product_elements=sig["has_product_elements"],
            word_count=sig["word_count"],
            has_comments=sig["has_comments"],
            has_social_share=sig["has_social_share"],
            has_author_bio=sig["has_author_bio"],
            has_related_posts=sig["has_related_posts"],
            has_form=self._has_form(),
            has_toc=sig["has_toc"],
        )
        self.audit_log["post_type"] = "[multi-signal]"

    # ─────────────────────────────────────────────
    # Field 1.6 — Intent
    # ─────────────────────────────────────────────

    def extract_intent(self):
        """
        Multi-signal intent classification.
        Priority:
          1. keyword_bundle.intent (resolved upstream with DataForSEO)
          2. Multi-signal from keyword + URL + schema.org + post_category_type
          3. Slug fallback
        """
        if self._check_existing("intent"):
            return
        self.audit_log["intent"] = "[EXTRACTING]"
        sig = self._extract_page_signals()

        # 1. Use intent from keyword_bundle (resolved upstream, highest quality)
        if self.keyword_bundle and getattr(self.keyword_bundle, "intent", None):
            self.metrics["intent"] = self.keyword_bundle.intent
            self.audit_log["intent"] = "[keyword_bundle]"
            return

        post_category_type = self.metrics.get("post_category_type", "")

        # 2. Multi-signal: keyword + URL + schema types + post_category_type
        keyword = self._resolve_primary_keyword()
        if keyword:
            self.metrics["intent"] = _classify_intent(
                keyword, url=self.raw_url,
                schema_types=sig["schema_types"],
                post_category_type=post_category_type,
            )
            self.audit_log["intent"] = "[multi-signal]"
            return

        # 3. Fallback: slug + URL + schema
        slug_text = self.slug.replace("-", " ").replace("_", " ")
        self.metrics["intent"] = _classify_intent(
            slug_text, url=self.raw_url,
            schema_types=sig["schema_types"],
            post_category_type=post_category_type,
        )
        self.audit_log["intent"] = "[slug-multi-signal]"

    # ─────────────────────────────────────────────
    # Field 1.7 — Primary Keyword
    # ─────────────────────────────────────────────

    def _resolve_primary_keyword(self) -> str:
        """
        Resolve the best primary keyword from available sources.
        Priority: provided main_keyword → keyword_bundle.primary_keyword
                  → title-derived → H1 → slug
        """
        if self.main_keyword and self.main_keyword.strip():
            return self.main_keyword.strip().lower()
        if self.keyword_bundle and getattr(self.keyword_bundle, "primary_keyword", None):
            return self.keyword_bundle.primary_keyword
        title = self._get_title()
        if title:
            # Strip brand suffix and return the leading clause
            parts = re.split(r"\s*[|\u2013\u2014]\s*", title)
            candidate = parts[0].strip()
            clause = re.split(r"\s*[:;]\s*", candidate)[0].strip()
            if len(clause) >= 3:
                return clause.lower()
        h1 = self._get_h1()
        if h1 and len(h1.strip()) >= 3:
            return h1.strip().lower()
        if self.slug:
            return self.slug.replace("-", " ").replace("_", " ").lower()
        return ""

    def extract_primary_keyword(self):
        """Field 1.7 — Primary keyword per spec §1.7."""
        if self._check_existing("primary_keyword"):
            return
        self.audit_log["primary_keyword"] = "[EXTRACTING]"
        kw = self._resolve_primary_keyword()
        self.metrics["primary_keyword"] = kw if kw else None
        source = "keyword_bundle" if (self.keyword_bundle and getattr(self.keyword_bundle, "primary_keyword", None)) else "derived"
        self.audit_log["primary_keyword"] = f"[{source}]"

    # ─────────────────────────────────────────────
    # Retained fields (canonical, indexability, etc.)
    # ─────────────────────────────────────────────

    def extract_status_code(self):
        if self._check_existing("status_code"):
            return
        self.metrics["status_code"] = self.status_code
        self.audit_log["status_code"] = "[crawl]"

    def extract_canonical_url(self):
        if self._check_existing("canonical_url") and self._check_existing("is_self_canonical"):
            return
        self.audit_log["canonical_url"] = "[EXTRACTING]"
        canonical = None
        if self.soup:
            tag = self.soup.find("link", rel="canonical")
            if tag:
                canonical = tag.get("href")
        if not canonical:
            link_header = self.headers.get("link", "")
            m = re.search(r"<([^>]+)>;\s*rel=\"canonical\"", link_header, re.I)
            if m:
                canonical = m.group(1)
        current_url = self.metrics.get("url", self.raw_url)
        if canonical:
            canonical = urljoin(current_url, canonical)
        self.metrics["canonical_url"] = canonical
        if "is_self_canonical" not in self.metrics:
            if canonical:
                self.metrics["is_self_canonical"] = (
                    canonical.rstrip("/") == current_url.rstrip("/")
                )
            else:
                self.metrics["is_self_canonical"] = False
        self.audit_log["canonical_url"] = "[OK]"

    def extract_indexability(self):
        if self._check_existing("indexability"):
            return
        if self.status_code != 200:
            self.metrics["indexability"] = "Non-Indexable"
            return
        if self.soup:
            robots_meta = self.soup.find("meta", attrs={"name": re.compile(r"^robots$", re.I)})
            if robots_meta and "noindex" in robots_meta.get("content", "").lower():
                self.metrics["indexability"] = "Non-Indexable"
                return
        if "noindex" in self.headers.get("x-robots-tag", "").lower():
            self.metrics["indexability"] = "Non-Indexable"
            return
        if not self.metrics.get("is_self_canonical", True) and self.metrics.get("canonical_url"):
            self.metrics["indexability"] = "Non-Indexable (Canonicalised)"
            return
        self.metrics["indexability"] = "Indexable"
        self.audit_log["indexability"] = "[OK]"

    def extract_redirect_target(self):
        if self._check_existing("redirect_target"):
            return
        if self.status_code in (301, 302, 307, 308):
            loc = self.headers.get("location")
            current_url = self.metrics.get("url", self.raw_url)
            self.metrics["redirect_target"] = urljoin(current_url, loc) if loc else None
        else:
            self.metrics["redirect_target"] = None
        self.audit_log["redirect_target"] = "[OK]"

    # ─────────────────────────────────────────────
    # Execute
    # ─────────────────────────────────────────────

    def execute(self) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """
        Run all Module 1 field extractions in dependency order.
        """
        # URL must be first (other fields may reference self.metrics['url'])
        self.extract_url()

        # Extract all HTML signals once (used by subsequent classifiers)
        self._extract_page_signals()

        # Module 1 fields (spec §1.2 – §1.7)
        self.extract_page_category()
        self.extract_post_category_type()
        self.extract_page_type()
        self.extract_post_type()
        self.extract_intent()
        self.extract_primary_keyword()

        # Supporting fields
        self.extract_status_code()
        self.extract_canonical_url()
        self.extract_indexability()
        self.extract_redirect_target()

        # Guarantee all required keys exist
        for key in (
            "url", "page_category", "post_category_type", "page_type",
            "post_type", "intent", "primary_keyword", "status_code",
            "indexability", "canonical_url", "is_self_canonical", "redirect_target",
        ):
            self.metrics.setdefault(key, None)

        return self.metrics, self.audit_log


def extract_advanced_page_metrics(
    url: str,
    existing_data: Dict[str, Any] = None,
    **kwargs,
) -> Tuple[Dict[str, Any], Dict[str, str]]:
    """Convenience wrapper — instantiates PageMetricsAgent and runs extraction."""
    agent = PageMetricsAgent(url, existing_data, **kwargs)
    return agent.execute()

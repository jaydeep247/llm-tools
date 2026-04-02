"""
Content Metrics Sub-module

Extracts word counts (current, SERP intent, gap) and published/upgrade dates.
"""
import asyncio
import logging
import re
import statistics
from dataclasses import dataclass, field
from typing import Any, Dict, FrozenSet, Optional, Tuple
from urllib.parse import urlparse

from bs4 import BeautifulSoup

try:
    import trafilatura
    _TRAFILATURA_AVAILABLE = True
except ImportError:
    _TRAFILATURA_AVAILABLE = False

try:
    from readability import Document as ReadabilityDocument
    _READABILITY_AVAILABLE = True
except ImportError:
    _READABILITY_AVAILABLE = False

try:
    from orchestrator.checkpoint.executor import execute_task
except ImportError:
    execute_task = None

logger = logging.getLogger(__name__)


# ── SERP Filter Configuration ──────────────────────────────────────────────────

@dataclass
class SerpFilterConfig:
    """
    Controls which SERP results are excluded from the word-count benchmark.

    All four filter sets are fully overridable at call time via:
        extract_content_metrics(..., serp_filter_config=SerpFilterConfig(...))

    Pass an empty tuple/frozenset for any field to disable that filter entirely.

    Design notes vs the old hardcoded constants:
    - "best " and "top " removed from title_exclude_hints — listicle/roundup
      pages are valid word-count benchmarks for informational keywords.
    - "/list/" removed from path_exclude_hints — too broad, hits legitimate
      article paths on many CMSes.
    - host_exclude_suffixes expanded to cover review, job, and e-commerce
      platforms that never produce useful article benchmarks.
    - intent_terms expanded to ~25 tokens covering all common commercial
      intent variants (was only 8).
    - min_token_overlap is configurable so you can loosen for short keywords.
    """

    # Domains that are structurally incapable of providing a useful word-count proxy
    host_exclude_suffixes: Tuple[str, ...] = field(default_factory=lambda: (
        "reddit.com",
        "quora.com",
        "stackexchange.com",
        "stackoverflow.com",
        "youtube.com",
        "vimeo.com",
        "dailymotion.com",
        "facebook.com",
        "instagram.com",
        "tiktok.com",
        "x.com",
        "twitter.com",
        "linkedin.com",
        "pinterest.com",
        "yelp.com",
        "tripadvisor.com",
        "trustpilot.com",
        "g2.com",
        "capterra.com",
        "glassdoor.com",
        "indeed.com",
        "amazon.com",
        "ebay.com",
        "etsy.com",
        "walmart.com",
    ))

    # URL path fragments that indicate a search/browse/video/transactional page
    path_exclude_hints: Tuple[str, ...] = field(default_factory=lambda: (
        "/search",
        "/directory/",
        "/watch",
        "/video/",
        "/videos/",
        "/forum/",
        "/forums/",
        "/community/",
        "/q/",
        "/questions/",
        "/tag/",
        "/tags/",
        "/category/",
        "/categories/",
        "/shop/",
        "/product/",
        "/products/",
        "/cart",
        "/checkout",
        "/login",
        "/signup",
        "/register",
    ))

    # Title prefixes that indicate an aggregation page, not a standalone article.
    # Intentionally minimal — "best " and "top " removed vs the old hardcoded
    # defaults because listicle pages are valid content benchmarks.
    title_exclude_hints: Tuple[str, ...] = field(default_factory=lambda: (
        "vs ",
        "vs. ",
        "[video]",
        "[podcast]",
    ))

    # Tokens that signal commercial/transactional service intent.
    # When the keyword contains any of these, SERP URLs that don't also
    # contain at least one are flagged as intent-misaligned and deprioritised
    # (moved to fallback pool, not hard-excluded).
    intent_terms: FrozenSet[str] = field(default_factory=lambda: frozenset({
        # Agency / company
        "agency", "agencies",
        "company", "companies",
        "firm", "firms",
        "studio", "studios",
        # Service
        "service", "services",
        "solution", "solutions",
        "platform", "platforms",
        "tool", "tools",
        "software",
        # Consulting
        "consulting", "consultancy",
        "consultant", "consultants",
        "advisory",
        # Hire / outsource
        "hire", "outsource",
        "freelance", "freelancer",
        "managed",
        "provider", "providers",
        "vendor", "vendors",
    }))

    # Minimum keyword-token overlap required with title+URL-path tokens.
    # Lower = more permissive. Set to 1 for very short (1–2 word) keywords.
    min_token_overlap: int = 2


# Module-level default — used when no override is passed to extract_content_metrics
_DEFAULT_SERP_FILTER = SerpFilterConfig()


# ── Word-count & date helpers ──────────────────────────────────────────────────

def _coerce_non_negative_int(value: Any) -> Optional[int]:
    """Best-effort integer coercion for persisted metric values."""
    if value is None or value == "":
        return None
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized >= 0 else None


def _keyword_from_keyword_bundle(keyword_bundle: Any) -> str:
    """Use the crawl-time keyword bundle as the SERP keyword source."""
    if not keyword_bundle:
        return ""
    if isinstance(keyword_bundle, dict):
        return str(keyword_bundle.get("primary_keyword") or keyword_bundle.get("primaryKeyword") or "").strip()
    return str(getattr(keyword_bundle, "primary_keyword", "") or "").strip()


def _normalise_iso_date(raw: Optional[str]) -> Optional[str]:
    """Normalise any date/datetime string to YYYY-MM-DD. Returns None on failure."""
    if not raw:
        return None
    try:
        from dateutil import parser as dateutil_parser
        return dateutil_parser.parse(str(raw).strip()).strftime("%Y-%m-%d")
    except Exception:
        trimmed = str(raw).strip()[:10]
        return trimmed if len(trimmed) == 10 and trimmed[4] == "-" else None


def _extract_word_count_from_html(html_content: str) -> int:
    """
    Extract main-content word count from raw HTML.
    Priority: trafilatura -> readability-lxml -> BeautifulSoup heuristic.
    """
    if not html_content:
        return 0

    if _TRAFILATURA_AVAILABLE:
        try:
            text = trafilatura.extract(
                html_content,
                include_comments=False,
                include_tables=True,
                no_fallback=False,
            )
            if text and len(text.strip()) > 20:
                return len(text.split())
        except Exception as exc:
            logger.debug(f"trafilatura extraction failed: {exc}")

    if _READABILITY_AVAILABLE:
        try:
            doc = ReadabilityDocument(html_content)
            soup = BeautifulSoup(doc.summary(), "html.parser")
            words = [w for w in soup.get_text(separator=" ").split() if w.strip()]
            if len(words) > 10:
                return len(words)
        except Exception as exc:
            logger.debug(f"readability extraction failed: {exc}")

    try:
        soup = BeautifulSoup(html_content, "html.parser")
        import re as _re
        main_content = (
            soup.find("article", class_=_re.compile(r"\b(entry-content|post-content|article-content)\b"))
            or soup.find("div", class_=_re.compile(r"\b(entry-content|post-content|article-content)\b"))
            or soup.find("main")
            or soup.body
            or soup
        )
        for tag in main_content(["script", "style", "nav", "header", "footer", "aside"]):
            tag.decompose()
        return len([w for w in main_content.get_text(separator=" ").split() if w.strip()])
    except Exception as exc:
        logger.debug(f"BeautifulSoup word count failed: {exc}")
        return 0


def _count_words(text: str) -> int:
    """Count words in plain text with a stable regex-based tokenizer."""
    if not text:
        return 0
    return len(re.findall(r"\b[\w'-]+\b", text))


def _tokenise_text(text: str) -> list[str]:
    """Tokenize free text into lowercase alphanumeric tokens."""
    return [token for token in re.findall(r"[a-z0-9]+", str(text or "").lower()) if len(token) > 2]


def _is_excluded_serp_result(
    url: str,
    title: str,
    cfg: SerpFilterConfig = _DEFAULT_SERP_FILTER,
) -> bool:
    """
    Return True when a SERP URL should be hard-excluded from word-count sampling.
    Uses cfg instead of module-level constants.
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return True

    host = (parsed.netloc or "").lower().replace("www.", "")
    path = (parsed.path or "").lower()
    title_l = str(title or "").strip().lower()

    # Homepages are tool/brand landing pages — never useful article benchmarks
    if not path or path == "/":
        return True

    if cfg.host_exclude_suffixes and any(host.endswith(s) for s in cfg.host_exclude_suffixes):
        return True
    if cfg.path_exclude_hints and any(hint in path for hint in cfg.path_exclude_hints):
        return True
    if parsed.query:
        return True
    if cfg.title_exclude_hints and any(title_l.startswith(hint) for hint in cfg.title_exclude_hints):
        return True

    return False


def _is_intent_aligned_serp_item(
    keyword: str,
    item: Dict[str, Any],
    cfg: SerpFilterConfig = _DEFAULT_SERP_FILTER,
) -> bool:
    """
    Return True when a SERP item is intent-aligned with the keyword.
    Token overlap threshold and intent term set come from cfg.
    """
    url = str(item.get("url") or "").strip()
    title = str(item.get("title") or "").strip()
    if not url or _is_excluded_serp_result(url, title, cfg):
        return False

    keyword_tokens = set(_tokenise_text(keyword))
    if not keyword_tokens:
        return True

    path = (urlparse(url).path or "").replace("-", " ")
    haystack_tokens = set(_tokenise_text(f"{title} {path}"))
    token_overlap = len(keyword_tokens & haystack_tokens)

    required_overlap = min(cfg.min_token_overlap, len(keyword_tokens))
    if token_overlap < required_overlap:
        return False

    if cfg.intent_terms and (keyword_tokens & cfg.intent_terms) and not (haystack_tokens & cfg.intent_terms):
        return False

    return True


def _select_serp_candidate_urls(
    keyword: str,
    items: list[Dict[str, Any]],
    limit: int = 10,
    cfg: SerpFilterConfig = _DEFAULT_SERP_FILTER,
) -> list[str]:
    """
    Select up to `limit` organic URLs for word-count sampling.
    Intent-aligned URLs go first; fallback URLs fill the remainder.
    """
    aligned: list[str] = []
    fallback: list[str] = []
    seen: set[str] = set()

    # "featured_snippet" items in DataForSEO are real content pages — include
    # them as fallback candidates alongside organic results.
    _accepted_types = {"organic", "featured_snippet"}

    for item in items:
        item_type = item.get("type")
        if item_type not in _accepted_types:
            continue

        url = str(item.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)

        title = str(item.get("title") or "").strip()
        if _is_excluded_serp_result(url, title, cfg):
            logger.debug(
                f"[CM][SERP] hard-excluded | type={item_type!r} url={url!r} title={title!r}"
            )
            continue

        if _is_intent_aligned_serp_item(keyword, item, cfg):
            logger.debug(f"[CM][SERP] aligned    | type={item_type!r} url={url!r}")
            aligned.append(url)
        else:
            logger.debug(f"[CM][SERP] fallback   | type={item_type!r} url={url!r}")
            fallback.append(url)

    selected = (aligned + fallback)[:limit]
    logger.info(
        f"[CM][SERP] URL selection | aligned={len(aligned)} fallback={len(fallback)} "
        f"selected={len(selected)} limit={limit}"
    )
    return selected


# Minimum word count for a SERP page to be included in the benchmark.
# Pages below this are tool homepages / thin landing pages — they skew the
# median down and don't represent real article content.
_SERP_MIN_WORD_COUNT = 300


def _compute_serp_intent_benchmark(word_counts: list[int]) -> Optional[int]:
    """
    Compute the SERP intent word-count benchmark as the median of substantive pages.

    Only pages with >= _SERP_MIN_WORD_COUNT words are included so that thin
    tool homepages / landing pages don't drag the median down.
    Median is resistant to high-end outliers (e.g. a 10,000-word Wikipedia page).
    """
    substantive = [int(v) for v in word_counts if int(v) >= _SERP_MIN_WORD_COUNT]
    dropped = len(word_counts) - len(substantive)
    if dropped:
        logger.info(
            f"[CM][SERP] benchmark | dropped {dropped} thin page(s) "
            f"(< {_SERP_MIN_WORD_COUNT} words) from {len(word_counts)} total"
        )
    if not substantive:
        return None
    return int(statistics.median(substantive))


def _extract_word_count_from_markdown(markdown: str) -> Optional[int]:
    """Count words from markdown/plain text when DataForSEO provides it."""
    if not markdown:
        return None
    normalized = re.sub(r"\s+", " ", str(markdown)).strip()
    count = _count_words(normalized)
    return count if count > 0 else None


def _extract_word_count_from_structured_page_content(page_content: Any) -> Optional[int]:
    """
    Count words from DataForSEO's structured page_content response.

    FIX (Bug 3): Removed the narrow allowed_string_keys whitelist.
    Any string value whose key is NOT in skipped_keys is counted, capturing
    all content keys DataForSEO uses (text, content, paragraph, li, td,
    caption, h_title, title, etc.) without a brittle opt-in list.
    """
    if not page_content:
        return None

    skipped_keys = {
        "url", "urls", "image_url", "cache_url", "related_search_url",
        "xpath", "fetch_time", "language", "author", "type",
    }

    unique_strings: list[str] = []
    seen_strings: set[str] = set()

    def visit(value: Any, key: Optional[str] = None) -> None:
        if isinstance(value, dict):
            for child_key, child_value in value.items():
                if child_key in skipped_keys:
                    continue
                visit(child_value, child_key)
            return
        if isinstance(value, list):
            for child in value:
                visit(child, key)
            return
        if not isinstance(value, str) or key is None or key in skipped_keys:
            return
        normalized = re.sub(r"\s+", " ", value).strip()
        if len(normalized) < 2:
            return
        dedupe_key = normalized.lower()
        if dedupe_key in seen_strings:
            return
        seen_strings.add(dedupe_key)
        unique_strings.append(normalized)

    visit(page_content)
    count = sum(_count_words(text) for text in unique_strings)
    return count if count > 0 else None


def _extract_word_count_from_onpage_item(item: Dict[str, Any]) -> Optional[int]:
    """
    Extract main-content word count from a DataForSEO on-page item.

    Priority order (most accurate first):
      1. page_as_markdown — trafilatura-extracted body text only (no nav/footer/sidebar).
         This is the most accurate proxy for article word count.
      2. word_count / plain_text_word_count — full-page visible text, includes
         boilerplate. Used only when markdown is unavailable.
      3. page_content structured blocks — deepest fallback.
    """
    # Path 1 — markdown: main-content only, no chrome/boilerplate
    markdown_count = _extract_word_count_from_markdown(str(item.get("page_as_markdown") or ""))
    if markdown_count is not None:
        return markdown_count

    # Path 2a — direct word_count field (full page, used as fallback)
    raw_wc = item.get("word_count")
    if raw_wc is not None:
        direct_count = _coerce_non_negative_int(raw_wc)
        if direct_count is not None:
            return direct_count

    # Path 2b — legacy meta.content.plain_text_word_count
    raw_meta_wc = ((item.get("meta") or {}).get("content") or {}).get("plain_text_word_count")
    if raw_meta_wc is not None:
        direct_count = _coerce_non_negative_int(raw_meta_wc)
        if direct_count is not None:
            return direct_count

    # Path 3 — structured page_content blocks
    return _extract_word_count_from_structured_page_content(item.get("page_content"))


def _extract_dates_jsonld(html_content: str, page_url: str) -> tuple:
    """
    Extract (published_date, modified_date) exclusively from JSON-LD structured data.
    Returns ("-", "-") when absent or unparseable.
    """
    import json as _json

    published_date: Optional[str] = None
    modified_date: Optional[str] = None

    if html_content:
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            for script in soup.find_all("script", type="application/ld+json"):
                if published_date and modified_date:
                    break
                try:
                    ld = _json.loads(script.string or "")
                    ld_items = (
                        ld.get("@graph", [ld]) if isinstance(ld, dict)
                        else (ld if isinstance(ld, list) else [ld])
                    )
                    for ld_item in ld_items:
                        if not isinstance(ld_item, dict):
                            continue
                        if not published_date and ld_item.get("datePublished"):
                            published_date = _normalise_iso_date(ld_item["datePublished"])
                        if not modified_date and ld_item.get("dateModified"):
                            modified_date = _normalise_iso_date(ld_item["dateModified"])
                except Exception:
                    pass
        except Exception as exc:
            logger.debug(f"[CM][dates] JSON-LD parse failed for {page_url}: {exc}")

    result_pub = published_date or "-"
    result_mod = modified_date or "-"
    logger.info(f"[CM][dates] {page_url} | published={result_pub!r} | modified={result_mod!r} (JSON-LD only)")
    return result_pub, result_mod


async def _fetch_serp_intent_word_count(
    keyword: str,
    cfg: SerpFilterConfig = _DEFAULT_SERP_FILTER,
) -> Optional[int]:
    """
    Compute a robust SERP intent word-count benchmark for *keyword*.

    FIX (Bug 2): Uses /on_page/instant_pages which populates
    meta.content.plain_text_word_count reliably, unlike
    /on_page/content_parsing/live which did not.
    FIX (Bug 4): SerpFilterConfig threaded through — no hardcoded constants.
    """
    if not execute_task:
        logger.warning("[CM][SERP] execute_task not available — serpIntentWordCount=null.")
        return None
    if not keyword:
        logger.info("[CM][SERP] No keyword — serpIntentWordCount=null.")
        return None
    logger.info(f"[CM][SERP] Fetching SERP word counts | keyword={keyword!r}")

    async def _run_serp():
        serp_resp = await execute_task(
            task_name="serp_organic",
            input_data={
                "endpoint": "/serp/google/organic/live/advanced",
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
            return None
        tasks_data = (serp_resp.data or {}).get("tasks", [])
        if not tasks_data:
            return None
        result_list = tasks_data[0].get("result") or []
        result0 = (result_list[0] if result_list else None) or {}
        items = result0.get("items", []) or []
        type_counts: Dict[str, int] = {}
        for _item in items:
            _t = str(_item.get("type") or "unknown")
            type_counts[_t] = type_counts.get(_t, 0) + 1
        logger.info(
            f"[CM][SERP] Raw items | keyword={keyword!r} total={len(items)} "
            f"type_breakdown={type_counts}"
        )
        organic_urls = _select_serp_candidate_urls(keyword, items, limit=10, cfg=cfg)
        if not organic_urls:
            logger.warning(f"[CM][SERP] No candidate URLs after filtering | keyword={keyword!r}")
            return None

        sem = asyncio.Semaphore(4)

        async def _fetch_onpage_word_count(target_url: str) -> Optional[int]:
            async with sem:
                try:
                    onpage_resp = await execute_task(
                        task_name="onpage_instant_pages",
                        input_data={
                            "endpoint": "/on_page/instant_pages",
                            "payload": [{
                                "url": target_url,
                                "load_resources": False,
                                "enable_javascript": False,
                                "return_page_as_markdown": True,
                            }],
                        },
                        provider="dataforseo",
                    )
                    if not onpage_resp:
                        logger.warning(f"[CM][SERP] onpage_resp is None | url={target_url!r}")
                        return None
                    if not onpage_resp.success:
                        logger.warning(
                            f"[CM][SERP] onpage_resp.success=False | url={target_url!r} "
                            f"data_keys={list((onpage_resp.data or {}).keys())}"
                        )
                        return None
                    tasks_list = (onpage_resp.data or {}).get("tasks") or []
                    task0 = (tasks_list[0] if tasks_list else None) or {}
                    result_list = task0.get("result") or []
                    result0 = (result_list[0] if result_list else None) or {}
                    result_items = result0.get("items") or []
                    logger.debug(
                        f"[CM][SERP] onpage | url={target_url!r} "
                        f"task0_keys={list(task0.keys())} "
                        f"result_len={len(result_list)} items_len={len(result_items)}"
                    )
                    if not result_items:
                        logger.warning(f"[CM][SERP] no items in onpage result | url={target_url!r}")
                        return None
                    wc = _extract_word_count_from_onpage_item(result_items[0])
                    logger.info(f"[CM][SERP] {target_url} → word_count={wc}")
                    return wc
                except Exception as exc:
                    logger.warning(f"[CM][SERP] On-page parse failed for {target_url}: {exc}", exc_info=True)
                    return None

        candidate_counts = await asyncio.gather(*[_fetch_onpage_word_count(u) for u in organic_urls])
        word_counts: list[int] = [int(wc) for wc in candidate_counts if wc and int(wc) > 0]

        logger.info(f"[CM][SERP] keyword={keyword!r} | raw word counts: {word_counts}")
        benchmark = _compute_serp_intent_benchmark(word_counts)
        logger.info(f"[CM][SERP] keyword={keyword!r} | serpIntentWordCount={benchmark}")
        return benchmark

    def _run_in_new_loop():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(_run_serp())
        finally:
            loop.close()

    try:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(_run_in_new_loop).result(timeout=120)
    except Exception as exc:
        logger.error(f"[CM][SERP] FAILED | keyword={keyword!r}: {exc}", exc_info=True)
        return None


def _derive_keyword(main_keyword: str, h1: str, title: str) -> str:
    """Resolve the SERP keyword for a page."""
    if main_keyword:
        return main_keyword.strip()
    if title:
        parts = re.split(r'\s*[|\u2013\u2014]\s*', title.strip())
        cleaned = parts[0].strip() if len(parts) > 1 else title.strip()
        if cleaned:
            return cleaned
    if h1:
        return h1.strip()
    return ""


# ── Public API ─────────────────────────────────────────────────────────────────

async def extract_content_metrics(
    url: str = '',
    html_content: str = '',
    main_keyword: str = '',
    response_headers: Dict[str, str] = None,
    existing_item: Dict[str, Any] = None,
    h1: str = '',
    title: str = '',
    serp_filter_config: Optional[SerpFilterConfig] = None,
    **kwargs,
) -> Dict[str, Any]:
    """
    Extract content metrics: word counts and published/upgrade dates.

    Returns a dict with 5 fields:
      currentWordCount, serpIntentWordCount, needToAddWordCount,
      publishedDate, upgradeDate.

    Args:
        serp_filter_config:
            Optional SerpFilterConfig to override default SERP URL filtering.
            Use this to loosen or tighten host/path/title exclusions and
            intent-term matching without touching the source code.

            Example — disable title filtering entirely and lower token overlap:
                cfg = SerpFilterConfig(title_exclude_hints=(), min_token_overlap=1)
                await extract_content_metrics(..., serp_filter_config=cfg)
    """
    response_headers = response_headers or {}
    cfg = serp_filter_config or _DEFAULT_SERP_FILTER

    if not (html_content or kwargs.get("word_count") is not None or url):
        return {}

    existing = existing_item or {}

    try:
        # ── Current word count ──────────────────────────────────────────────
        crawl_word_count = _coerce_non_negative_int(kwargs.get("word_count"))
        existing_wc = _coerce_non_negative_int(existing.get("currentWordCount"))
        current_word_count = crawl_word_count if crawl_word_count is not None else existing_wc
        logger.info(
            f"[CM][wc] {url} | currentWordCount={current_word_count!r} "
            f"(source={'CRAWL' if crawl_word_count is not None else 'EXISTING'})"
        )

        # ── SERP intent word count ─────────────────────────────────────────
        serp_keyword = _keyword_from_keyword_bundle(kwargs.get("keyword_bundle"))
        if not serp_keyword:
            serp_keyword = _derive_keyword(main_keyword, h1, title)
        serp_intent_word_count = None
        if serp_keyword:
            serp_intent_word_count = await _fetch_serp_intent_word_count(serp_keyword, cfg=cfg)

        # ── Word-count gap ─────────────────────────────────────────────────
        need_to_add_word_count = None
        if serp_intent_word_count is not None:
            need_to_add_word_count = max(0, serp_intent_word_count - int(current_word_count or 0))

        # ── Published & Upgrade dates ──────────────────────────────────────
        published_date, upgrade_date = _extract_dates_jsonld(html_content, url)

        return {
            'currentWordCount': current_word_count,
            'serpIntentWordCount': serp_intent_word_count,
            'needToAddWordCount': need_to_add_word_count,
            'publishedDate': published_date,
            'upgradeDate': upgrade_date,
        }

    except Exception as exc:
        logger.error("Error extracting content metrics for %s: %s", url, exc, exc_info=True)
        return {}
"""
Content Metrics Sub-module

Extracts word counts (current, SERP intent, gap) and published/upgrade dates.
"""
import asyncio
import logging
import re
import statistics
from typing import Any, Dict, Optional
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


_SERP_HOST_EXCLUDE_SUFFIXES = (
    "reddit.com",
    "quora.com",
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "x.com",
    "twitter.com",
    "linkedin.com",
    "pinterest.com",
    "yelp.com",
)
_SERP_PATH_EXCLUDE_HINTS = (
    "/search",
    "/directory/",
    "/list/",
    "/watch",
)
_SERP_TITLE_EXCLUDE_HINTS = (
    "top ",
    "best ",
    "reviews",
    "vs ",
)
_SERP_INTENT_TERMS = {
    "agency",
    "agencies",
    "company",
    "companies",
    "service",
    "services",
    "consulting",
    "consultancy",
}


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


def _is_excluded_serp_result(url: str, title: str) -> bool:
    """Filter out non-content SERP results (UGC/social directories/listings)."""
    try:
        parsed = urlparse(url)
    except Exception:
        return True

    host = (parsed.netloc or "").lower().replace("www.", "")
    path = (parsed.path or "").lower()
    title_l = str(title or "").strip().lower()

    if any(host.endswith(suffix) for suffix in _SERP_HOST_EXCLUDE_SUFFIXES):
        return True
    if any(hint in path for hint in _SERP_PATH_EXCLUDE_HINTS):
        return True
    if parsed.query:
        return True
    if any(title_l.startswith(hint) for hint in _SERP_TITLE_EXCLUDE_HINTS):
        return True

    return False


def _is_intent_aligned_serp_item(keyword: str, item: Dict[str, Any]) -> bool:
    """
    Ensure selected SERP pages match the keyword intent before benchmarking.

    This avoids skew from forum/listing pages and improves comparability for
    service-style commercial keywords.
    """
    url = str(item.get("url") or "").strip()
    title = str(item.get("title") or "").strip()
    if not url or _is_excluded_serp_result(url, title):
        return False

    keyword_tokens = set(_tokenise_text(keyword))
    if not keyword_tokens:
        return True

    path = (urlparse(url).path or "").replace("-", " ")
    haystack_tokens = set(_tokenise_text(f"{title} {path}"))
    token_overlap = len(keyword_tokens & haystack_tokens)
    if token_overlap < min(2, len(keyword_tokens)):
        return False

    if keyword_tokens & _SERP_INTENT_TERMS and not (haystack_tokens & _SERP_INTENT_TERMS):
        return False

    return True


def _select_serp_candidate_urls(keyword: str, items: list[Dict[str, Any]], limit: int = 10) -> list[str]:
    """Select up to `limit` organic URLs, prioritizing intent-aligned content pages."""
    aligned: list[str] = []
    fallback: list[str] = []
    seen: set[str] = set()

    for item in items:
        if item.get("type") != "organic":
            continue

        url = str(item.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)

        title = str(item.get("title") or "").strip()
        if _is_excluded_serp_result(url, title):
            continue

        if _is_intent_aligned_serp_item(keyword, item):
            aligned.append(url)
        else:
            fallback.append(url)

    selected = (aligned + fallback)[:limit]
    return selected


def _remove_outliers_iqr(values: list[int]) -> list[int]:
    """Remove extreme outliers using IQR, preserving original values on edge cases."""
    cleaned = [int(v) for v in values if int(v) > 0]
    if len(cleaned) < 4:
        return cleaned

    ordered = sorted(cleaned)
    try:
        quartiles = statistics.quantiles(ordered, n=4, method="inclusive")
    except Exception:
        return ordered

    q1, q3 = quartiles[0], quartiles[2]
    iqr = q3 - q1
    if iqr <= 0:
        return ordered

    lower_bound = q1 - (1.5 * iqr)
    upper_bound = q3 + (1.5 * iqr)
    filtered = [value for value in ordered if lower_bound <= value <= upper_bound]
    return filtered or ordered


def _compute_serp_intent_benchmark(word_counts: list[int]) -> Optional[int]:
    """
    Compute a robust SERP benchmark from cleaned word counts.

    Method:
      1. Remove extreme outliers (IQR).
      2. Build a substantive cohort (counts >= dynamic median floor).
      3. Use top substantive cluster average (rounded to nearest 100) when available.
      4. Fallback to median for sparse cohorts.
    """
    filtered = _remove_outliers_iqr(word_counts)
    if not filtered:
        return None

    median_floor = max(1200, int(statistics.median(filtered)))
    substantive = [value for value in filtered if value >= median_floor]
    if len(substantive) >= 3:
        top_cluster = sorted(substantive, reverse=True)[:3]
        return int(round((sum(top_cluster) / len(top_cluster)) / 100.0) * 100)
    if len(substantive) >= 2:
        return int(round((sum(substantive) / len(substantive)) / 100.0) * 100)
    if len(filtered) >= 3:
        return int(statistics.median(filtered))

    return int(round(sum(filtered) / len(filtered)))


def _extract_word_count_from_markdown(markdown: str) -> Optional[int]:
    """Count words from markdown/plain text when DataForSEO provides it."""
    if not markdown:
        return None
    normalized = re.sub(r"\s+", " ", str(markdown)).strip()
    count = _count_words(normalized)
    return count if count > 0 else None


def _extract_word_count_from_structured_page_content(page_content: Any) -> Optional[int]:
    """
    Count words from DataForSEO's current structured `page_content` response.

    Newer `on_page/content_parsing` responses do not expose
    `meta.content.plain_text_word_count`; instead they return nested text blocks.
    """
    if not page_content:
        return None

    allowed_string_keys = {"text", "h_title", "main_title", "title", "subtitle", "description"}
    skipped_keys = {
        "url",
        "urls",
        "image_url",
        "cache_url",
        "related_search_url",
        "xpath",
        "fetch_time",
        "language",
        "author",
        "type",
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

        if not isinstance(value, str) or key not in allowed_string_keys:
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
    """Support both legacy and current DataForSEO on-page parsing payloads."""
    direct_count = _coerce_non_negative_int(
        item.get("word_count")
        or (((item.get("meta") or {}).get("content") or {}).get("plain_text_word_count"))
    )
    if direct_count is not None:
        return direct_count

    markdown_count = _extract_word_count_from_markdown(str(item.get("page_as_markdown") or ""))
    if markdown_count is not None:
        return markdown_count

    return _extract_word_count_from_structured_page_content(item.get("page_content"))


def _extract_dates(
    html_content: str,
    response_headers: Optional[Dict[str, str]],
    page_url: str,
) -> tuple:
    """Extract (published_date, modified_date) from HTML and response headers."""
    import json as _json

    published_date: Optional[str] = None
    modified_date: Optional[str] = None
    pub_source: Optional[str] = None
    mod_source: Optional[str] = None

    if html_content:
        soup = BeautifulSoup(html_content, "html.parser")

        for script in soup.find_all("script", type="application/ld+json"):
            if published_date and modified_date:
                break
            try:
                ld = _json.loads(script.string or "")
                items = ld.get("@graph", [ld]) if isinstance(ld, dict) else (ld if isinstance(ld, list) else [ld])
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    if not published_date and item.get("datePublished"):
                        published_date = _normalise_iso_date(item["datePublished"])
                        pub_source = "JSON-LD"
                    if not modified_date and item.get("dateModified"):
                        modified_date = _normalise_iso_date(item["dateModified"])
                        mod_source = "JSON-LD"
            except Exception:
                pass

        if not published_date:
            tag = soup.find("meta", property="article:published_time")
            if tag and tag.get("content"):
                published_date = _normalise_iso_date(tag["content"])
                pub_source = "meta[article:published_time]"

        if not modified_date:
            tag = soup.find("meta", property="article:modified_time")
            if tag and tag.get("content"):
                modified_date = _normalise_iso_date(tag["content"])
                mod_source = "meta[article:modified_time]"

        _PUB_META_NAMES = [
            "date", "pubdate", "publish_date", "published_date",
            "article.published", "DC.date.issued", "DC.date.created",
            "og:published_time",
        ]
        _MOD_META_NAMES = [
            "last-modified", "revised", "article.modified", "DC.date.modified",
        ]
        if not published_date:
            for name in _PUB_META_NAMES:
                tag = soup.find("meta", attrs={"name": name})
                if tag and tag.get("content"):
                    published_date = _normalise_iso_date(tag["content"])
                    pub_source = f"meta[name={name}]"
                    break
        if not modified_date:
            for name in _MOD_META_NAMES:
                tag = soup.find("meta", attrs={"name": name})
                if tag and tag.get("content"):
                    modified_date = _normalise_iso_date(tag["content"])
                    mod_source = f"meta[name={name}]"
                    break

        if not published_date:
            tag = soup.find("time", itemprop="datePublished") or soup.find(
                "time", class_=re.compile(r"\b(published|entry-date|post-date)\b")
            )
            if tag and tag.get("datetime"):
                published_date = _normalise_iso_date(tag["datetime"])
                pub_source = "time[datePublished]"

        if not modified_date:
            tag = soup.find("time", itemprop="dateModified") or soup.find(
                "time", class_=re.compile(r"\b(updated|modified|edit-date)\b")
            )
            if tag and tag.get("datetime"):
                modified_date = _normalise_iso_date(tag["datetime"])
                mod_source = "time[dateModified]"

        if not published_date:
            container = soup.find("article") or soup.find("main")
            if container:
                tag = container.find("time", attrs={"datetime": True})
                if tag:
                    published_date = _normalise_iso_date(tag["datetime"])
                    pub_source = "time[datetime] in article/main"

    if not modified_date and response_headers:
        last_modified = response_headers.get("Last-Modified", "")
        if last_modified:
            modified_date = _normalise_iso_date(last_modified)
            mod_source = "Last-Modified header"

    logger.info(
        f"[CM][dates] {page_url} | "
        f"published={published_date!r} (via {pub_source or 'none'}) | "
        f"modified={modified_date!r} (via {mod_source or 'none'})"
    )
    return published_date, modified_date


async def _try_wordpress_dates(page_url: str) -> tuple:
    """WordPress REST API fallback for dates."""
    try:
        import aiohttp
        parsed = urlparse(page_url)
        slug = parsed.path.strip("/").split("/")[-1] or "home"
        base = f"{parsed.scheme}://{parsed.netloc}"
        endpoints = [
            f"{base}/wp-json/wp/v2/posts?slug={slug}&_fields=date_gmt,modified_gmt",
            f"{base}/wp-json/wp/v2/pages?slug={slug}&_fields=date_gmt,modified_gmt",
        ]
        async with aiohttp.ClientSession() as session:
            for api_url in endpoints:
                try:
                    async with session.get(api_url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                        if resp.status == 200:
                            data = await resp.json(content_type=None)
                            if data and isinstance(data, list) and data:
                                post = data[0]
                                pub = _normalise_iso_date(post.get("date_gmt"))
                                mod = _normalise_iso_date(post.get("modified_gmt"))
                                return pub, mod
                        elif resp.status not in (404, 401):
                            logger.info(f"[CM][WP-API] {api_url} returned HTTP {resp.status}")
                except Exception as ep:
                    logger.debug(f"[CM][WP-API] request failed for {api_url}: {ep}")
    except Exception as exc:
        logger.warning(f"[CM][WP-API] unexpected error for {page_url}: {exc}")
    return None, None


async def _fetch_serp_intent_word_count(keyword: str) -> Optional[int]:
    """Compute a robust SERP intent word-count benchmark for *keyword*."""
    if not execute_task:
        logger.warning("[CM][SERP] execute_task not available — serpIntentWordCount=null.")
        return None
    if not keyword:
        logger.info("[CM][SERP] No keyword — serpIntentWordCount=null.")
        return None
    logger.info(f"[CM][SERP] Fetching SERP top-10 word counts for keyword={keyword!r}")

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
        items = tasks_data[0].get("result", [{}])[0].get("items", [])
        organic_urls = _select_serp_candidate_urls(keyword, items, limit=10)
        if not organic_urls:
            return None

        sem = asyncio.Semaphore(4)

        async def _fetch_onpage_word_count(target_url: str) -> Optional[int]:
            async with sem:
                try:
                    onpage_resp = await execute_task(
                        task_name="onpage_content_parsing",
                        input_data={
                            "endpoint": "/on_page/content_parsing/live",
                            "payload": [{"url": target_url}],
                        },
                        provider="dataforseo",
                    )
                    if not (onpage_resp and onpage_resp.success):
                        return None

                    result_items = (
                        (onpage_resp.data or {})
                        .get("tasks", [{}])[0]
                        .get("result", [{}])[0]
                        .get("items", [])
                    )
                    if not result_items:
                        return None
                    return _extract_word_count_from_onpage_item(result_items[0])
                except Exception as exc:
                    logger.warning(f"[CM][SERP] On-page parse failed for {target_url}: {exc}")
                    return None

        candidate_counts = await asyncio.gather(*[_fetch_onpage_word_count(url) for url in organic_urls])
        word_counts: list[int] = []
        for wc in candidate_counts:
            if wc and int(wc) > 0:
                word_counts.append(int(wc))

        return _compute_serp_intent_benchmark(word_counts)

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
        logger.error(f"[CM][SERP] FAILED for keyword={keyword!r}: {exc}", exc_info=True)
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
    **kwargs,
) -> Dict[str, Any]:
    """
    Extract content metrics: word counts and published/upgrade dates.

    Returns a dict with 5 fields:
      currentWordCount, serpIntentWordCount, needToAddWordCount,
      publishedDate, upgradeDate.
    Uses crawl-time `word_count` when available and leaves keyword-driven
    SERP fields null when no crawl keyword bundle target exists.
    """
    response_headers = response_headers or {}
    if not (html_content or kwargs.get("word_count") is not None or url):
        return {}

    existing = existing_item or {}

    try:
        # ── Current word count ──────────────────────────────────────────────
        crawl_word_count = _coerce_non_negative_int(kwargs.get("word_count"))
        existing_wc = _coerce_non_negative_int(existing.get("currentWordCount"))
        if crawl_word_count is not None:
            current_word_count = crawl_word_count
        elif existing_wc is not None:
            current_word_count = existing_wc
        else:
            current_word_count = None
            if html_content:
                current_word_count = _extract_word_count_from_html(html_content)

        # ── SERP intent word count ─────────────────────────────────────────
        serp_keyword = _keyword_from_keyword_bundle(kwargs.get("keyword_bundle"))
        serp_intent_word_count = None
        if serp_keyword:
            serp_intent_word_count = await _fetch_serp_intent_word_count(serp_keyword)

        # ── Word-count gap ─────────────────────────────────────────────────
        need_to_add_word_count = None
        if serp_intent_word_count is not None:
            need_to_add_word_count = max(0, serp_intent_word_count - int(current_word_count or 0))

        # ── Published & Upgrade dates ──────────────────────────────────────
        existing_pub = existing.get("publishedDate")
        existing_mod = existing.get("upgradeDate")

        if existing_pub and existing_mod:
            published_date = existing_pub
            upgrade_date = existing_mod
        else:
            extracted_pub, extracted_mod = (None, None)
            if html_content or response_headers:
                extracted_pub, extracted_mod = _extract_dates(html_content, response_headers, url)
            published_date = existing_pub or extracted_pub
            upgrade_date = existing_mod or extracted_mod

            if url and (not published_date or not upgrade_date):
                wp_pub, wp_mod = await _try_wordpress_dates(url)
                if not published_date and wp_pub:
                    published_date = wp_pub
                if not upgrade_date and wp_mod:
                    upgrade_date = wp_mod

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

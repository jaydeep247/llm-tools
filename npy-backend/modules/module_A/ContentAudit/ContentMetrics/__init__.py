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


# ── Word-count & date helpers ──────────────────────────────────────────────────

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


async def _fetch_serp_intent_word_count(keyword: str) -> int:
    """Compute the median word count of top-10 organic SERP results for *keyword*."""
    if not execute_task:
        logger.warning("[CM][SERP] execute_task not available — serpIntentWordCount=0.")
        return 0
    if not keyword:
        logger.info("[CM][SERP] No keyword — serpIntentWordCount=0.")
        return 0
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
            return 0
        tasks_data = (serp_resp.data or {}).get("tasks", [])
        if not tasks_data:
            return 0
        items = tasks_data[0].get("result", [{}])[0].get("items", [])
        organic_urls = [
            item["url"] for item in items
            if item.get("type") == "organic" and item.get("url")
        ][:10]
        if not organic_urls:
            return 0

        word_counts: list[int] = []
        for target_url in organic_urls:
            try:
                onpage_resp = await execute_task(
                    task_name="onpage_content_parsing",
                    input_data={
                        "endpoint": "/on_page/content_parsing/live",
                        "payload": [{"url": target_url}],
                    },
                    provider="dataforseo",
                )
                if onpage_resp and onpage_resp.success:
                    result_items = (
                        (onpage_resp.data or {})
                        .get("tasks", [{}])[0]
                        .get("result", [{}])[0]
                        .get("items", [])
                    )
                    if result_items:
                        wc = result_items[0].get("meta", {}).get("content", {}).get("plain_text_word_count", 0)
                        if wc and int(wc) > 0:
                            word_counts.append(int(wc))
            except Exception as exc:
                logger.warning(f"[CM][SERP] On-page parse failed for {target_url}: {exc}")

        return int(statistics.median(word_counts)) if word_counts else 0

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
        return 0


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
    Returns {} on empty HTML.
    """
    if not html_content:
        return {}

    existing = existing_item or {}

    try:
        # ── Current word count ──────────────────────────────────────────────
        existing_wc = existing.get("currentWordCount") or 0
        if existing_wc > 0:
            current_word_count = int(existing_wc)
        else:
            current_word_count = int(kwargs.get("word_count") or 0)
            if not current_word_count:
                current_word_count = _extract_word_count_from_html(html_content)

        # ── SERP intent word count ─────────────────────────────────────────
        # TODO: Re-enable when DataForSEO SERP calls are needed
        serp_intent_word_count = 0

        # ── Word-count gap ─────────────────────────────────────────────────
        need_to_add_word_count = max(0, serp_intent_word_count - current_word_count)

        # ── Published & Upgrade dates ──────────────────────────────────────
        existing_pub = existing.get("publishedDate")
        existing_mod = existing.get("upgradeDate")

        if existing_pub and existing_mod:
            published_date = existing_pub
            upgrade_date = existing_mod
        else:
            extracted_pub, extracted_mod = _extract_dates(html_content, response_headers, url)
            published_date = existing_pub or extracted_pub
            upgrade_date = existing_mod or extracted_mod

            if not published_date or not upgrade_date:
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

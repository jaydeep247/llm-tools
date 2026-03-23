"""
Performance Metrics Sub-module

Extracts GA traffic, word counts, SERP intent word counts, and published/modified dates.

Field sources:
  ga30DaysTraffic      - GA4 BetaAnalyticsDataClient.run_report() (sessions, last 30d, per pagePath)
  currentWordCount     - trafilatura -> readability-lxml -> BeautifulSoup CSS fallback
  serpIntentWordCount  - DataForSEO SERP top-10 organic -> On-Page word count -> median
  needToAddWordCount   - max(0, serp - current), always recomputed
  publishedDate        - meta[article:published_time] -> time[datePublished] -> WordPress REST API
  upgradeDate          - meta[article:modified_time] -> Last-Modified header -> WordPress REST API
"""
import asyncio
import logging
import os
import re
import statistics
from datetime import date, timedelta
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
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        DateRange,
        Dimension,
        Filter,
        FilterExpression,
        Metric,
        RunReportRequest,
    )
    from google.oauth2 import service_account as ga_service_account
    _GA_AVAILABLE = True
except ImportError:
    _GA_AVAILABLE = False

try:
    from orchestrator.checkpoint.executor import execute_task
except ImportError:
    execute_task = None

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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

    # Source 1: trafilatura (best boilerplate removal)
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

    # Source 2: readability-lxml
    if _READABILITY_AVAILABLE:
        try:
            doc = ReadabilityDocument(html_content)
            soup = BeautifulSoup(doc.summary(), "html.parser")
            words = [w for w in soup.get_text(separator=" ").split() if w.strip()]
            if len(words) > 10:
                return len(words)
        except Exception as exc:
            logger.debug(f"readability extraction failed: {exc}")

    # Source 3: BeautifulSoup CSS heuristic
    try:
        soup = BeautifulSoup(html_content, "html.parser")
        main_content = (
            soup.find("article", class_=re.compile(r"\b(entry-content|post-content|article-content)\b"))
            or soup.find("div", class_=re.compile(r"\b(entry-content|post-content|article-content)\b"))
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
    """
    Extract (published_date, modified_date) from HTML and response headers.
    Returns dates normalised to YYYY-MM-DD.

    Sources tried in order:
      1. JSON-LD datePublished / dateModified
      2. meta[property="article:published_time|modified_time"]
      3. meta[name="date|pubdate|publish_date|DC.date.*|..."]
      4. time[itemprop=datePublished|dateModified] or time.published / .updated
      5. Any time[datetime] tag inside article/main as last resort
      6. Last-Modified response header (modified only)
    """
    import json as _json

    published_date: Optional[str] = None
    modified_date: Optional[str] = None
    pub_source: Optional[str] = None
    mod_source: Optional[str] = None

    if html_content:
        soup = BeautifulSoup(html_content, "html.parser")

        # ── Source 1: JSON-LD ────────────────────────────────────────────────
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

        # ── Source 2: meta[property=article:...] ────────────────────────────
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

        # ── Source 3: meta[name=date|pubdate|...] ───────────────────────────
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

        # ── Source 4: time[itemprop] / time.class ───────────────────────────
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

        # ── Source 5: any time[datetime] inside article/main ─────────────────
        if not published_date:
            container = soup.find("article") or soup.find("main")
            if container:
                tag = container.find("time", attrs={"datetime": True})
                if tag:
                    published_date = _normalise_iso_date(tag["datetime"])
                    pub_source = "time[datetime] in article/main"

    # ── Source 6: Last-Modified response header (modified only) ─────────────
    if not modified_date and response_headers:
        last_modified = response_headers.get("Last-Modified", "")
        if last_modified:
            modified_date = _normalise_iso_date(last_modified)
            mod_source = "Last-Modified header"

    logger.info(
        f"[PM][dates] {page_url} | "
        f"published={published_date!r} (via {pub_source or 'none'}) | "
        f"modified={modified_date!r} (via {mod_source or 'none'})"
    )
    return published_date, modified_date


async def _try_wordpress_dates(page_url: str) -> tuple:
    """
    Source 4: WordPress REST API fallback for dates.
    Tries /wp-json/wp/v2/posts first, then /wp-json/wp/v2/pages.
    Returns (None, None) silently on any error or non-WP site.
    """
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
                                logger.info(
                                    f"[PM][WP-API] {page_url} | slug={slug!r} | "
                                    f"endpoint={api_url.split('?')[0].split('/')[-1]} | "
                                    f"published={pub!r} modified={mod!r}"
                                )
                                return pub, mod
                        elif resp.status not in (404, 401):
                            logger.info(f"[PM][WP-API] {api_url} returned HTTP {resp.status}")
                except Exception as ep:
                    logger.debug(f"[PM][WP-API] request failed for {api_url}: {ep}")
        logger.info(f"[PM][WP-API] {page_url} | slug={slug!r} | no data from posts or pages endpoints")
    except Exception as exc:
        logger.warning(f"[PM][WP-API] unexpected error for {page_url}: {exc}")
    return None, None


async def _fetch_ga_traffic(url: str, ga_property_id: str) -> int:
    """
    Fetch 30-day session count from GA4 via BetaAnalyticsDataClient.

    Reads credentials from GA_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.
    Runs the synchronous GA client in a thread executor so the event loop is not blocked.
    Returns 0 when credentials/property ID are absent or on any API error.
    """
    if not _GA_AVAILABLE:
        logger.warning("[PM][GA] google-analytics-data package not installed — ga30DaysTraffic=0. Run: pip install google-analytics-data")
        return 0
    if not ga_property_id:
        logger.info("[PM][GA] ga_property_id not provided — ga30DaysTraffic=0. Pass ga_property_id to the crawler job.")
        return 0

    creds_path = os.environ.get("GA_SERVICE_ACCOUNT_JSON") or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS", ""
    )
    if not creds_path:
        logger.warning(
            "[PM][GA] No GA credentials env var set — ga30DaysTraffic=0. "
            "Set GA_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS to a service account JSON path."
        )
        return 0
    if not os.path.exists(creds_path):
        logger.warning(f"[PM][GA] Credentials file not found at {creds_path!r} — ga30DaysTraffic=0.")
        return 0
    logger.info(f"[PM][GA] Using credentials from {creds_path!r}, property={ga_property_id!r}")

    page_path = urlparse(url).path or "/"

    def _run_report() -> int:
        credentials = ga_service_account.Credentials.from_service_account_file(
            creds_path,
            scopes=["https://www.googleapis.com/auth/analytics.readonly"],
        )
        client = BetaAnalyticsDataClient(credentials=credentials)
        today = date.today()
        request = RunReportRequest(
            property=f"properties/{ga_property_id}",
            dimensions=[Dimension(name="pagePath")],
            metrics=[Metric(name="sessions")],
            date_ranges=[
                DateRange(
                    start_date=(today - timedelta(days=30)).strftime("%Y-%m-%d"),
                    end_date=today.strftime("%Y-%m-%d"),
                )
            ],
            dimension_filter=FilterExpression(
                filter=Filter(
                    field_name="pagePath",
                    string_filter=Filter.StringFilter(
                        value=page_path,
                        match_type=Filter.StringFilter.MatchType.EXACT,
                    ),
                )
            ),
        )
        response = client.run_report(request)
        if response.rows:
            return int(response.rows[0].metric_values[0].value)
        return 0

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _run_report)
        logger.info(f"[PM][GA] {url} | sessions_30d={result}")
        return result
    except Exception as exc:
        logger.error(f"[PM][GA] GA4 traffic fetch FAILED for {url}: {exc}")
        return 0


async def _fetch_serp_intent_word_count(keyword: str) -> int:
    """
    Compute the median word count of top-10 organic SERP results for *keyword*.

    Steps:
      1. DataForSEO SERP organic live  -> collect up to 10 organic result URLs
      2. DataForSEO On-Page content parsing live -> plain_text_word_count per URL
      3. Return median; 0 if no data available

    execute_task provides transparent per-keyword caching via its deterministic task hash,
    so identical keywords will not trigger duplicate API calls.
    """
    if not execute_task:
        logger.warning(
            "[PM][SERP] DataForSEO execute_task not available — serpIntentWordCount=0. "
            "Check orchestrator.checkpoint.executor import path."
        )
        return 0
    if not keyword:
        logger.info(
            "[PM][SERP] No main_keyword provided — serpIntentWordCount=0. "
            "Pass main_keyword when starting the crawl job."
        )
        return 0
    logger.info(f"[PM][SERP] Fetching SERP top-10 word counts for keyword={keyword!r}")

    try:
        # Step 1: SERP organic results
        serp_resp = await execute_task(
            task_name="serp_organic",
            input_data={
                "endpoint": "/v3/serp/google/organic/live/advanced",
                "payload": [{
                    "keyword": keyword,
                    "location_code": 2840,   # United States
                    "language_code": "en",
                    "depth": 10,
                }],
            },
            provider="dataforseo",
        )

        if not (serp_resp and serp_resp.success):
            logger.warning(
                f"SERP API failed for keyword={keyword!r}: "
                f"{getattr(serp_resp, 'error', 'unknown')}"
            )
            return 0

        tasks_data = (serp_resp.data or {}).get("tasks", [])
        if not tasks_data:
            return 0

        items = tasks_data[0].get("result", [{}])[0].get("items", [])
        organic_urls = [
            item["url"]
            for item in items
            if item.get("type") == "organic" and item.get("url")
        ][:10]

        if not organic_urls:
            logger.warning(f"[PM][SERP] No organic URLs found in SERP results for keyword={keyword!r}")
            return 0
        logger.info(f"[PM][SERP] Got {len(organic_urls)} organic URLs for keyword={keyword!r}")

        # Step 2: On-Page word count per result URL
        word_counts: list[int] = []
        for target_url in organic_urls:
            try:
                onpage_resp = await execute_task(
                    task_name="onpage_content_parsing",
                    input_data={
                        "endpoint": "/v3/on_page/content_parsing/live",
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
                        wc = (
                            result_items[0]
                            .get("meta", {})
                            .get("content", {})
                            .get("plain_text_word_count", 0)
                        )
                        if wc and int(wc) > 0:
                            word_counts.append(int(wc))
            except Exception as exc:
                logger.warning(f"[PM][SERP] On-page parse failed for {target_url}: {exc}")

        if word_counts:
            median_wc = int(statistics.median(word_counts))
            logger.info(f"[PM][SERP] keyword={keyword!r} | collected {len(word_counts)} word counts | median={median_wc}")
            return median_wc
        logger.warning(f"[PM][SERP] keyword={keyword!r} | no valid word counts collected from {len(organic_urls)} URLs")
        return 0

    except Exception as exc:
        logger.error(f"[PM][SERP] FAILED for keyword={keyword!r}: {exc}", exc_info=True)
        return 0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def extract_performance_metrics(
    url: str,
    html_content: str = "",
    main_keyword: str = "",
    ga_property_id: str = None,
    response_headers: Dict[str, str] = None,
    existing_item: Dict[str, Any] = None,
    **kwargs,
) -> Dict[str, Any]:
    """
    Async entry point for Performance Metrics extraction.

    For each field the function first checks *existing_item*; if a value is already
    present the API call is skipped.  needToAddWordCount is always recomputed.

    Returns:
        {
            "ga30DaysTraffic":     int,           # GA4 sessions last 30 days
            "currentWordCount":    int,           # main-body word count
            "serpIntentWordCount": int,           # median SERP top-10 word count
            "needToAddWordCount":  int,           # max(0, serp - current)
            "publishedDate":       str | None,    # YYYY-MM-DD
            "upgradeDate":         str | None,    # YYYY-MM-DD (last modified)
        }
    """
    existing = existing_item or {}

    logger.info(f"[PM] START extract_performance_metrics for {url} | keyword={main_keyword!r} | ga_property={ga_property_id!r}")

    # 1. GA 30-day traffic -----------------------------------------------
    if existing.get("ga30DaysTraffic") is not None:
        ga_traffic = int(existing["ga30DaysTraffic"])
        logger.info(f"[PM] ga30DaysTraffic: reusing existing value={ga_traffic}")
    else:
        ga_traffic = await _fetch_ga_traffic(url, ga_property_id or "")

    # 2. Current word count ----------------------------------------------
    existing_wc = existing.get("currentWordCount") or 0
    if existing_wc > 0:
        current_word_count = int(existing_wc)
        logger.info(f"[PM] currentWordCount: reusing existing value={current_word_count}")
    else:
        # Honour a word_count pre-computed by the Scrapy pipeline
        current_word_count = int(kwargs.get("word_count") or 0)
        if current_word_count:
            logger.info(f"[PM] currentWordCount: using pre-computed word_count={current_word_count}")
        else:
            current_word_count = _extract_word_count_from_html(html_content)
            logger.info(f"[PM] currentWordCount: extracted from HTML={current_word_count}")

    # 3. SERP intent word count ------------------------------------------
    if existing.get("serpIntentWordCount") is not None:
        serp_intent_word_count = int(existing["serpIntentWordCount"])
        logger.info(f"[PM] serpIntentWordCount: reusing existing value={serp_intent_word_count}")
    else:
        serp_intent_word_count = await _fetch_serp_intent_word_count(main_keyword)

    # 4. Word-count gap (always recomputed) ------------------------------
    need_to_add_word_count = max(0, serp_intent_word_count - current_word_count)

    # 5 & 6. Published date + modified date ------------------------------
    existing_pub = existing.get("publishedDate")
    existing_mod = existing.get("upgradeDate")

    if existing_pub and existing_mod:
        published_date = existing_pub
        upgrade_date = existing_mod
        logger.info(f"[PM] dates: reusing existing pub={published_date!r} mod={upgrade_date!r}")
    else:
        extracted_pub, extracted_mod = _extract_dates(html_content, response_headers, url)
        published_date = existing_pub or extracted_pub
        upgrade_date = existing_mod or extracted_mod

        # Source WP REST API for whichever date is still missing
        if not published_date or not upgrade_date:
            wp_pub, wp_mod = await _try_wordpress_dates(url)
            if not published_date and wp_pub:
                published_date = wp_pub
                logger.info(f"[PM] publishedDate: resolved via WP REST API = {published_date!r}")
            if not upgrade_date and wp_mod:
                upgrade_date = wp_mod
                logger.info(f"[PM] upgradeDate: resolved via WP REST API = {upgrade_date!r}")

        if not published_date:
            logger.warning(
                f"[PM] publishedDate: COULD NOT resolve for {url}. "
                "Tried JSON-LD, meta[article:published_time], meta[name=date|pubdate|...], "
                "time[datePublished], time[datetime] in article/main, WP REST API posts+pages."
            )

    logger.info(
        f"[PM] DONE {url} | words={current_word_count} serp={serp_intent_word_count}"
        f" gap={need_to_add_word_count} ga={ga_traffic}"
        f" pub={published_date!r} mod={upgrade_date!r}"
    )

    return {
        "ga30DaysTraffic": ga_traffic,
        "currentWordCount": current_word_count,
        "serpIntentWordCount": serp_intent_word_count,
        "needToAddWordCount": need_to_add_word_count,
        "publishedDate": published_date,
        "upgradeDate": upgrade_date,
    }

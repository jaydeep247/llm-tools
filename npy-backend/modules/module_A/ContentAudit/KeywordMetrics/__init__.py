"""
Keyword Metrics Sub-module

Extracts the main keyword for a page using two strategies:

  1. Page title tag (Scrapy — free, no API)
     - Strip common brand-name suffixes separated by | — –
  2. DataForSEO On-Page Content Parsing API
     POST /v3/on_page/content_parsing/live
     Extract: tasks[0].result[0].items[0].meta.htags.h1[0]  (or main topic)

Returns:
  main_keyword : str   – resolved keyword for the page
  keyword_source: str   – "provided" | "title_tag" | "dataforseo_onpage" | "h1" | "none"
  audit_log     : dict  – per-field decision log
"""
import logging
import re
from typing import Any, Dict, Optional

from bs4 import BeautifulSoup

try:
    from orchestrator.checkpoint.executor import execute_task
except ImportError:
    execute_task = None

logger = logging.getLogger(__name__)


# ── Title-tag keyword extraction ───────────────────────────────────────────────

_BRAND_SEPARATORS = re.compile(r'\s*[|\u2013\u2014]\s*')


def _keyword_from_title(title: str) -> str:
    """
    Extract the keyword portion of a <title> tag by stripping the
    trailing brand-name suffix (e.g. "Best Shoes | BrandName" → "Best Shoes").
    """
    if not title:
        return ""
    parts = _BRAND_SEPARATORS.split(title.strip())
    # If there's a separator, take the first segment (the keyword portion)
    cleaned = parts[0].strip() if len(parts) > 1 else title.strip()
    return cleaned


def _extract_title_from_html(html_content: str) -> str:
    """Fallback: pull <title> text from raw HTML via BeautifulSoup."""
    if not html_content:
        return ""
    try:
        soup = BeautifulSoup(html_content, "html.parser")
        tag = soup.find("title")
        return tag.get_text().strip() if tag else ""
    except Exception:
        return ""


def _extract_h1_from_html(html_content: str) -> str:
    """Fallback: pull first <h1> text from raw HTML."""
    if not html_content:
        return ""
    try:
        soup = BeautifulSoup(html_content, "html.parser")
        tag = soup.find("h1")
        return tag.get_text().strip() if tag else ""
    except Exception:
        return ""


# ── DataForSEO On-Page keyword extraction ─────────────────────────────────────

async def _fetch_keyword_from_onpage(url: str) -> Optional[str]:
    """
    Call DataForSEO /v3/on_page/content_parsing/live to extract the
    page's main keyword.

    The API returns structured content including meta info, headings, and
    keyword data.  We look for:
      - items[0].meta.htags.h1[0]          (primary heading as keyword proxy)
      - items[0].meta.title                 (parsed title)
    """
    if not execute_task:
        logger.debug("[KM] execute_task unavailable — skipping on-page API.")
        return None
    if not url:
        return None

    try:
        resp = await execute_task(
            task_name="onpage_content_parsing",
            input_data={
                "endpoint": "/on_page/content_parsing/live",
                "payload": [{"url": url}],
            },
            provider="dataforseo",
        )
        if not (resp and resp.success):
            logger.warning("[KM] On-page content parsing failed for %s: %s",
                           url, resp.error if resp else "no response")
            return None

        tasks_data = (resp.data or {}).get("tasks", [])
        if not tasks_data:
            return None

        result_list = tasks_data[0].get("result", [])
        if not result_list:
            return None

        items = result_list[0].get("items", [])
        if not items:
            return None

        meta = items[0].get("meta", {})

        # Try h1 heading first — best proxy for the page's main topic
        h1_tags = meta.get("htags", {}).get("h1", [])
        if h1_tags and h1_tags[0].strip():
            return h1_tags[0].strip()

        # Fallback to the parsed title (with brand stripping)
        title_text = meta.get("title", "")
        if title_text:
            return _keyword_from_title(title_text)

        return None

    except Exception as exc:
        logger.error("[KM] On-page content parsing exception for %s: %s",
                     url, exc, exc_info=True)
        return None


# ── Public API ─────────────────────────────────────────────────────────────────

async def extract_keyword_metrics(
    url: str = "",
    html_content: str = "",
    main_keyword: str = "",
    title: str = "",
    h1: str = "",
    existing_item: Optional[Dict[str, Any]] = None,
    **kwargs,
) -> Dict[str, Any]:
    """
    Resolve the main keyword for a page.

    Priority order:
      1. main_keyword already provided (from job payload)  → "provided"
      2. Title tag (Scrapy-extracted or from HTML)          → "title_tag"
      3. DataForSEO On-Page Content Parsing API             → "dataforseo_onpage"
      4. H1 tag fallback                                    → "h1"
      5. None found                                         → "none"
    """
    existing = existing_item or {}
    audit_log: Dict[str, str] = {}

    # ── Check if already resolved ──────────────────────────────────────────
    resolved = existing.get("main_keyword")
    if resolved:
        audit_log["main_keyword"] = "FOUND"
        return {
            "main_keyword": resolved,
            "keyword_source": "provided",
            "audit_log": audit_log,
        }

    # ── Strategy 1: Provided keyword from job payload ──────────────────────
    if main_keyword and main_keyword.strip():
        audit_log["main_keyword"] = "PROVIDED"
        return {
            "main_keyword": main_keyword.strip(),
            "keyword_source": "provided",
            "audit_log": audit_log,
        }

    # ── Strategy 2: Title tag (free, no API) ───────────────────────────────
    raw_title = title or _extract_title_from_html(html_content)
    keyword_from_title = _keyword_from_title(raw_title)
    if keyword_from_title:
        audit_log["main_keyword"] = "EXTRACTED-TITLE"
        return {
            "main_keyword": keyword_from_title,
            "keyword_source": "title_tag",
            "audit_log": audit_log,
        }

    # ── Strategy 3: DataForSEO On-Page API ─────────────────────────────────
    api_keyword = await _fetch_keyword_from_onpage(url)
    if api_keyword:
        audit_log["main_keyword"] = "FETCHED-ONPAGE-API"
        return {
            "main_keyword": api_keyword,
            "keyword_source": "dataforseo_onpage",
            "audit_log": audit_log,
        }

    # ── Strategy 4: H1 fallback ───────────────────────────────────────────
    raw_h1 = h1 or _extract_h1_from_html(html_content)
    if raw_h1:
        audit_log["main_keyword"] = "EXTRACTED-H1"
        return {
            "main_keyword": raw_h1,
            "keyword_source": "h1",
            "audit_log": audit_log,
        }

    # ── Nothing found ─────────────────────────────────────────────────────
    audit_log["main_keyword"] = "NONE"
    return {
        "main_keyword": None,
        "keyword_source": "none",
        "audit_log": audit_log,
    }

"""
Central Orchestrator for Content Audit
Coordinates the execution of sub-modules and aggregates the results.
"""
import logging
from typing import Dict, Any, List, Optional

from .PageMetrics import extract_page_metrics
from .KeywordMetrics import extract_keyword_metrics
from .PerformanceMetrics import extract_performance_metrics
from .ContentMetrics import extract_content_metrics
from .BacklinkMetrics import extract_crawltime_backlink_fields
from .KeywordFinder import resolve_keywords, KeywordBundle

logger = logging.getLogger(__name__)

async def run_content_audit(
    url: str,
    html_content: str,
    response_status: int,
    response_headers: Dict[str, str],
    response_time_ms: float,
    final_url: str = None,
    raw_body_size: int = 0,
    redirect_urls: list = None,
    main_keyword: str = "",
    ga_property_id: str = None,
    existing_item: Dict[str, Any] = None,
    site_domain: str = "",
    internal_outlinks: Optional[int] = None,
    external_outlinks: Optional[int] = None,
    outlink_url_list: Optional[List[str]] = None,
    h1: str = "",
    title: str = "",
    **kwargs
) -> Dict[str, Any]:
    """
    Async entry point for Content Audit.
    Runs all active sub-modules and returns a unified structure.

    Returns a dictionary mapping sub-module names to their respective results.
    """

    # 0. Keyword Resolution — MUST run first; all sub-modules share this bundle.
    try:
        keyword_bundle: KeywordBundle = await resolve_keywords(
            url=url,
            html_content=html_content,
            main_keyword=main_keyword,
            title=title,
            h1=h1,
            location_code=kwargs.get("location_code", 2840),
            language_code=kwargs.get("language_code", "en"),
            skip_api=kwargs.get("skip_keyword_api", False),
        )
        # Use the resolved primary keyword for all downstream modules
        resolved_keyword = keyword_bundle.primary_keyword or main_keyword
        logger.info(
            "[ContentAudit] Keyword resolved for %s → '%s' (%s)",
            url, resolved_keyword, keyword_bundle.keyword_source,
        )
    except Exception as e:
        logger.error(f"Error resolving keywords for {url}: {e}")
        keyword_bundle = KeywordBundle(
            primary_keyword=main_keyword,
            keyword_source="provided" if main_keyword else "",
        )
        resolved_keyword = main_keyword

    # Inject bundle into kwargs so sub-modules that accept **kwargs can use it
    kwargs["keyword_bundle"] = keyword_bundle

    # 1. Page Metrics (Fully Functional)
    try:
        page_metrics_result = extract_page_metrics(
            url=url,
            html_content=html_content,
            response_status=response_status,
            response_headers=response_headers,
            response_time_ms=response_time_ms,
            final_url=final_url,
            raw_body_size=raw_body_size,
            redirect_urls=redirect_urls,
            main_keyword=resolved_keyword,
            keyword_bundle=keyword_bundle,
            title=title,
            h1=h1,
            crawl_graph=kwargs.get("crawl_graph"),
        )
    except Exception as e:
        logger.error(f"Error extracting page metrics for {url}: {e}")
        page_metrics_result = {"error": str(e)}

    # 2. Keyword Metrics (async — awaited)
    try:
        keyword_metrics_result = await extract_keyword_metrics(
            url=url,
            html_content=html_content,
            main_keyword=resolved_keyword,
            title=title,
            h1=h1,
            existing_item=existing_item,
            keyword_bundle=keyword_bundle,
        )
    except Exception as e:
        logger.error(f"Error extracting keyword metrics for {url}: {e}")
        keyword_metrics_result = {"error": str(e)}

    # 3. Performance Metrics (async — awaited)
    try:
        performance_metrics_result = await extract_performance_metrics(
            url=url,
            html_content=html_content,
            main_keyword=resolved_keyword,
            ga_property_id=ga_property_id,
            response_headers=response_headers,
            existing_item=existing_item,
            h1=h1,
            title=title,
            **kwargs,
        )
    except Exception as e:
        logger.error(f"Error extracting performance metrics for {url}: {e}")
        performance_metrics_result = {"error": str(e)}

    # 4. Content Metrics (async — awaited)
    try:
        content_metrics_result = await extract_content_metrics(
            url=url,
            html_content=html_content,
            main_keyword=resolved_keyword,
            response_headers=response_headers,
            existing_item=existing_item,
            h1=h1,
            title=title,
            **kwargs,
        )
    except Exception as e:
        logger.error(f"Error extracting content metrics for {url}: {e}")
        content_metrics_result = {"error": str(e)}

    # 5. Backlink Metrics (async — awaited)
    try:
        backlink_metrics_result = extract_crawltime_backlink_fields(
            url=url,
            html_content=html_content,
            site_domain=site_domain,
            internal_outlinks=internal_outlinks,
            external_outlinks=external_outlinks,
            outlink_url_list=outlink_url_list,
            **kwargs,
        )
    except Exception as e:
        logger.error(f"Error extracting backlink metrics for {url}: {e}")
        backlink_metrics_result = {"error": str(e)}

    return {
        "keyword_bundle": {
            "primary_keyword": keyword_bundle.primary_keyword,
            "keyword_source": keyword_bundle.keyword_source,
            "intent": keyword_bundle.intent,
            "post_category_type": keyword_bundle.post_category_type,
            "all_keywords": keyword_bundle.all_keywords,
            "ranked_keywords": keyword_bundle.ranked_keywords,
            "related_keywords": keyword_bundle.related_keywords,
            "on_page_keywords": keyword_bundle.on_page_keywords,
            "question_keywords": keyword_bundle.question_keywords,
            "long_tail_keywords": keyword_bundle.long_tail_keywords,
            "entity_keywords": keyword_bundle.entity_keywords,
        },
        "page_metrics": page_metrics_result,
        "keyword_metrics": keyword_metrics_result,
        "performance_metrics": performance_metrics_result,
        "content_metrics": content_metrics_result,
        "backlink_metrics": backlink_metrics_result,
    }

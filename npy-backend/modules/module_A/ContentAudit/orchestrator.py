"""
Central Orchestrator for Content Audit
Coordinates the execution of sub-modules and aggregates the results.
"""
import logging
from typing import Dict, Any

from .PageMetrics import extract_page_metrics
from .KeywordMetrics import extract_keyword_metrics
from .PerformanceMetrics import extract_performance_metrics
from .ContentMetrics import extract_content_metrics
from .BacklinkMetrics import extract_backlink_metrics

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
    **kwargs
) -> Dict[str, Any]:
    """
    Async entry point for Content Audit.
    Runs all active sub-modules and returns a unified structure.

    Returns a dictionary mapping sub-module names to their respective results.
    """

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
        )
    except Exception as e:
        logger.error(f"Error extracting page metrics for {url}: {e}")
        page_metrics_result = {"error": str(e)}

    # 2. Keyword Metrics (Placeholder)
    try:
        keyword_metrics_result = extract_keyword_metrics(url=url, html_content=html_content)
    except Exception as e:
        logger.error(f"Error extracting keyword metrics for {url}: {e}")
        keyword_metrics_result = {"error": str(e)}

    # 3. Performance Metrics (async — awaited)
    try:
        performance_metrics_result = await extract_performance_metrics(
            url=url,
            html_content=html_content,
            main_keyword=main_keyword,
            ga_property_id=ga_property_id,
            response_headers=response_headers,
            existing_item=existing_item,
            **kwargs,
        )
    except Exception as e:
        logger.error(f"Error extracting performance metrics for {url}: {e}")
        performance_metrics_result = {"error": str(e)}

    # 4. Content Metrics (Placeholder)
    try:
        content_metrics_result = extract_content_metrics(url=url, html_content=html_content)
    except Exception as e:
        logger.error(f"Error extracting content metrics for {url}: {e}")
        content_metrics_result = {"error": str(e)}

    # 5. Backlink Metrics (Placeholder)
    try:
        backlink_metrics_result = extract_backlink_metrics(url=url)
    except Exception as e:
        logger.error(f"Error extracting backlink metrics for {url}: {e}")
        backlink_metrics_result = {"error": str(e)}

    return {
        "page_metrics": page_metrics_result,
        "keyword_metrics": keyword_metrics_result,
        "performance_metrics": performance_metrics_result,
        "content_metrics": content_metrics_result,
        "backlink_metrics": backlink_metrics_result,
    }

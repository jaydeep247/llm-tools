from bs4 import BeautifulSoup
import time
from typing import Dict, Any, Optional

from .title_extractor import extract_title, validate_title_length
from .content_extractor import extract_tables, extract_faqs
from .technical_extractor import check_mixed_content, extract_viewport
from .structured_data_extractor import extract_structured_data, identify_structured_data_types
from .page_metrics_agent import extract_advanced_page_metrics

def extract_page_metrics(
    url: str,
    html_content: str,
    response_status: int,
    response_headers: Dict[str, str],
    response_time_ms: float,
    final_url: str = None,
    raw_body_size: int = 0,
    redirect_urls: list = None,
) -> Dict[str, Any]:
    """
    Extract page metrics from a crawled page.
    Redundant calculations have been removed, preserving only the title
    and unique page matrix features (tables, faqs, mixed content, viewport, structured data).
    """
    if final_url is None:
        final_url = url
        
    soup = BeautifulSoup(html_content, 'lxml')
    
    # 1. Title (Preserved as requested)
    title_data = extract_title(soup)
    title_validation = validate_title_length(title_data['titleLength'])
    
    # 2. Technical Checks
    mixed_content_data = check_mixed_content(soup, final_url)
    viewport_data = extract_viewport(soup)
    
    # 3. Specialized Content
    tables_data = extract_tables(soup)
    faqs_data = extract_faqs(soup)
    
    # 4. Structured Data
    structured_data_items = extract_structured_data(soup)
    structured_data_types = identify_structured_data_types(structured_data_items)
    
    existing_data = {}
    if redirect_urls:
        existing_data['redirect_urls'] = redirect_urls

    # 5. Advanced Page Metrics
    advanced_metrics, audit_log = extract_advanced_page_metrics(
        url=final_url,
        existing_data=existing_data,
        html_content=html_content,
        headers=response_headers,
        status_code=response_status
    )
    
    # Assemble final metrics object
    metrics = {
        'url': url,
        'finalUrl': final_url,
        
        # Title
        **title_data,
        'titleValidation': title_validation,
        
        # Technical
        'mixedContent': mixed_content_data,
        'viewport': viewport_data,
        
        # Specialized
        'tables': tables_data,
        'faqs': faqs_data,
        'structuredDataDetection': {
             'hasStructuredData': len(structured_data_items) > 0,
             'items': structured_data_items,
             'types': structured_data_types
        },
        
        # Advanced Page Metrics
        **advanced_metrics,
        'extractionAuditLog': audit_log
    }
    
    return metrics

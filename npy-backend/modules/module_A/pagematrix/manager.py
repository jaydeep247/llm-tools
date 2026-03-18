from bs4 import BeautifulSoup
import time
from typing import Dict, Any, Optional

from .title_extractor import extract_title, validate_title_length
from .meta_extractor import extract_meta_description, extract_meta_tags, validate_meta_description_length, validate_canonical
from .header_extractor import extract_headers
from .content_extractor import extract_word_count, extract_tables, extract_faqs, extract_amp_links, extract_mobile_alternate
from .technical_extractor import check_http_status, check_mixed_content, measure_page_size, measure_page_size_from_int, extract_viewport
from .structured_data_extractor import extract_structured_data, identify_structured_data_types

def extract_page_metrics(
    url: str,
    html_content: str,
    response_status: int,
    response_headers: Dict[str, str],
    response_time_ms: float,
    final_url: str = None,
    raw_body_size: int = 0,
) -> Dict[str, Any]:
    """
    Extract all page metrics from a crawled page.
    Aggregates results from all extractors.
    
    Args:
        raw_body_size: The raw HTTP response body size in bytes
            (``len(response.body)``).  When provided, this is used for
            ``measure_page_size`` so that "Size (bytes)" matches Screaming
            Frog's definition (uncompressed response body, not re-encoded
            HTML).  Falls back to ``len(html_content.encode('utf-8'))``
            when 0.
    """
    if final_url is None:
        final_url = url
        
    soup = BeautifulSoup(html_content, 'lxml')
    
    # 1. Title
    title_data = extract_title(soup)
    title_validation = validate_title_length(title_data['titleLength'])
    
    # 2. Meta Description
    meta_desc_data = extract_meta_description(soup)
    meta_desc_validation = validate_meta_description_length(meta_desc_data['metaDescriptionLength'])
    
    # 3. Meta Tags (Robots, Keywords, Canonical, Viewport, etc.)
    meta_tags_data = extract_meta_tags(soup, url)
    canonical_validation = validate_canonical(meta_tags_data['canonicalUrl'], url)
    
    # 4. Headers (H1-H6)
    headers_data = extract_headers(soup)
    
    # 5. Content Analysis (Word Count, Keyword Density)
    # Determine target keyword (heuristic: use first H1 or title)
    target_keyword = None
    if headers_data['h1Tags']:
        target_keyword = headers_data['h1Tags'][0]
    elif title_data['title']:
        target_keyword = title_data['title']
        
    word_count_data = extract_word_count(soup, target_keyword)
    
    # 6. Technical Checks
    # Status
    status_data = check_http_status(response_status)
    
    # Mixed Content
    mixed_content_data = check_mixed_content(soup, final_url)
    
    # Page Size — prefer the raw body size when available so that
    # "Size (bytes)" matches Screaming Frog (uncompressed response body).
    if raw_body_size > 0:
        page_size_data = measure_page_size_from_int(raw_body_size)
    else:
        page_size_data = measure_page_size(html_content.encode('utf-8'))
    
    # Viewport (Enhanced)
    viewport_data = extract_viewport(soup)
    
    # 7. Specialized Content
    # Tables
    tables_data = extract_tables(soup)
    
    # FAQs
    faqs_data = extract_faqs(soup)
    
    # AMP
    amp_link = extract_amp_links(soup)
    
    # Mobile Alternate
    mobile_alternate = extract_mobile_alternate(soup)
    
    # Structured Data
    structured_data_items = extract_structured_data(soup)
    structured_data_types = identify_structured_data_types(structured_data_items)
    
    # Assemble final metrics object
    metrics = {
        'url': url,
        'finalUrl': final_url,
        'responseTime': response_time_ms,
        
        # Title
        **title_data,
        'titleValidation': title_validation,
        
        # Meta Description
        **meta_desc_data,
        'metaDescriptionValidation': meta_desc_validation,
        
        # Meta Tags
        **meta_tags_data,
        'canonicalValidation': canonical_validation,
        
        # Headers
        **headers_data,
        
        # Word Count & Content
        'wordCount': word_count_data,
        
        # Technical
        'status': status_data,
        'mixedContent': mixed_content_data,
        'pageSize': page_size_data,
        'viewport': viewport_data,
        
        # Specialized
        'tables': tables_data,
        'faqs': faqs_data,
        'ampHtmlUrl': amp_link,
        'mobileAlternateUrl': mobile_alternate,
        'structuredDataDetection': {
             'hasStructuredData': len(structured_data_items) > 0,
             'items': structured_data_items,
             'types': structured_data_types
        }
    }
    
    return metrics

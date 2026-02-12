"""
Scrapy Items for Website Crawler
Defines data structures for scraped items matching Node.js crawler output
"""

import scrapy
from typing import Optional, List, Dict, Any


class PageItem(scrapy.Item):
    """Page data item - core fields matching Node.js implementation"""
    
    # Basic fields
    url = scrapy.Field()
    title = scrapy.Field()
    title_length = scrapy.Field()
    meta_description = scrapy.Field()
    description_length = scrapy.Field()
    status_code = scrapy.Field()
    response_time = scrapy.Field()
    content_type = scrapy.Field()
    timestamp = scrapy.Field()
    
    # Content metrics
    word_count = scrapy.Field()
    sentence_count = scrapy.Field()
    paragraph_count = scrapy.Field()
    text_to_html_ratio = scrapy.Field()
    
    # SEO fields
    canonical_url = scrapy.Field()
    meta_robots = scrapy.Field()
    indexable = scrapy.Field()
    indexability_status = scrapy.Field()
    
    # Heading structure
    h1_tags = scrapy.Field()
    h2_tags = scrapy.Field()
    h3_tags = scrapy.Field()
    h4_tags = scrapy.Field()
    h5_tags = scrapy.Field()
    h6_tags = scrapy.Field()
    
    # URL analysis
    crawl_depth = scrapy.Field()
    folder_depth = scrapy.Field()
    
    # Duplicate detection
    content_hash = scrapy.Field()
    
    # Pagination
    rel_next = scrapy.Field()
    rel_prev = scrapy.Field()
    
    # Language
    language = scrapy.Field()
    
    # New directly crawlable fields
    # Meta tags
    meta_keywords = scrapy.Field()
    meta_keywords_length = scrapy.Field()
    meta_refresh = scrapy.Field()
    viewport = scrapy.Field()
    
    # HTTP Headers
    x_robots_tag = scrapy.Field()
    http_rel_next = scrapy.Field()
    http_rel_prev = scrapy.Field()
    last_modified = scrapy.Field()
    cookies = scrapy.Field()
    http_version = scrapy.Field()
    
    # Links
    amphtml_link = scrapy.Field()
    mobile_alternate_link = scrapy.Field()
    
    # Structured data
    has_structured_data = scrapy.Field()
    structured_data_types = scrapy.Field()
    structured_data_count = scrapy.Field()
    
    # Content elements
    table_count = scrapy.Field()
    has_faq = scrapy.Field()
    faq_count = scrapy.Field()
    
    # AMP
    is_amp = scrapy.Field()
    
    # Security
    has_mixed_content = scrapy.Field()
    mixed_content_urls = scrapy.Field()
    
    # Redirects
    redirect_url = scrapy.Field()
    redirect_type = scrapy.Field()
    
    # Size
    page_size_bytes = scrapy.Field()
    html_size_bytes = scrapy.Field()

    # New computed fields (module_A metrics)
    fields = scrapy.Field()


class LinkItem(scrapy.Item):
    """Link relationship data item"""
    
    source_url = scrapy.Field()
    target_url = scrapy.Field()
    is_internal = scrapy.Field()
    anchor_text = scrapy.Field()
    nofollow = scrapy.Field()
    rel = scrapy.Field()


class SitemapUrlItem(scrapy.Item):
    """Sitemap URL data item"""
    
    url = scrapy.Field()
    last_modified = scrapy.Field()
    change_frequency = scrapy.Field()
    priority = scrapy.Field()
    source_sitemap = scrapy.Field()

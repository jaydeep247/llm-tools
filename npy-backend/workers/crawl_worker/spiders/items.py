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


class ResourceItem(scrapy.Item):
    """Resource data item (CSS, JS, images, external)"""
    
    page_url = scrapy.Field()
    resource_url = scrapy.Field()
    resource_type = scrapy.Field()  # 'css', 'js', 'image', 'external'
    status_code = scrapy.Field()


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

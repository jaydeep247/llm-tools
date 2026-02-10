"""
Website Spider
Main Scrapy spider for crawling websites with sitemap discovery
"""

import scrapy
from scrapy.http import Response
from typing import Dict, Any, Optional
from datetime import datetime
from urllib.parse import urlparse
import asyncio

from .items import PageItem, ResourceItem, LinkItem, SitemapUrlItem
from .sitemap_discovery import SitemapDiscovery
from .extractors import (
    BasicExtractor,
    SeoExtractor,
    ContentExtractor,
    HeadingExtractor,
    ResourceExtractor,
    LinkExtractor,
)
from utils.logger import logger


class WebsiteSpider(scrapy.Spider):
    """
    Main spider for website crawling
    Matches functionality of Node.js crawler
    """
    
    name = 'website_spider'
    
    custom_settings = {
        'CONCURRENT_REQUESTS': 5,
        'DOWNLOAD_DELAY': 0.5,
        'ROBOTSTXT_OBEY': True,
        'USER_AGENT': 'Mozilla/5.0 (compatible; WebCrawler/1.0)',
        'DEPTH_LIMIT': 0,  # No limit by default
    }
    
    def __init__(
        self,
        start_url: str,
        session_id: str,
        allow_subdomains: bool = True,
        max_concurrency: int = 5,
        *args,
        **kwargs
    ):
        super().__init__(*args, **kwargs)
        
        self.start_url = start_url
        self.session_id = session_id
        self.allow_subdomains = allow_subdomains
        self.max_concurrency = max_concurrency
        
        # Parse allowed host
        parsed = urlparse(start_url)
        self.allowed_host = parsed.netloc
        
        # Update settings
        self.custom_settings['CONCURRENT_REQUESTS'] = max_concurrency
        
        # Storage for sitemap data
        self.sitemap_data = {
            'sitemap_urls': [],
            'discovered_urls': [],
        }
        
        # Track request start times
        self.request_start_times = {}
        
        # Crawl metadata
        self.crawl_started_at = None
        self.pages_crawled = 0
        self.resources_collected = 0
        self.links_collected = 0
    
    def start_requests(self):
        """Initialize crawl with sitemap discovery"""
        self.crawl_started_at = datetime.now().isoformat()
        
        # Discover sitemaps
        logger.info(f"Starting crawl for {self.start_url}")
        logger.info("Discovering sitemaps...")
        
        # Run sitemap discovery synchronously (Scrapy doesn't support async start_requests well)
        # We'll use a workaround by yielding a dummy request first
        yield scrapy.Request(
            url=self.start_url,
            callback=self.parse_with_sitemap_discovery,
            dont_filter=True,
            meta={'depth': 0},
            errback=self.handle_error,
        )
    
    async def discover_sitemaps_async(self):
        """Discover sitemaps asynchronously"""
        discovery = SitemapDiscovery()
        result = await discovery.discover_sitemaps(self.start_url)
        return result
    
    def parse_with_sitemap_discovery(self, response: Response):
        """First request - discover sitemaps then start crawling"""
        # Discover sitemaps
        try:
            # Run async sitemap discovery
            loop = asyncio.get_event_loop()
            sitemap_result = loop.run_until_complete(self.discover_sitemaps_async())
            
            self.sitemap_data['sitemap_urls'] = sitemap_result['sitemap_urls']
            self.sitemap_data['discovered_urls'] = sitemap_result['discovered_urls']
            
            logger.info(f"Discovered {len(sitemap_result['sitemap_urls'])} sitemaps")
            logger.info(f"Found {len(sitemap_result['discovered_urls'])} URLs from sitemaps")
            
            # Yield sitemap URL items
            for url_data in sitemap_result['discovered_urls']:
                item = SitemapUrlItem()
                item['url'] = url_data['url']
                item['last_modified'] = url_data.get('last_modified')
                item['change_frequency'] = url_data.get('change_frequency')
                item['priority'] = url_data.get('priority')
                item['source_sitemap'] = url_data.get('source_sitemap')
                yield item
        
        except Exception as e:
            logger.error(f"Sitemap discovery failed: {str(e)}")
        
        # Now parse the start URL
        yield from self.parse(response)
    
    def parse(self, response: Response):
        """Main parsing logic for each page"""
        # Track start time
        request_id = id(response.request)
        start_time = self.request_start_times.get(request_id, datetime.now().timestamp())
        
        # Calculate crawl depth
        crawl_depth = response.meta.get('depth', 0)
        
        # Calculate folder depth
        parsed_url = urlparse(response.url)
        folder_depth = len([p for p in parsed_url.path.split('/') if p])
        
        # Extract all fields using extractors
        basic_fields = BasicExtractor.extract(response, start_time)
        seo_fields = SeoExtractor.extract(response)
        content_fields = ContentExtractor.extract(response)
        heading_fields = HeadingExtractor.extract(response)
        
        # Create page item
        page_item = PageItem()
        page_item.update(basic_fields)
        page_item.update(seo_fields)
        page_item.update(content_fields)
        page_item.update(heading_fields)
        page_item['crawl_depth'] = crawl_depth
        page_item['folder_depth'] = folder_depth
        
        yield page_item
        self.pages_crawled += 1
        
        # Extract resources
        resources = ResourceExtractor.extract(response, self.allowed_host, self.allow_subdomains)
        for resource_data in resources:
            resource_item = ResourceItem()
            resource_item.update(resource_data)
            yield resource_item
            self.resources_collected += 1
        
        # Extract links
        links = LinkExtractor.extract(response, self.allowed_host, self.allow_subdomains)
        for link_data in links:
            link_item = LinkItem()
            link_item.update(link_data)
            yield link_item
            self.links_collected += 1
        
        # Follow internal links
        for link_data in links:
            if link_data['is_internal'] and not link_data['nofollow']:
                target_url = link_data['target_url']
                yield scrapy.Request(
                    url=target_url,
                    callback=self.parse,
                    meta={'depth': crawl_depth + 1},
                    errback=self.handle_error,
                )
    
    def handle_error(self, failure):
        """Handle request errors"""
        logger.error(f"Request failed: {failure.request.url} - {str(failure.value)}")
    
    def closed(self, reason):
        """Called when spider closes"""
        logger.info(f"Spider closed: {reason}")
        logger.info(f"Pages crawled: {self.pages_crawled}")
        logger.info(f"Resources collected: {self.resources_collected}")
        logger.info(f"Links collected: {self.links_collected}")

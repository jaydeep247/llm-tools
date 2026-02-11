"""
Website Spider
Main Scrapy spider for crawling websites with sitemap discovery
"""

import scrapy
from scrapy.http import Response, HtmlResponse
from typing import Dict, Any, Optional
from datetime import datetime
from urllib.parse import urlparse
import asyncio
import re
import xml.etree.ElementTree as ET
import gzip
from io import BytesIO

from .items import PageItem, LinkItem, SitemapUrlItem
from .extractors import (
    BasicExtractor,
    SeoExtractor,
    ContentExtractor,
    HeadingExtractor,
    LinkExtractor,
    AdvancedExtractor,
)
from utils.logger import logger


class WebsiteSpider(scrapy.Spider):
    """
    Main spider for website crawling
    Matches functionality of Node.js crawler
    """
    
    name = 'website_spider'
    
    custom_settings = {
        'CONCURRENT_REQUESTS': 20,   # Increased from 16
        'DOWNLOAD_DELAY': 0,
        'ROBOTSTXT_OBEY': False,
        'DOWNLOAD_TIMEOUT': 15,      # Reduced from 30s
        'USER_AGENT': 'Mozilla/5.0 (compatible; WebCrawler/1.0)',
        'DEPTH_LIMIT': 8,
        'COOKIES_ENABLED': False,
        'AUTOTHROTTLE_ENABLED': True,
        'AUTOTHROTTLE_START_DELAY': 0.1,
        'AUTOTHROTTLE_MAX_DELAY': 5,
        'AUTOTHROTTLE_TARGET_CONCURRENCY': 20, # Increased from 16
        'REACTOR_THREADPOOL_MAXSIZE': 32,
        'LOG_LEVEL': 'INFO',
        'RETRY_ENABLED': True,
        'RETRY_TIMES': 1,            # 1 retry only
        'ITEM_PIPELINES': {
            'workers.crawl_worker.pipelines.mongo_pipeline.MongoPipeline': 300,
        },
    }
    
    def __init__(
        self,
        start_url: str,
        session_id: str = None,
        job_id: str = None,
        project_id: str = None,
        allow_subdomains: bool = True,
        max_concurrency: int = 20,
        max_pages: int = 0,
        timeout: int = 0,
        *args,
        **kwargs
    ):
        super().__init__(*args, **kwargs)
        
        self.start_url = start_url
        self.session_id = session_id
        self.job_id = job_id
        self.project_id = project_id
        
        self.allow_subdomains = allow_subdomains
        self.max_concurrency = max_concurrency
        self.max_pages = max_pages
        self.timeout = timeout
        
        # Parse allowed host
        parsed = urlparse(start_url)
        self.allowed_host = parsed.netloc
        self.base_scheme = parsed.scheme
        
        # Determine trailing slash preference from start_url
        self.force_trailing_slash = start_url.endswith('/')
        
        # Update settings
        self.custom_settings['CONCURRENT_REQUESTS'] = max_concurrency
        self.custom_settings['AUTOTHROTTLE_TARGET_CONCURRENCY'] = max_concurrency
        
        # Storage for sitemap data
        self.sitemap_data = {
            'sitemap_urls': [],
            'discovered_urls': [],
        }
        
        # Track request start times & pagination
        self.request_start_times = {}
        self.pagination_failures = {} # Track failed patterns
        
        # Crawl metadata
        self.crawl_started_at = None
        self.crawl_started_timestamp = None
        self.pages_crawled = 0
        self.links_collected = 0
        self.should_stop = False
        
        # Constants
        self.MAX_PAGINATION_DEPTH = 5  # Strict limit: max 5 pages deep
        self.MAX_PAGINATION_FAILURES = 1 # Strict limit: stop on FIRST failure

    def normalize_url(self, url: str) -> str:
        """Normalize URL to reduce redirects"""
        # 1. Scheme normalization (HTTP -> HTTPS if base is HTTPS)
        if self.base_scheme == 'https' and url.startswith('http://'):
            url = url.replace('http://', 'https://', 1)
            
        # 2. Trailing slash normalization (skip files)
        path = urlparse(url).path
        if '.' not in path.split('/')[-1]:
            if self.force_trailing_slash and not url.endswith('/'):
                 url += '/'
            elif not self.force_trailing_slash and url.endswith('/'):
                 url = url[:-1]
        
        return url

    def is_pagination_url(self, url: str) -> tuple[bool, int, str]:
        """
        Check if URL is a pagination URL.
        Returns: (is_pagination, page_number, pattern_key)
        """
        # Pattern 1: /page/N/ or /p/N/
        match = re.search(r'/(?:page|p)/(\d+)/?', url)
        if match:
            return True, int(match.group(1)), 'path_page'
            
        # Pattern 2: ?page=N or &p=N
        match = re.search(r'[?&](?:page|p)=(\d+)', url)
        if match:
            return True, int(match.group(1)), 'query_page'
            
        return False, 0, ''

    def get_url_priority(self, url: str, is_sitemap: bool = False) -> int:
        """Calculate priority for a URL"""
        if is_sitemap:
            return 100
        
        is_pag, page_num, _ = self.is_pagination_url(url)
        if is_pag:
            # Deprioritize pagination significantly
            return 10
        
        # Homepage / Root
        path = urlparse(url).path
        if path == '/' or not path:
            return 100
            
        # Category roots (heuristic: short path, no digits)
        if len(path.strip('/').split('/')) <= 2 and not re.search(r'\d', path):
            return 40
            
        # Default content priority
        return 50
    
    def start_requests(self):
        """Initialize crawl with parallel sitemap discovery and homepage crawl"""
        self.crawl_started_at = datetime.now().isoformat()
        self.crawl_started_timestamp = datetime.now().timestamp()
        
        logger.info(f"Starting optimized SEO crawl for {self.start_url}")
        
        # 1. Start crawling homepage IMMEDIATELY (High Priority)
        yield scrapy.Request(
            url=self.start_url,
            callback=self.parse,
            priority=100,
            meta={'depth': 0},
            errback=self.handle_error,
        )
        
        # 2. Start sitemap discovery via robots.txt (Background)
        parsed = urlparse(self.start_url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        robots_url = f"{base_url}/robots.txt"
        
        yield scrapy.Request(
            url=robots_url,
            callback=self.parse_robots,
            priority=90,
            errback=self.handle_sitemap_error,
            meta={'dont_cache': True}
        )
        
        # 3. Try common sitemap locations as fallback
        common_sitemaps = [
            f"{base_url}/sitemap.xml",
            f"{base_url}/sitemap_index.xml",
        ]
        
        for sitemap_url in common_sitemaps:
            yield scrapy.Request(
                url=sitemap_url,
                callback=self.parse_sitemap,
                priority=80,
                errback=self.handle_sitemap_error,
                meta={'dont_cache': True}
            )

    def parse_robots(self, response):
        """Parse robots.txt for sitemap directives"""
        try:
            for line in response.text.splitlines():
                if line.strip().lower().startswith('sitemap:'):
                    sitemap_url = line.split(':', 1)[1].strip()
                    logger.info(f"Found sitemap in robots.txt: {sitemap_url}")
                    yield scrapy.Request(
                        url=sitemap_url,
                        callback=self.parse_sitemap,
                        priority=90,
                        errback=self.handle_sitemap_error
                    )
        except Exception as e:
            logger.warning(f"Error parsing robots.txt: {e}")

    def parse_sitemap(self, response):
        """Parse sitemap XML (handles regular sitemaps and indexes)"""
        try:
            body = response.body
            
            # Handle gzip if necessary (though Scrapy usually handles this)
            if response.url.endswith('.gz'):
                try:
                    body = gzip.decompress(body)
                except:
                    pass
            
            # Safe XML parsing
            try:
                root = ET.fromstring(body)
            except ET.ParseError:
                logger.warning(f"Invalid XML in sitemap: {response.url}")
                return

            # Check for sitemap index
            if 'sitemapindex' in root.tag.lower():
                namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
                for sitemap in root.findall('.//ns:sitemap', namespace):
                    loc = sitemap.find('ns:loc', namespace)
                    if loc is not None and loc.text:
                        yield scrapy.Request(
                            url=loc.text,
                            callback=self.parse_sitemap,
                            priority=85,
                            errback=self.handle_sitemap_error
                        )
            # Check for urlset
            elif 'urlset' in root.tag.lower():
                namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
                urls_found = 0
                for url_elem in root.findall('.//ns:url', namespace):
                    loc = url_elem.find('ns:loc', namespace)
                    if loc is not None and loc.text:
                        url = loc.text
                        urls_found += 1
                        
                        # Yield Sitemap Item
                        item = SitemapUrlItem()
                        item['url'] = url
                        item['source_sitemap'] = response.url
                        
                        # Extract other metadata
                        lastmod = url_elem.find('ns:lastmod', namespace)
                        if lastmod is not None: item['last_modified'] = lastmod.text
                        
                        changefreq = url_elem.find('ns:changefreq', namespace)
                        if changefreq is not None: item['change_frequency'] = changefreq.text
                        
                        priority = url_elem.find('ns:priority', namespace)
                        if priority is not None: item['priority'] = priority.text
                        
                        yield item
                        
                        # Yield Crawl Request (Priority lower than sitemap discovery but higher than default)
                        yield scrapy.Request(
                            url=url,
                            callback=self.parse,
                            priority=50,
                            meta={'from_sitemap': True}
                        )
                
                self.links_collected += urls_found
                logger.info(f"Parsed {urls_found} URLs from sitemap: {response.url}. Total known: {self.links_collected}")

        except Exception as e:
            logger.error(f"Error parsing sitemap {response.url}: {e}")

    def handle_sitemap_error(self, failure):
        """Handle sitemap request failures silently"""
        pass
    
    def parse(self, response: Response):
        """Main parsing logic for each page"""
        # Track start time
        request_id = id(response.request)
        start_time = self.request_start_times.get(request_id, datetime.now().timestamp())
        
        # Log progress
        logger.info(f"Crawling {self.pages_crawled + 1} / {self.links_collected} (approx): {response.url}")
        
        # Calculate crawl depth
        crawl_depth = response.meta.get('depth', 0)
        
        # Validate content type
        content_type = response.headers.get('Content-Type', b'').decode('utf-8').lower()
        if 'text/html' not in content_type and 'application/xhtml+xml' not in content_type:
            logger.debug(f"Skipping non-HTML content: {response.url} ({content_type})")
            return
            
        # Calculate folder depth
        parsed_url = urlparse(response.url)
        folder_depth = len([p for p in parsed_url.path.split('/') if p])
        
        # Extract all fields using extractors
        # Robust check: Ensure response is actually HTML before using CSS selectors
        if not isinstance(response, HtmlResponse):
            logger.warning(f"Response is not HtmlResponse (type: {type(response)}), skipping extraction: {response.url}")
            return
            
        basic_fields = BasicExtractor.extract(response, start_time)
        seo_fields = SeoExtractor.extract(response)
        content_fields = ContentExtractor.extract(response)
        heading_fields = HeadingExtractor.extract(response)
        advanced_fields = AdvancedExtractor.extract(response)
        
        # Create page item
        page_item = PageItem()
        page_item.update(basic_fields)
        page_item.update(seo_fields)
        page_item.update(content_fields)
        page_item.update(heading_fields)
        page_item.update(advanced_fields)
        page_item['crawl_depth'] = crawl_depth
        page_item['folder_depth'] = folder_depth
        
        
        yield page_item
        self.pages_crawled += 1
        
        # Check if we should stop crawling
        if self.max_pages > 0 and self.pages_crawled >= self.max_pages:
            logger.info(f"Reached max pages limit: {self.max_pages}")
            self.should_stop = True
            return
        
        if self.timeout > 0:
            elapsed = datetime.now().timestamp() - self.crawl_started_timestamp
            if elapsed >= self.timeout:
                logger.info(f"Reached timeout limit: {self.timeout} seconds")
                self.should_stop = True
                return
        
        # Extract links
        links = LinkExtractor.extract(response, self.allowed_host, self.allow_subdomains)
        for link_data in links:
            link_item = LinkItem()
            link_item.update(link_data)
            yield link_item
            self.links_collected += 1
        
        # Follow internal links
        if not self.should_stop:
            for link_data in links:
                if link_data['is_internal'] and not link_data['nofollow']:
                    target_url = link_data['target_url']
                    
                    # Normalize URL to reduce redirects
                    target_url = self.normalize_url(target_url)
                    
                    # Check pagination depth & loops
                    is_pag, page_num, _ = self.is_pagination_url(target_url)
                    if is_pag:
                        if page_num > self.MAX_PAGINATION_DEPTH:
                            logger.debug(f"Skipping deep pagination: {target_url} (Page {page_num})")
                            continue
                            
                        # Check if we should follow this pagination pattern
                        if not self.should_follow_pagination(target_url):
                            # logger.debug(f"Skipping pagination loop/failure pattern: {target_url}")
                            continue
                    
                    # Calculate priority
                    priority = self.get_url_priority(target_url)
                    
                    if not self.should_stop:
                        yield scrapy.Request(
                            url=target_url,
                            callback=self.parse,
                            meta={'depth': crawl_depth + 1},
                            priority=priority,
                            errback=self.handle_error,
                        )
    
    
    def handle_error(self, failure):
        """Handle request errors and detect pagination loops"""
        self.pages_crawled += 1
        url = failure.request.url
        logger.warning(f"Request failed: {url} - {str(failure.value)}")
        
        # Check if this was a pagination URL failure
        is_pag, _, pattern = self.is_pagination_url(url)
        if is_pag and pattern:
            # Extract the base pattern key
            base_url = re.sub(r'/(?:page|p)/\d+/?', '', url)
            base_url = re.sub(r'[?&](?:page|p)=\d+', '', base_url)
            
            # Use pattern type + base url as key
            key = f"{pattern}:{base_url}"
            
            # Strict mode: Block pattern immediately on failure
            if key not in self.pagination_failures:
                 logger.info(f"Blocking pagination pattern due to failure: {base_url}")
                 self.pagination_failures[key] = 999  # Mark as blocked

    def should_follow_pagination(self, url: str) -> bool:
        """Check if we should follow this pagination URL based on failure history"""
        is_pag, _, pattern = self.is_pagination_url(url)
        if is_pag and pattern:
            base_url = re.sub(r'/(?:page|p)/\d+/?', '', url)
            base_url = re.sub(r'[?&](?:page|p)=\d+', '', base_url)
            key = f"{pattern}:{base_url}"
            
            # If marked as blocked (value 999), stop following
            if self.pagination_failures.get(key, 0) >= 1:
                return False
        return True
    
    def closed(self, reason):
        """Called when spider closes"""
        logger.info(f"Spider closed: {reason}")
        logger.info(f"Pages crawled: {self.pages_crawled}")
        logger.info(f"Links collected: {self.links_collected}")

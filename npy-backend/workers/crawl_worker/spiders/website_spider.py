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

# Import Module A Metrics
# Import Module A Metrics
from modules.module_A.WebsiteCrawler.metrics import (
    pixel_width,
    carbon,
    content_quality,
    link_analysis,
    similarity
)
from modules.module_A.pagematrix.manager import extract_page_metrics

# Import New SEO Modules
from modules.module_A.Wordcount_analysis import wordcount_extractor
from modules.module_A.Broken_links_checker import broken_link_checker
from modules.module_A.Redirects_audit import redirect_audit
from modules.module_A.Text_Quality_Analyzer import text_quality_analyzer


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
            
        # ==================================================================
        # SAVE RAW HTML (For Post-Crawl Moudles)
        # ==================================================================
        # Only save for the homepage/start_url (depth 0) to handle redirects
        if crawl_depth == 0:
            try:
                from utils.storage import save_raw_html_sync
                save_raw_html_sync(self.job_id, response.text)
                logger.info(f"Saved raw HTML for job {self.job_id} from {response.url}")
            except Exception as e:
                logger.error(f"Failed to save raw HTML: {e}")
            
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
        
        # ==================================================================
        # Module A: Metrics Calculation (Legacy + New SEO)
        # ==================================================================
        
        # 1. Legacy Metrics (Restored)
        title_pixel_width = pixel_width.calculate_pixel_width(page_item.get('title', ''))
        meta_desc_pixel_width = pixel_width.calculate_pixel_width(page_item.get('meta_description', ''))
        total_bytes = page_item.get('page_size_bytes', len(response.body))
        carbon_data = carbon.calculate_carbon(total_bytes)
        
        body_text_list = response.css('body ::text').getall()
        visible_text_legacy = ' '.join([t.strip() for t in body_text_list if t.strip()])
        word_count = page_item.get('word_count', 0)
        sentence_count = page_item.get('sentence_count', 0)
        
        quality_data = content_quality.analyze_content_quality(
            visible_text_legacy,
            sentence_count,
            word_count
        )
        
        links_data = LinkExtractor.extract(response, self.allowed_host, self.allow_subdomains)
        outlink_stats = link_analysis.analyze_outlinks(links_data)
        simhash_legacy = similarity.generate_simhash(visible_text_legacy)
        
        # New Consolidated Text Quality Analysis
        tq_results = text_quality_analyzer.analyze(
            html_content=response.text,
            url=response.url,
            title=page_item.get('title', ''),
            word_count=page_item.get('word_count', 0),
            sentence_count=page_item.get('sentence_count', 0),
            paragraph_count=page_item.get('paragraph_count', 0),
            heading_count=len(page_item.get('h1s', [])) + len(page_item.get('h2s', [])),
            target_keyword=None 
        )

        # 2. New SEO Modules (Integrated)
        wordcount_analysis = wordcount_extractor.extract_wordcount_analysis(
            html_content=response.text,
            url=response.url,
            target_keyword=None 
        )
        
        broken_links_report = broken_link_checker.analyze_broken_links(links_data)
        
        redirect_urls = response.request.meta.get('redirect_urls', [])
        redirect_reasons = response.request.meta.get('redirect_reasons', [])
        hops = []
        for i, url in enumerate(redirect_urls):
            hops.append({
                'url': url,
                'status_code': redirect_reasons[i] if i < len(redirect_reasons) else 302,
                'headers': {}
            })
        hops.append({
            'url': response.url,
            'status_code': response.status,
            'headers': {k.decode('utf-8'): v[0].decode('utf-8') for k, v in response.headers.items()}
        })
        redirect_audit_report = redirect_audit.analyze_redirects(hops, page_item.get('canonical_url'))

        # Construct 'fields' dictionary
        page_item['fields'] = {
            # Status
            'status': 'OK' if response.status == 200 else str(response.status),
            
            'website_crawler': {
                # Pixel Widths
                'title_pixel_width': title_pixel_width,
                'meta_description_pixel_width': meta_desc_pixel_width,
                
                # Carbon
                'transferred_bytes': total_bytes, 
                'total_transferred_bytes': total_bytes, 
                'co2_mg': carbon_data['co2_mg'],
                'carbon_rating': carbon_data['rating'],
                
                # Readability & Content (Legacy)
                'average_words_per_sentence': quality_data['average_words_per_sentence'],
                'flesch_reading_ease_score': quality_data['flesch_reading_ease_score'],
                'readability': quality_data['readability'],
                
                # Outlinks (Remaining from legacy)
                'outlinks': outlink_stats['outlinks'],
                'unique_outlinks': outlink_stats['unique_outlinks'],
                'unique_js_outlinks': outlink_stats['unique_js_outlinks'],
                'external_outlinks': outlink_stats['external_outlinks'],
                'unique_external_outlinks': outlink_stats['unique_external_outlinks'],
                'unique_external_js_outlinks': outlink_stats['unique_external_js_outlinks'],
                
                # Duplicates & Similarity (Legacy)
                'closest_near_duplicate_match': None, 
                'no_near_duplicates': 0, 
                'simhash': simhash_legacy, 
                
                # Quality / Errors (Legacy)
                'spelling_errors': quality_data['spelling_errors'],
                'grammar_errors': quality_data['grammar_errors'],
                'hash': page_item.get('content_hash', ''),
                
                'url_encoded_address': response.url,
            },
            
            # Module A: Page Matrix Metrics
            'page_matrix': extract_page_metrics(
                url=response.url,
                html_content=response.text,
                response_status=response.status,
                response_headers={k.decode('utf-8'): v[0].decode('utf-8') for k, v in response.headers.items()},
                response_time_ms=(datetime.now().timestamp() - start_time) * 1000,
                final_url=response.url
            ),
            
            # Text Quality Analyzer (New Consolidated Module)
            'Text Quality Analyzer': tq_results,
            
            # New SEO Fields
            'Wordcount_analysis': wordcount_analysis,
            'Broken_links_checker': broken_links_report,
            'Redirects_audit': redirect_audit_report
        }
        
        
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
        # Optimization: We already extracted links_data above for metrics
        # links = LinkExtractor.extract(response, self.allowed_host, self.allow_subdomains)
        for link_data in links_data:
            link_item = LinkItem()
            link_item.update(link_data)
            yield link_item
            self.links_collected += 1
        
        # Follow internal links
        if not self.should_stop:
            for link_data in links_data:
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

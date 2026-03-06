"""
Website Spider
Main Scrapy spider for crawling websites with sitemap discovery pages
"""

import scrapy
from scrapy.http import Response, HtmlResponse
from typing import Dict, Any, Optional, List
from datetime import datetime
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode
import asyncio
import re
import xml.etree.ElementTree as ET
import gzip
from io import BytesIO

import redis
from scrapy_redis.spiders import RedisSpider
from scrapy import signals
from scrapy.exceptions import DontCloseSpider

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
from utils.config import config
from utils.event_publisher import publisher

from modules.module_A.WebsiteCrawler.metrics import (
    pixel_width,
    carbon,
    content_quality,
    link_analysis,
    similarity,
)
from modules.module_A.pagematrix.manager import extract_page_metrics
from modules.module_A.Wordcount_analysis import wordcount_extractor
from modules.module_A.Broken_links_checker import broken_link_checker
from modules.module_A.Redirects_audit import redirect_audit
from modules.module_A.Text_Quality_Analyzer import text_quality_analyzer
from modules.module_B.keywords import Keyword, extract_keywords_from_html


class WebsiteSpider(RedisSpider):
    """
    Main spider for website crawling
    Matches functionality of Node.js crawler
    """
    
    name = 'website_spider'
    redis_key = "website_spider:start_urls"
    
    custom_settings = {}
    
    def __init__(
        self,
        start_url: str = None,
        session_id: str = None,
        job_id: str = None,
        project_id: str = None,
        allow_subdomains: bool = True,
        max_concurrency: int = 20,
        max_pages: int = 0,
        timeout: int = 0,
        allow_discovery: bool = True,
        start_urls: Optional[List[str]] = None,
        planned_total: Optional[int] = None,
        suppress_completion_events: bool = False,
        *args,
        **kwargs
    ):
        super().__init__(*args, **kwargs)
        
        self.start_url = start_url
        self.session_id = session_id
        self.job_id = job_id
        self.project_id = project_id
        self.suppress_completion_events = suppress_completion_events
        
        # Isolate job context in Redis (Crucial for repeated crawls)
        if self.job_id:
             self.name = f"website_spider_{self.job_id}"
             self.redis_key = f"{self.name}:start_urls"

        self.raw_html_saved = False
        
        self.allow_subdomains = allow_subdomains
        self.max_concurrency = max_concurrency
        self.max_pages = max_pages
        self.timeout = timeout
        self.allow_discovery = allow_discovery
        self.planned_total = planned_total
        
        if start_url:
            parsed = urlparse(start_url)
            self.allowed_host = parsed.netloc
            self.base_scheme = parsed.scheme
            self.force_trailing_slash = start_url.endswith('/')
            
            # Explicitly set allowed_domains for Scrapy's OffsiteMiddleware
            self.allowed_domains = [parsed.netloc]
            # Handle www vs non-www
            if parsed.netloc.startswith('www.'):
                self.allowed_domains.append(parsed.netloc[4:])
            else:
                self.allowed_domains.append(f'www.{parsed.netloc}')
        else:
            self.allowed_host = None
            self.base_scheme = None
            self.force_trailing_slash = False
            self.allowed_domains = []
        
        self.sitemap_data = {
            'sitemap_urls': [],
            'discovered_urls': [],
        }
        self.pages_seen = 0

        self.request_start_times = {}
        self.pagination_failures = {} # Track failed patterns
        
        # Crawl metadata
        self.crawl_started_at = None
        # Set at __init__ time (not start_requests) so the spider_idle grace period
        # always applies — even in distributed mode where start_requests may never
        # set this when the Redis queue is already empty on startup.
        self.crawl_started_timestamp = datetime.now().timestamp()
        self.pages_crawled = 0
        self.links_collected = 0
        self.scheduled_count = 0  # 7.4 Crawl Progress Tracking
        self.skipped_count = 0    # 7.4 Crawl Progress Tracking
        self.should_stop = False
        self.seen_urls = set()
        self.emitted_urls = set()  # Track URLs already emitted via link_found

        if start_urls is not None:
            self.start_urls = start_urls
        elif start_url:
            self.start_urls = [start_url]
        else:
            self.start_urls = []
        
        # Constants
        self.MAX_PAGINATION_DEPTH = 5  # Strict limit: max 5 pages deep
        self.MAX_PAGINATION_FAILURES = 1 # Strict limit: stop on FIRST failure

    @classmethod
    def from_crawler(cls, crawler, *args, **kwargs):
        """Initialize spider with signal handlers for 7.4 Crawl Progress Tracking"""
        spider = super(WebsiteSpider, cls).from_crawler(crawler, *args, **kwargs)
        crawler.signals.connect(spider.spider_closed, signal=signals.spider_closed)
        crawler.signals.connect(spider.request_scheduled, signal=signals.request_scheduled)
        crawler.signals.connect(spider.request_dropped, signal=signals.request_dropped)
        return spider

    def request_scheduled(self, request, spider):
        """Handle scheduled request"""
        self.scheduled_count += 1

    def request_dropped(self, request, spider):
        """Handle dropped request (e.g. filtered by dupefilter)"""
        self.skipped_count += 1

    @property
    def _effective_max_pages(self) -> int:
        """Resolve the crawl page limit from spider arg or scrapy CLOSESPIDER_PAGECOUNT setting."""
        if self.max_pages and self.max_pages > 0:
            return self.max_pages
        try:
            return int(self.crawler.settings.get('CLOSESPIDER_PAGECOUNT', 0))
        except Exception:
            return 0

    def spider_closed(self, spider, reason):
        logger.debug(f"🕷️ SPIDER_CLOSED signal received for {self.job_id}. Reason: {reason}")
        if not self.job_id:
            return
        if self.suppress_completion_events:
            logger.debug(f"🕷️ Skipping JOB_COMPLETED event for {self.job_id} (background crawl, suppress_completion_events=True)")
            return

        # Determine status based on reason
        # Treat closespider_ reasons (like pagecount limit) as completed
        # Also treat 'finished' (normal completion) as completed
        status = 'completed'
        if reason in ['cancelled', 'shutdown'] or 'error' in reason:
            status = 'failed'
        
        # Special case: if reason is 'finished', it means success
        if reason == 'finished':
            status = 'completed'

        try:
            success = publisher.emit_event(self.job_id, 'JOB_COMPLETED' if status == 'completed' else 'JOB_FAILED', {
                'url': self.start_url or 'distributed',
                'completed_at': datetime.now().isoformat(),
                'pages_crawled': self.pages_crawled,
                'links_discovered': self.links_collected,
                'status': status,
                'reason': reason,
                'source': 'spider_closed',
                'projectId': self.project_id,
                'sessionId': self.session_id
            }, retries=5)
            
            if not success:
                logger.error(f"❌ Failed to emit job completion event for {self.job_id} in spider_closed")
        except Exception as e:
            logger.error(f"❌ Exception emitting job completion event: {e}")

    def spider_idle(self, spider):
        """Force close if idle and no requests (failsafe for SCHEDULER_IDLE_BEFORE_CLOSE)"""
        # Grace period: Wait at least 10s after start to allow initial requests to queue.
        # crawl_started_timestamp is always set in __init__ so this guard always fires.
        elapsed = datetime.now().timestamp() - self.crawl_started_timestamp
        if elapsed < 10:
            raise DontCloseSpider

        # Engine slot not yet assigned means no request has been processed yet (e.g. the
        # Redis queue was empty at startup and the Twisted reactor called _next_request
        # before open_spider completed).  Calling close_spider() in this state triggers
        # engine.spider_is_idle() which raises RuntimeError("Engine slot not assigned").
        # Raise DontCloseSpider instead and let SCHEDULER_IDLE_BEFORE_CLOSE handle shutdown.
        try:
            slot = self.crawler.engine.slot
            if slot is None:
                raise DontCloseSpider
            scheduler = getattr(slot, 'scheduler', None)
            has_pending = bool(scheduler and scheduler.has_pending_requests())
        except DontCloseSpider:
            raise
        except Exception:
            # Slot not ready — defer closure to SCHEDULER_IDLE_BEFORE_CLOSE
            raise DontCloseSpider

        # Check if the Redis queue is empty.
        redis_queue_empty = not self.server.exists(self.redis_key)

        if redis_queue_empty and not has_pending:
            logger.debug(f"🕷️ Spider is idle and queue is empty. Forcing close for {self.job_id}")
            self.crawler.engine.close_spider(self, reason='finished')
    
    def emit_link_found(self, url: str, source: str = 'crawl') -> None:
        """
        Emit a link_found event for live progress tracking.
        Only emits once per unique URL.
        """
        if not self.job_id:
            return
        
        normalized = self.normalize_url(url)
        if normalized in self.emitted_urls:
            return
        
        self.emitted_urls.add(normalized)
        total = self._effective_max_pages
        publisher.emit_event(self.job_id, 'link_found', {
            'url': url,
            'source': source,
            'count': len(self.emitted_urls),
            'total': total if total > 0 else None,
        })

    def normalize_url(self, url: str) -> str:
        # 1. Remove fragment
        url = url.split('#')[0]
        
        parsed = urlparse(url)
        scheme = parsed.scheme.lower()
        netloc = parsed.netloc.lower()
        path = parsed.path or '/'

        lower_path = path.lower()
        if lower_path.endswith('/index.html'):
            base_path = path[: -len('/index.html')]
            path = base_path or '/'
        elif lower_path.endswith('/index.htm'):
            base_path = path[: -len('/index.htm')]
            path = base_path or '/'

        path = path.rstrip('/') or '/'
        path = path.lower()

        if self.base_scheme == 'https':
            scheme = 'https'

        if not path.startswith('/'):
            path = '/' + path
            
        # 2. Query Parameter Normalization (Sort & Filter)
        query = parsed.query
        sorted_query = ''
        if query:
            # Parse query parameters
            params = parse_qs(query, keep_blank_values=True)
            
            # Filter out tracking parameters (Infinite URL Protection)
            blocked_params = {'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'mc_cid', 'mc_eid'}
            filtered_params = {k: v for k, v in params.items() if k.lower() not in blocked_params}
            
            # Sort parameters by key for consistent ordering (Duplicate Prevention)
            if filtered_params:
                sorted_keys = sorted(filtered_params.keys())
                # Reconstruct query string with sorted keys
                sorted_query = urlencode([(k, filtered_params[k]) for k in sorted_keys], doseq=True)

        return urlunparse((scheme, netloc, path, '', sorted_query, ''))

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
        # If no start_url is provided, assume we are running in distributed mode
        # and pulling URLs from Redis.
        if not self.start_url and not self.start_urls:
            logger.debug(f"Starting in distributed mode. Waiting for jobs on {self.redis_key}")
            # Yield from Redis if available
            yield from super().start_requests()
            return

        self.crawl_started_at = datetime.now().isoformat()
        self.crawl_started_timestamp = datetime.now().timestamp()
        
        if self.job_id and not self.suppress_completion_events:
            publisher.emit_event(self.job_id, 'JOB_STARTED', {
                'status': 'running',
                'startedAt': self.crawl_started_at,
                'url': self.start_url,
                'message': f'Starting crawl job for {self.start_url}'
            })

        if not self.allow_discovery:
            logger.debug(f"Starting fixed URL crawl for {self.start_url}")
            for url in self.start_urls:
                yield scrapy.Request(
                    url=url,
                    callback=self.parse,
                    priority=100,
                    meta={'depth': 0},
                    errback=self.handle_error,
                )
            return
        
        logger.debug(f"Starting optimized SEO crawl for {self.start_url}")
        
        root_normalized = self.normalize_url(self.start_url)
        self.seen_urls.add(root_normalized)
        
        # Emit link_found for start URL
        self.emit_link_found(self.start_url, source='start')
        
        yield scrapy.Request(
            url=self.start_url,
            callback=self.parse,
            priority=100,
            meta={'depth': 0},
            errback=self.handle_error,
            dont_filter=True  # Force crawl even if previously seen in Redis
        )
        
        parsed = urlparse(self.start_url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        robots_url = f"{base_url}/robots.txt"
        
        yield scrapy.Request(
            url=robots_url,
            callback=self.parse_robots,
            priority=90,
            errback=self.handle_sitemap_error,
            meta={'dont_cache': True},
            dont_filter=True  # Always check robots.txt fresh
        )
        
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
                meta={'dont_cache': True},
                dont_filter=True
            )

    def parse_robots(self, response):
        """Parse robots.txt for sitemap directives"""
        if 'job_id' in response.meta:
            self.job_id = response.meta['job_id']
        if 'session_id' in response.meta:
            self.session_id = response.meta['session_id']
        if 'project_id' in response.meta:
            self.project_id = response.meta['project_id']

        try:
            # Emit log for robots.txt check
            if self.job_id:
                publisher.emit_event(self.job_id, 'log', {
                    'message': f'Checking robots.txt at {response.url}',
                    'type': 'preflight'
                })
            
            for line in response.text.splitlines():
                if line.strip().lower().startswith('sitemap:'):
                    sitemap_url = line.split(':', 1)[1].strip()
                    
                    # Emit log for sitemap discovery
                    if self.job_id:
                        publisher.emit_event(self.job_id, 'log', {
                            'message': f'Found sitemap: {sitemap_url}',
                            'type': 'preflight'
                        })
                    
                    yield scrapy.Request(
                        url=sitemap_url,
                        callback=self.parse_sitemap,
                        priority=90,
                        errback=self.handle_sitemap_error,
                        meta={'dont_cache': True, 'job_id': self.job_id},
                        dont_filter=True
                    )
        except Exception as e:
            logger.warning(f"Error parsing robots.txt: {e}")

    def parse_sitemap(self, response):
        """Parse sitemap XML (handles regular sitemaps and indexes)"""
        
        if 'job_id' in response.meta:
            self.job_id = response.meta['job_id']
        if 'session_id' in response.meta:
            self.session_id = response.meta['session_id']
        if 'project_id' in response.meta:
            self.project_id = response.meta['project_id']
        if 'allow_discovery' in response.meta:
            self.allow_discovery = response.meta['allow_discovery']
            
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

            if 'sitemapindex' in root.tag.lower():
                namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
                for sitemap in root.findall('.//ns:sitemap', namespace):
                    loc = sitemap.find('ns:loc', namespace)
                    if loc is not None and loc.text:
                        if self.allow_discovery:
                            yield scrapy.Request(
                                url=loc.text,
                                callback=self.parse_sitemap,
                                priority=85,
                                errback=self.handle_sitemap_error,
                                meta={'dont_cache': True, 'job_id': self.job_id},
                                dont_filter=True
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
                        if self.job_id:
                            item['job_id'] = self.job_id
                        
                        # Extract other metadata
                        lastmod = url_elem.find('ns:lastmod', namespace)
                        if lastmod is not None: item['last_modified'] = lastmod.text
                        
                        changefreq = url_elem.find('ns:changefreq', namespace)
                        if changefreq is not None: item['change_frequency'] = changefreq.text
                        
                        priority = url_elem.find('ns:priority', namespace)
                        if priority is not None: item['priority'] = priority.text
                        
                        yield item
                        
                        if self.allow_discovery:
                            normalized = self.normalize_url(url)
                            if normalized in self.seen_urls:
                                continue
                            self.seen_urls.add(normalized)
                            
                            # Emit link_found for sitemap URL
                            self.emit_link_found(url, source='sitemap')
                            
                            yield scrapy.Request(
                                url=url,
                                callback=self.parse,
                                priority=50,
                                meta={
                                    'from_sitemap': True,
                                    'job_id': self.job_id,
                                    'session_id': self.session_id,
                                    'project_id': self.project_id
                                }
                            )
                
                self.links_collected += urls_found
                
                # Emit scope update for 7.2 Pre-Crawl Discovery
                if self.job_id:
                    publisher.emit_event(self.job_id, 'scope_updated', {
                        'total_discovered': self.links_collected,
                        'source': 'sitemap',
                        'newly_found': urls_found
                    })

        except Exception as e:
            logger.error(f"Error parsing sitemap {response.url}: {e}")

    def handle_sitemap_error(self, failure):
        """Handle sitemap request failures"""
        logger.error(f"Sitemap request failed: {failure.request.url} - {failure.value}")
    
    def make_request_from_data(self, data):
        """
        Overridden to support JSON payloads from Redis.
        Expected format: {"url": "...", "meta": {...}}
        """
        import json
        from scrapy_redis.utils import bytes_to_str

        try:
            # Try parsing as JSON
            if isinstance(data, bytes):
                data_str = data.decode('utf-8')
            else:
                data_str = data
            
            job_data = json.loads(data_str)
            url = job_data.get('url')
            meta = job_data.get('meta', {})
            
            if not url:
                logger.error(f"Received JSON from Redis without URL: {data}")
                return None

            # Create request with metadata
            return scrapy.Request(
                url=url,
                meta=meta,
                callback=self.parse,
                dont_filter=True  # Allow start URLs to be processed even if visited before (in a new job)
            )
        except (json.JSONDecodeError, TypeError):
            # Fallback to default string handling (legacy support)
            url = bytes_to_str(data, self.redis_encoding)
            return scrapy.Request(url, callback=self.parse, dont_filter=True)

    def parse(self, response: Response):
        """Main parsing logic for each page"""
        
        if response.url.endswith('.xml') or 'sitemap' in response.url:
            for item in self.parse_sitemap(response):
                yield item
            return
        
        # Update instance state from meta for distributed context (Crucial for multi-job workers)
        if 'job_id' in response.meta:
            self.job_id = response.meta['job_id']
        if 'session_id' in response.meta:
            self.session_id = response.meta['session_id']
        if 'project_id' in response.meta:
            self.project_id = response.meta['project_id']
            
        # Calculate crawl depth
        crawl_depth = response.meta.get('depth', 0)

        # Initialize allowed_host if running in distributed mode without start_url
        if not self.allowed_host:
            parsed = urlparse(response.url)
            self.allowed_host = parsed.netloc
            if self.allow_subdomains and self.allowed_host.startswith('www.'):
                 self.allowed_host = self.allowed_host[4:]
        
        # Handle Redirects for Start URL (Critical for "One Page Crawl" fix)
        # If start_url redirected to a different domain, we must update allowed_host
        if crawl_depth == 0:
            parsed_response = urlparse(response.url)
            response_domain = parsed_response.netloc
            
            # Normalize domains (remove www)
            norm_allowed = self.allowed_host.replace('www.', '') if self.allowed_host else ''
            norm_response = response_domain.replace('www.', '')
            
            if norm_allowed and norm_response != norm_allowed:
                logger.debug(f"🔄 Start URL redirected to new domain: {norm_allowed} -> {norm_response}. Updating allowed_host.")
                self.allowed_host = norm_response
                
                # Update Scrapy's allowed_domains dynamically
                if hasattr(self, 'allowed_domains'):
                    if norm_response not in self.allowed_domains:
                        self.allowed_domains.append(norm_response)
                    if response_domain not in self.allowed_domains:
                        self.allowed_domains.append(response_domain)

        # Emit JOB_STARTED event for the first page
        if crawl_depth == 0 and self.job_id and not self.suppress_completion_events:
             publisher.emit_event(self.job_id, 'JOB_STARTED', {
                'url': response.url,
                'started_at': datetime.now().isoformat(),
                'status': 'running',
                'message': f'Started crawling {response.url}',
                'projectId': self.project_id,
                'sessionId': self.session_id
             })

        # Trigger discovery for the entry point (Distributed Mode support)
        if crawl_depth == 0 and self.allow_discovery:
             parsed = urlparse(response.url)
             base_url = f"{parsed.scheme}://{parsed.netloc}"
             robots_url = f"{base_url}/robots.txt"
             
             yield scrapy.Request(
                 url=robots_url,
                 callback=self.parse_robots,
                 priority=90,
                 errback=self.handle_sitemap_error,
                 meta={'dont_cache': True, 'job_id': self.job_id},
                 dont_filter=True
             )
             
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
                     meta={'dont_cache': True, 'job_id': self.job_id},
                     dont_filter=True
                 )

        # Track start time
        request_id = id(response.request)
        start_time = self.request_start_times.get(request_id, datetime.now().timestamp())
        
        # Validate content type
        content_type = response.headers.get('Content-Type', b'').decode('utf-8').lower()
        if 'text/html' not in content_type and 'application/xhtml+xml' not in content_type:
            logger.warning(f"Skipping non-HTML content: {response.url} ({content_type})")
            return

        # Extract links
        links_data = LinkExtractor.extract(response, self.allowed_host, self.allow_subdomains)

        # Emit link_found for ALL discovered links (for progress tracking)
        if self.job_id:
            for link_data in links_data:
                self.emit_link_found(link_data['target_url'], source='crawl')
            
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
        if self.job_id:
            page_item['job_id'] = self.job_id
        
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
        
        # Canonical URL Prioritization (7.3 Intelligent Request Scheduling)
        canonical = page_item.get('canonical_url')
        if canonical and self.allow_discovery:
            normalized_canonical = self.normalize_url(canonical)
            normalized_current = self.normalize_url(response.url)
            
            if normalized_canonical != normalized_current:
                # If canonical is different and internal, prioritize it
                parsed_canon = urlparse(normalized_canonical)
                if parsed_canon.netloc == self.allowed_host or (self.allow_subdomains and parsed_canon.netloc.endswith(self.allowed_host)):
                    if normalized_canonical not in self.seen_urls:
                        self.seen_urls.add(normalized_canonical)
                        self.emit_link_found(normalized_canonical, source='canonical')
                        yield scrapy.Request(
                            url=normalized_canonical,
                            callback=self.parse,
                            priority=200, # Higher priority than normal links
                            meta={
                                'depth': crawl_depth, # Preserve depth
                                'job_id': self.job_id,
                                'session_id': self.session_id,
                                'project_id': self.project_id
                            }
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
        keyword_analysis = extract_keywords_from_html(
            html=response.text,
            url=response.url,
            final_url=response.url,
            lang_guess=page_item.get('language') or ''
        )

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
            'Redirects_audit': redirect_audit_report,
            'Keyword_analysis': keyword_analysis
        }
        
        
        yield page_item
        self.pages_crawled += 1

        # Single visible crawl-progress log — all other spider logs are debug.
        _total = self._effective_max_pages
        _total_str = str(_total) if _total > 0 else '?'
        logger.info(f"[CRAWL] 🔗 {self.pages_crawled} / {_total_str} urls crawled")

        # Emit page_crawled event for progress tracking
        if self.job_id:
            publisher.emit_event(self.job_id, 'page_crawled', {
                'url': response.url,
                'title': response.css('title::text').get() or '',
                'crawled_at': datetime.now().isoformat(),
                'status': response.status
            })
        
        # Check if we should stop crawling
        if self.max_pages > 0 and self.pages_crawled >= self.max_pages:
            logger.debug(f"Reached max pages limit: {self.max_pages}")
            self.should_stop = True
            # Explicitly close the spider
            self.crawler.engine.close_spider(self, reason='closespider_pagecount')
            return
        
        if self.timeout > 0:
            elapsed = datetime.now().timestamp() - self.crawl_started_timestamp
            if elapsed >= self.timeout:
                logger.debug(f"Reached timeout limit: {self.timeout} seconds")
                self.should_stop = True
                # Explicitly close the spider
                self.crawler.engine.close_spider(self, reason='closespider_timeout')
                return
        
        # Extract links
        # Optimization: We already extracted links_data above for metrics
        # links = LinkExtractor.extract(response, self.allowed_host, self.allow_subdomains)
        for link_data in links_data:
            link_item = LinkItem()
            link_item.update(link_data)
            if self.job_id:
                link_item['job_id'] = self.job_id
            yield link_item
            self.links_collected += 1
        
        # Follow internal links
        if not self.should_stop:
            internal_candidates = [l for l in links_data if l['is_internal'] and not l['nofollow']]

            for link_data in links_data:
                if link_data['is_internal'] and not link_data['nofollow']:
                    target_url = link_data['target_url']

                    if any(p in target_url for p in ['/cart', '/checkout', '/account']):
                        self.skipped_count += 1
                        continue

                    is_pag, page_num, _ = self.is_pagination_url(target_url)
                    if is_pag:
                        if page_num > self.MAX_PAGINATION_DEPTH:
                            self.skipped_count += 1
                            continue
                        if not self.should_follow_pagination(target_url):
                            self.skipped_count += 1
                            continue

                    normalized_target = self.normalize_url(target_url)
                    if normalized_target in self.seen_urls:
                        self.skipped_count += 1
                        continue
                    self.seen_urls.add(normalized_target)

                    priority = self.get_url_priority(target_url)

                    if not self.should_stop:
                        yield scrapy.Request(
                            url=target_url,
                            callback=self.parse,
                            meta={
                                'depth': crawl_depth + 1,
                                'job_id': self.job_id,
                                'session_id': self.session_id,
                                'project_id': self.project_id
                            },
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

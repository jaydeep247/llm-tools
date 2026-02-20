"""
Website Spider
Main Scrapy spider for crawling websites with sitemap discovery
"""

import scrapy
from scrapy.http import Response, HtmlResponse
from typing import Dict, Any, Optional, List
from datetime import datetime
from urllib.parse import urlparse, urlunparse
import asyncio
import re
import xml.etree.ElementTree as ET
import gzip
from io import BytesIO

import redis
from scrapy import signals

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
    
    custom_settings = {}
    
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
        allow_discovery: bool = True,
        start_urls: Optional[List[str]] = None,
        planned_total: Optional[int] = None,
        *args,
        **kwargs
    ):
        super().__init__(*args, **kwargs)
        
        self.start_url = start_url
        self.session_id = session_id
        self.job_id = job_id
        self.project_id = project_id
        
        self.allow_subdomains = allow_subdomains
        self.max_concurrency = min(max_concurrency, 4)
        self.max_pages = max_pages
        self.timeout = timeout
        self.allow_discovery = allow_discovery
        self.planned_total = planned_total
        
        parsed = urlparse(start_url)
        self.allowed_host = parsed.netloc
        self.base_scheme = parsed.scheme
        
        self.force_trailing_slash = start_url.endswith('/')
        
        self.sitemap_data = {
            'sitemap_urls': [],
            'discovered_urls': [],
        }
        self.pages_seen = 0

        self.request_start_times = {}
        self.pagination_failures = {} # Track failed patterns
        
        # Crawl metadata
        self.crawl_started_at = None
        self.crawl_started_timestamp = None
        self.pages_crawled = 0
        self.links_collected = 0
        self.should_stop = False
        self.seen_urls = set()

        if start_urls is not None:
            self.start_urls = start_urls
        else:
            self.start_urls = [start_url]
        
        # Constants
        self.MAX_PAGINATION_DEPTH = 5  # Strict limit: max 5 pages deep
        self.MAX_PAGINATION_FAILURES = 1 # Strict limit: stop on FIRST failure

    @classmethod
    def from_crawler(cls, crawler, *args, **kwargs):
        spider = super(WebsiteSpider, cls).from_crawler(crawler, *args, **kwargs)
        crawler.signals.connect(spider.spider_closed, signal=signals.spider_closed)
        return spider

    def spider_closed(self, spider, reason):
        if self.job_id:
            status = 'completed' if reason == 'finished' else 'failed'
            publisher.emit_event(self.job_id, 'JOB_COMPLETED' if status == 'completed' else 'JOB_FAILED', {
                'status': status,
                'reason': reason,
                'pagesCrawled': self.pages_crawled,
                'completedAt': datetime.now().isoformat()
            })
            logger.info(f"Emitted job completion event for {self.job_id} (status={status})")

    def normalize_url(self, url: str) -> str:
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

        return urlunparse((scheme, netloc, path, '', '', ''))

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
        
        if self.job_id:
            publisher.emit_event(self.job_id, 'JOB_STARTED', {
                'status': 'running',
                'startedAt': self.crawl_started_at,
                'url': self.start_url
            })
            logger.info(f"Emitted job start event for {self.job_id}")

        if not self.allow_discovery:
            logger.info(f"Starting fixed URL crawl for {self.start_url}")
            for url in self.start_urls:
                yield scrapy.Request(
                    url=url,
                    callback=self.parse,
                    priority=100,
                    meta={'depth': 0},
                    errback=self.handle_error,
                )
            return
        
        logger.info(f"Starting optimized SEO crawl for {self.start_url}")
        
        root_normalized = self.normalize_url(self.start_url)
        self.seen_urls.add(root_normalized)
        
        yield scrapy.Request(
            url=self.start_url,
            callback=self.parse,
            priority=100,
            meta={'depth': 0},
            errback=self.handle_error,
        )
        
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
                        
                        if self.allow_discovery:
                            normalized = self.normalize_url(url)
                            if normalized in self.seen_urls:
                                continue
                            self.seen_urls.add(normalized)
                            
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
        normalized_response_url = self.normalize_url(response.url)
        if normalized_response_url in self.seen_urls:
            return
        self.seen_urls.add(normalized_response_url)

        self.pages_seen += 1

        if self.job_id and self.pages_seen % 50 == 0:
            try:
                r = redis.from_url(config.REDIS_URL)
                r.hset(f"job:{self.job_id}", "pagesCrawled", self.pages_seen)
            except Exception:
                pass

        try:
            request_id = id(response.request)
            start_time = self.request_start_times.get(request_id, datetime.now().timestamp())

            crawl_depth = response.meta.get('depth', 0)

            content_type = response.headers.get('Content-Type', b'').decode('utf-8').lower()
            if 'text/html' not in content_type and 'application/xhtml+xml' not in content_type:
                return

            parsed_url = urlparse(response.url)
            folder_depth = len([p for p in parsed_url.path.split('/') if p])

            if not isinstance(response, HtmlResponse):
                return

            if crawl_depth == 0:
                try:
                    from utils.storage import save_raw_html_sync
                    save_raw_html_sync(self.job_id, response.text)
                except Exception:
                    pass

            basic_fields = BasicExtractor.extract(response, start_time)
            seo_fields = SeoExtractor.extract(response)
            content_fields = ContentExtractor.extract(response)
            heading_fields = HeadingExtractor.extract(response)
            advanced_fields = AdvancedExtractor.extract(response)

            page_item = PageItem()
            page_item.update(basic_fields)
            page_item.update(seo_fields)
            page_item.update(content_fields)
            page_item.update(heading_fields)
            page_item.update(advanced_fields)
            page_item['crawl_depth'] = crawl_depth
            page_item['folder_depth'] = folder_depth

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
                word_count,
            )

            links_data = LinkExtractor.extract(response, self.allowed_host, self.allow_subdomains)
            outlink_stats = link_analysis.analyze_outlinks(links_data)
            simhash_legacy = similarity.generate_simhash(visible_text_legacy)

            tq_results = text_quality_analyzer.analyze(
                html_content=response.text,
                url=response.url,
                title=page_item.get('title', ''),
                word_count=page_item.get('word_count', 0),
                sentence_count=page_item.get('sentence_count', 0),
                paragraph_count=page_item.get('paragraph_count', 0),
                heading_count=len(page_item.get('h1s', [])) + len(page_item.get('h2s', [])),
                target_keyword=None,
            )

            wordcount_analysis = wordcount_extractor.extract_wordcount_analysis(
                html_content=response.text,
                url=response.url,
                target_keyword=None,
            )

            broken_links_report = broken_link_checker.analyze_broken_links(links_data)

            redirect_urls = response.request.meta.get('redirect_urls', [])
            redirect_reasons = response.request.meta.get('redirect_reasons', [])
            hops = []
            for i, url in enumerate(redirect_urls):
                hops.append(
                    {
                        'url': url,
                        'status_code': redirect_reasons[i] if i < len(redirect_reasons) else 302,
                        'headers': {},
                    }
                )
            hops.append(
                {
                    'url': response.url,
                    'status_code': response.status,
                    'headers': {k.decode('utf-8'): v[0].decode('utf-8') for k, v in response.headers.items()},
                }
            )
            redirect_audit_report = redirect_audit.analyze_redirects(hops, page_item.get('canonical_url'))

            page_item['fields'] = {
                'status': 'OK' if response.status == 200 else str(response.status),
                'website_crawler': {
                    'title_pixel_width': title_pixel_width,
                    'meta_description_pixel_width': meta_desc_pixel_width,
                    'transferred_bytes': total_bytes,
                    'total_transferred_bytes': total_bytes,
                    'co2_mg': carbon_data['co2_mg'],
                    'carbon_rating': carbon_data['rating'],
                    'average_words_per_sentence': quality_data['average_words_per_sentence'],
                    'flesch_reading_ease_score': quality_data['flesch_reading_ease_score'],
                    'readability': quality_data['readability'],
                    'outlinks': outlink_stats['outlinks'],
                    'unique_outlinks': outlink_stats['unique_outlinks'],
                    'unique_js_outlinks': outlink_stats['unique_js_outlinks'],
                    'external_outlinks': outlink_stats['external_outlinks'],
                    'unique_external_outlinks': outlink_stats['unique_external_outlinks'],
                    'unique_external_js_outlinks': outlink_stats['unique_external_js_outlinks'],
                    'closest_near_duplicate_match': None,
                    'no_near_duplicates': 0,
                    'simhash': simhash_legacy,
                    'spelling_errors': quality_data['spelling_errors'],
                    'grammar_errors': quality_data['grammar_errors'],
                    'hash': page_item.get('content_hash', ''),
                    'url_encoded_address': response.url,
                },
                'page_matrix': extract_page_metrics(
                    url=response.url,
                    html_content=response.text,
                    response_status=response.status,
                    response_headers={k.decode('utf-8'): v[0].decode('utf-8') for k, v in response.headers.items()},
                    response_time_ms=(datetime.now().timestamp() - start_time) * 1000,
                    final_url=response.url,
                ),
                'Text Quality Analyzer': tq_results,
                'Wordcount_analysis': wordcount_analysis,
                'Broken_links_checker': broken_links_report,
                'Redirects_audit': redirect_audit_report,
            }

            yield page_item
            self.pages_crawled += 1

            if self.planned_total:
                remaining = max(self.planned_total - self.pages_crawled, 0)
                logger.info(
                    f"Crawl progress for {self.start_url}: "
                    f"{self.pages_crawled}/{self.planned_total} pages done, "
                    f"{remaining} remaining (current={response.url})"
                )
            
            if self.job_id:
                publisher.emit_event(self.job_id, 'log', {
                    'message': f"Crawled {response.url} ({response.status})",
                    'level': 'info',
                    'pagesCrawled': self.pages_crawled
                })
                publisher.emit_event(self.job_id, 'link_found', {
                    'url': response.url
                })

            if self.max_pages > 0 and self.pages_crawled >= self.max_pages:
                self.should_stop = True
                return

            if self.timeout > 0:
                elapsed = datetime.now().timestamp() - self.crawl_started_timestamp
                if elapsed >= self.timeout:
                    self.should_stop = True
                    return

            for link_data in links_data:
                link_item = LinkItem()
                link_item.update(link_data)
                yield link_item
                self.links_collected += 1

            if self.allow_discovery and not self.should_stop:
                for link_data in links_data:
                    if not link_data['is_internal'] or link_data['nofollow']:
                        continue

                    target_url = link_data['target_url']

                    if any(p in target_url for p in ['/cart', '/checkout', '/account']):
                        continue

                    is_pag, page_num, _ = self.is_pagination_url(target_url)
                    if is_pag:
                        if page_num > self.MAX_PAGINATION_DEPTH:
                            continue
                        if not self.should_follow_pagination(target_url):
                            continue

                    normalized_target = self.normalize_url(target_url)
                    if normalized_target in self.seen_urls:
                        continue
                    self.seen_urls.add(normalized_target)

                    priority = self.get_url_priority(target_url)

                    if not self.should_stop:
                        yield scrapy.Request(
                            url=target_url,
                            callback=self.parse,
                            meta={'depth': crawl_depth + 1},
                            priority=priority,
                            errback=self.handle_error,
                        )
        except Exception:
            return
    
    
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
        logger.info(
            f"Crawl finished for {self.start_url} - reason: {reason}. "
            f"Pages crawled: {self.pages_crawled}, links discovered: {self.links_collected}"
        )

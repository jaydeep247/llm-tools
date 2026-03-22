import re
import requests
from urllib.parse import urlparse, urlunparse
from bs4 import BeautifulSoup
from typing import Dict, Any, Tuple


class PageMetricsAgent:
    """
    Content audit data extraction agent for Page Metrics.
    Populates specific page metrics while respecting existing data and using progressive fallbacks.
    """
    
    def __init__(self, 
                 url: str, 
                 existing_data: Dict[str, Any] = None, 
                 html_content: str = "", 
                 status_code: int = 200, 
                 headers: Dict[str, str] = None,
                 crawl_graph: Dict[str, Any] = None,
                 main_keyword: str = "",
                 dfs_credentials: Tuple[str, str] = None):
        """
        Initialize the extractor agent.
        
        :param url: The raw URL of the page.
        :param existing_data: A dictionary of already scraped/extracted data for this URL.
        :param html_content: Raw HTML string of the page.
        :param status_code: HTTP response status code.
        :param headers: Dictionary of HTTP response headers.
        :param crawl_graph: Data regarding site architecture (inlink_count, outlink_count, etc.).
        :param main_keyword: The target keyword for Intent extraction.
        :param dfs_credentials: Tuple of (username, password) for DataForSEO API.
        """
        self.raw_url = url
        self.existing_data = existing_data or {}
        self.soup = BeautifulSoup(html_content, 'lxml') if html_content else None
        self.status_code = status_code
        self.headers = {k.lower(): str(v) for k, v in (headers or {}).items()}
        self.crawl_graph = crawl_graph or {}
        self.main_keyword = main_keyword
        self.dfs_credentials = dfs_credentials
        
        self.audit_log = {}
        self.metrics = {}
        
        self.parsed_url = urlparse(self.raw_url)
        self.base_url = f"{self.parsed_url.scheme}://{self.parsed_url.netloc}"
        self.path_segments = [p for p in self.parsed_url.path.split('/') if p]
        self.slug = self.path_segments[-1] if self.path_segments else ""
        self.folder_depth = len(self.path_segments)
        
        self._wp_post_data = None
        self._wp_fetched = False

    def _is_valid(self, val: Any) -> bool:
        if val is None:
            return False
        if isinstance(val, str):
            val_stripped = val.strip()
            if val_stripped == "" or val_stripped.upper() == "N/A":
                return False
        if val == 0:  # 0 is not valid for our general fields 
            return False
        return True

    def _check_existing(self, field: str) -> bool:
        """Check if a valid value already exists in the provided data dict."""
        val = self.existing_data.get(field)
        
        # Explicitly handle status_code 0 which is often used for timeouts/DNS errors in scrapers,
        # but 0 is an invalid HTTP status code, so we allow it to pass validation if strictly needed.
        if field == 'status_code' and val != 0 and val is not None:
             self.metrics[field] = val
             self.audit_log[field] = "[FOUND]"
             return True
        elif field != 'status_code' and self._is_valid(val):
            self.metrics[field] = val
            self.audit_log[field] = "[FOUND]"
            return True
            
        return False

    def _fetch_wp_data(self):
        """Fetch WordPress REST API data for the current URL slug."""
        if self._wp_fetched:
            return
        self._wp_fetched = True
        if not self.slug:
            return
            
        api_url = f"{self.base_url}/wp-json/wp/v2/posts?slug={self.slug}&_fields=categories,type"
        try:
            resp = requests.get(api_url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                if data and isinstance(data, list) and len(data) > 0:
                    self._wp_post_data = data[0]
        except Exception:
            pass

    def extract_url(self):
        if self._check_existing('url'): return
        self.audit_log['url'] = "[EXTRACTING]"
        
        scheme = self.parsed_url.scheme.lower()
        netloc = self.parsed_url.netloc.lower()
        path = self.parsed_url.path
        if path != '/' and path.endswith('/'):
            path = path.rstrip('/')
            
        norm_url = urlunparse((scheme, netloc, path, self.parsed_url.params, self.parsed_url.query, self.parsed_url.fragment))
        self.metrics['url'] = norm_url

    def extract_page_category(self):
        if self._check_existing('page_category'): return
        self.audit_log['page_category'] = "[EXTRACTING]"
        
        # 1. Source: WordPress REST API
        self._fetch_wp_data()
        if self._wp_post_data and self._wp_post_data.get('categories'):
            try:
                cat_id = self._wp_post_data['categories'][0]
                cat_resp = requests.get(f"{self.base_url}/wp-json/wp/v2/categories/{cat_id}", timeout=5)
                if cat_resp.status_code == 200:
                    self.metrics['page_category'] = cat_resp.json().get('name')
                    return
            except Exception:
                pass
                
        self.audit_log['page_category'] = "[FAILED+FALLBACK]"
        
        # 2. Fallback: Breadcrumbs
        if self.soup:
            breadcrumbs = self.soup.select('nav.breadcrumb a')
            if breadcrumbs:
                texts = [b.get_text(strip=True) for b in breadcrumbs]
                if len(texts) > 1:
                    self.metrics['page_category'] = texts[-2]
                    return
                    
        # 3. Fallback 2: URL Path segments
        if len(self.path_segments) > 0:
            first_seg = self.path_segments[0].lower()
            if first_seg == 'blog':
                self.metrics['page_category'] = "Blog"
            elif first_seg == 'services':
                self.metrics['page_category'] = "Service Page"
            else:
                self.metrics['page_category'] = self.path_segments[0].capitalize()
            return
            
        self.metrics['page_category'] = "Home" if len(self.path_segments) == 0 else "Uncategorized"

    def extract_post_category_type(self):
        if self._check_existing('post_category_type'): return
        self.audit_log['post_category_type'] = "[EXTRACTING]"
        
        # 1. Source: WordPress API
        self._fetch_wp_data()
        if self._wp_post_data and self._wp_post_data.get('categories'):
            try:
                cat_id = self._wp_post_data['categories'][0]
                cat_resp = requests.get(f"{self.base_url}/wp-json/wp/v2/categories/{cat_id}", timeout=5)
                if cat_resp.status_code == 200:
                    self.metrics['post_category_type'] = cat_resp.json().get('name')
                    return
            except Exception:
                pass
                
        self.audit_log['post_category_type'] = "[FAILED+FALLBACK]"
        
        # 2. H1 Pattern Match
        if self.soup:
            h1 = self.soup.find('h1')
            if h1:
                h1_text = h1.get_text(strip=True).lower()
                if re.search(r'\b(best|top)\b', h1_text):
                    self.metrics['post_category_type'] = "Listicle"
                    return
                elif re.search(r'\b(vs|comparison)\b', h1_text):
                    self.metrics['post_category_type'] = "Comparison"
                    return
                elif re.search(r'\breview\b', h1_text):
                    self.metrics['post_category_type'] = "Review"
                    return
                elif re.search(r'\b(guide|how to)\b', h1_text):
                    self.metrics['post_category_type'] = "Guide"
                    return
                elif re.search(r'\bwhat is\b', h1_text):
                    self.metrics['post_category_type'] = "Definition"
                    return
                elif re.search(r'\btool\b', h1_text):
                    self.metrics['post_category_type'] = "Tool Page"
                    return

        # Default fallback value
        self.metrics['post_category_type'] = "Landing Page"

    def extract_page_type(self):
        if self._check_existing('page_type'): return
        self.audit_log['page_type'] = "[EXTRACTING]"
        
        from .page_type_classifier import classify_page_types
        
        # Format current page data for the classifier
        item_data = {
            'url': self.metrics.get('url', self.raw_url),
            'inlink_count': self.crawl_graph.get('inlink_count', 0),
            'outlink_count': self.crawl_graph.get('outlink_count', 0),
            'internal_outlinks': self.crawl_graph.get('internal_outlinks', self.crawl_graph.get('outlink_count', 0)),
            'incoming_links': self.crawl_graph.get('incoming_links', []),
            'pointed_by_hub': self.crawl_graph.get('pointed_by_hub', False),
            'pointed_only_by_spoke': self.crawl_graph.get('pointed_only_by_spoke', False)
        }
        
        # The classifier expects a list of items and mutates them in place
        result = classify_page_types([item_data])
        
        if result and result.get('items') and len(result['items']) > 0:
            classified_item = result['items'][0]
            if classified_item.get('page_type'):
                self.metrics['page_type'] = classified_item['page_type']
                return
                
        self.audit_log['page_type'] = "[FAILED+FALLBACK]"
        
        # 2. Fallback: URL depth (if classifier fails)
        if self.folder_depth <= 2:
            self.metrics['page_type'] = "Hub candidate"
        elif self.folder_depth == 3:
            self.metrics['page_type'] = "Spoke"
        else:
            self.metrics['page_type'] = "Sub-Spoke"

    def extract_post_type(self):
        if self._check_existing('post_type'): return
        self.audit_log['post_type'] = "[EXTRACTING]"
        
        # 1. Source: WordPress API
        self._fetch_wp_data()
        if self._wp_post_data and self._wp_post_data.get('type'):
            self.metrics['post_type'] = self._wp_post_data['type'].title()
            return
            
        self.audit_log['post_type'] = "[FAILED+FALLBACK]"
        
        # 2. Fallback: Classify from URL pattern
        if len(self.path_segments) > 0:
            first_seg = self.path_segments[0].lower()
            if first_seg == 'blog':
                self.metrics['post_type'] = "Blog"
            elif first_seg in ['tools', 'tool']:
                self.metrics['post_type'] = "Tool Page"
            elif first_seg == 'services':
                self.metrics['post_type'] = "Service Page"
            elif first_seg == 'resources':
                self.metrics['post_type'] = "Resource"
            elif first_seg == 'category':
                self.metrics['post_type'] = "Category Page"
            else:
                self.metrics['post_type'] = "Landing Page"
            return
            
        self.metrics['post_type'] = None

    def extract_intent(self):
        if self._check_existing('intent'): return
        self.audit_log['intent'] = "[EXTRACTING]"
        
        # 1. Source: DataForSEO API
        if self.main_keyword and self.dfs_credentials:
            try:
                auth_user, auth_pass = self.dfs_credentials
                response = requests.post(
                    "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
                    auth=(auth_user, auth_pass),
                    json=[{"keyword": self.main_keyword, "location_code": 2840, "language_code": "en"}],
                    timeout=10
                )
                if response.status_code == 200:
                    res_data = response.json()
                    intent_val = res_data['tasks'][0]['result'][0]['search_intent_info']['main_intent']
                    
                    intent_map = {
                        "commercial": "C",
                        "informational": "I",
                        "navigational": "N",
                        "transactional": "T"
                    }
                    self.metrics['intent'] = intent_map.get(intent_val.lower(), intent_val)
                    return
            except Exception:
                pass
                
        self.audit_log['intent'] = "[FAILED+FALLBACK]"
        
        # 2. Fallback: Keyword/URL pattern
        kw = self.main_keyword.lower() if self.main_keyword else self.slug.replace('-', ' ').lower()
        if re.search(r'\b(best|top|vs)\b', kw):
            self.metrics['intent'] = "C"
        elif re.search(r'\b(how to|what is|guide)\b', kw):
            self.metrics['intent'] = "I"
        elif re.search(r'\b(buy|price|discount)\b', kw):
            self.metrics['intent'] = "T"
        else:
            self.metrics['intent'] = "I"

    def extract_status_code(self):
        if self._check_existing('status_code'): return
        self.audit_log['status_code'] = "[EXTRACTING]"
        self.metrics['status_code'] = self.status_code

    def extract_canonical_url(self):
        if self._check_existing('canonical_url') and self._check_existing('is_self_canonical'): 
            return
            
        self.audit_log['canonical_url'] = "[EXTRACTING]"
        canonical = None
        if self.soup:
            canon_link = self.soup.find('link', rel='canonical')
            if canon_link:
                canonical = canon_link.get('href')
                
        if not canonical:
            # Fallback to HTTP header Link: <url>; rel="canonical"
            link_header = self.headers.get('link', '')
            match = re.search(r'<([^>]+)>;\s*rel="canonical"', link_header, re.I)
            if match:
                canonical = match.group(1)

        self.metrics['canonical_url'] = canonical
        
        # Calculate is_self_canonical based on extracted/normalized URL
        current_url = self.metrics.get('url', self.raw_url)
        if 'is_self_canonical' not in self.metrics:
            if canonical and current_url:
                from urllib.parse import urljoin
                absolute_canonical = urljoin(current_url, canonical)
                self.metrics['canonical_url'] = absolute_canonical
                # Compare without trailing slash to be safe
                self.metrics['is_self_canonical'] = absolute_canonical.rstrip('/') == current_url.rstrip('/')
            else:
                self.metrics['is_self_canonical'] = False

    def extract_indexability(self):
        if self._check_existing('indexability'): return
        self.audit_log['indexability'] = "[EXTRACTING]"
        
        # a) Status Code
        if self.status_code != 200:
            self.metrics['indexability'] = "Non-Indexable"
            return
            
        # b) Meta Robots
        if self.soup:
            robots_meta = self.soup.find('meta', attrs={'name': re.compile(r'^robots$', re.I)})
            if robots_meta and 'noindex' in robots_meta.get('content', '').lower():
                self.metrics['indexability'] = "Non-Indexable"
                return
                
        # c) X-Robots-Tag
        x_robots = self.headers.get('x-robots-tag', '').lower()
        if 'noindex' in x_robots:
            self.metrics['indexability'] = "Non-Indexable"
            return
            
        # d) Canonical Check
        canonical = self.metrics.get('canonical_url')
        is_self_canonical = self.metrics.get('is_self_canonical', True)
        if canonical and not is_self_canonical:
            self.metrics['indexability'] = "Non-Indexable (Canonicalised)"
            return
            
        # e) Passed all
        self.metrics['indexability'] = "Indexable"

    def extract_redirect_target(self):
        if self._check_existing('redirect_target'): return
        self.audit_log['redirect_target'] = "[EXTRACTING]"
        
        redirect_urls = self.existing_data.get('redirect_urls', [])
        
        if self.status_code in [301, 302, 307, 308]:
            loc = self.headers.get('location')
            if loc:
                from urllib.parse import urljoin
                current_url = self.metrics.get('url', self.raw_url)
                self.metrics['redirect_target'] = urljoin(current_url, loc)
            else:
                self.metrics['redirect_target'] = None
        else:
            self.metrics['redirect_target'] = None

    def execute(self) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """
        Runs all extractions in sequence and returns the populated metrics and audit log.
        """
        self.extract_url()
        self.extract_page_category()
        self.extract_post_category_type()
        self.extract_page_type()
        self.extract_post_type()
        self.extract_intent()
        self.extract_status_code()
        
        # Canonical URL must be extracted before Indexability for accurate canonicalisation check
        self.extract_canonical_url() 
        self.extract_indexability()
        
        self.extract_redirect_target()
        
        # Ensure all required keys exist in metrics (use None for missing values per specs)
        required_keys = [
            "url", "page_category", "post_category_type", "page_type", 
            "post_type", "intent", "status_code", "indexability", 
            "canonical_url", "is_self_canonical", "redirect_target"
        ]
        
        for key in required_keys:
            if key not in self.metrics:
                self.metrics[key] = None
                
        return self.metrics, self.audit_log


def extract_advanced_page_metrics(
    url: str, 
    existing_data: Dict[str, Any] = None, 
    **kwargs
) -> Tuple[Dict[str, Any], Dict[str, str]]:
    """
    Convenience wrapper to instantiate the agent and run extraction.
    
    Returns:
        tuple: (metrics_dict, audit_log_dict)
    """
    agent = PageMetricsAgent(url, existing_data, **kwargs)
    return agent.execute()

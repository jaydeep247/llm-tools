"""
Link Extractor
Extracts internal and external links with metadata
"""

from scrapy.http import Response
from typing import Dict, Any, List
from urllib.parse import urlparse


class LinkExtractor:
    """Extracts links from page"""
    
    @staticmethod
    def extract(response: Response, allowed_host: str, allow_subdomains: bool) -> List[Dict[str, Any]]:
        """
        Extract links from page
        
        Args:
            response: Scrapy response object
            allowed_host: Base hostname for internal/external check
            allow_subdomains: Whether to allow subdomains
            
        Returns:
            List of link dictionaries
        """
        links = []
        source_url = response.url
        
        for link in response.css('a[href]'):
            href = link.css('::attr(href)').get()
            if not href or href.startswith('#') or href.startswith('javascript:') or href.startswith('mailto:') or href.startswith('tel:'):
                continue
            
            target_url = response.urljoin(href)
            anchor_text = ' '.join(link.css('::text').getall()).strip()
            rel = link.css('::attr(rel)').get() or ''
            
            # Determine if internal
            is_internal = LinkExtractor._is_internal(target_url, allowed_host, allow_subdomains)
            
            # Check nofollow
            nofollow = 'nofollow' in rel.lower()
            
            links.append({
                'source_url': source_url,
                'target_url': target_url,
                'is_internal': is_internal,
                'anchor_text': anchor_text,
                'nofollow': nofollow,
                'rel': rel,
            })
        
        return links
    
    @staticmethod
    def _is_internal(url: str, allowed_host: str, allow_subdomains: bool) -> bool:
        """Check if URL is internal"""
        parsed = urlparse(url)
        url_host = parsed.netloc
        
        # Normalize hosts by removing www prefix for comparison
        def normalize_host(h):
            return h.replace('www.', '', 1) if h.startswith('www.') else h
        
        normalized_url_host = normalize_host(url_host)
        normalized_allowed_host = normalize_host(allowed_host)
        
        if allow_subdomains:
            # Allow exact match or subdomain (with normalization)
            return (normalized_url_host == normalized_allowed_host or 
                    normalized_url_host.endswith(f'.{normalized_allowed_host}'))
        else:
            # Exact match (with normalization)
            return normalized_url_host == normalized_allowed_host

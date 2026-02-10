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
            if not href or href.startswith('#') or href.startswith('javascript:') or href.startswith('mailto:'):
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
        
        if allow_subdomains:
            return url_host.endswith(allowed_host) or url_host == allowed_host
        else:
            return url_host == allowed_host

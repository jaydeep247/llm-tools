"""
Resource Extractor
Extracts resources: CSS, JS, images, external resources
"""

from scrapy.http import Response
from typing import Dict, Any, List
from urllib.parse import urljoin, urlparse


class ResourceExtractor:
    """Extracts page resources"""
    
    @staticmethod
    def extract(response: Response, allowed_host: str, allow_subdomains: bool) -> List[Dict[str, Any]]:
        """
        Extract resources from page
        
        Args:
            response: Scrapy response object
            allowed_host: Base hostname for internal/external check
            allow_subdomains: Whether to allow subdomains
            
        Returns:
            List of resource dictionaries
        """
        resources = []
        page_url = response.url
        
        # CSS files
        for css_url in response.css('link[rel="stylesheet"]::attr(href)').getall():
            full_url = response.urljoin(css_url)
            resources.append({
                'page_url': page_url,
                'resource_url': full_url,
                'resource_type': 'css',
                'status_code': None,  # Would need separate requests to get status
            })
        
        # JavaScript files
        for js_url in response.css('script[src]::attr(src)').getall():
            full_url = response.urljoin(js_url)
            resources.append({
                'page_url': page_url,
                'resource_url': full_url,
                'resource_type': 'js',
                'status_code': None,
            })
        
        # Images
        for img_url in response.css('img::attr(src)').getall():
            full_url = response.urljoin(img_url)
            resources.append({
                'page_url': page_url,
                'resource_url': full_url,
                'resource_type': 'image',
                'status_code': None,
            })
        
        return resources

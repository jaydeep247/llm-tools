"""
SEO Field Extractor
Extracts SEO-related fields: canonical, robots, indexability, pagination links
"""

from scrapy.http import Response
from typing import Dict, Any, Optional


class SeoExtractor:
    """Extracts SEO-related fields"""
    
    @staticmethod
    def extract(response: Response) -> Dict[str, Any]:
        """
        Extract SEO fields
        
        Args:
            response: Scrapy response object
            
        Returns:
            Dictionary of SEO fields
        """
        # Canonical URL
        canonical_url = response.css('link[rel="canonical"]::attr(href)').get()
        if canonical_url:
            canonical_url = response.urljoin(canonical_url)
        
        # Meta robots
        meta_robots = response.css('meta[name="robots"]::attr(content)').get()
        if not meta_robots:
            meta_robots = ''
        
        # Indexability check
        indexable = True
        indexability_status = 'indexable'
        
        if meta_robots:
            robots_lower = meta_robots.lower()
            if 'noindex' in robots_lower:
                indexable = False
                indexability_status = 'noindex in meta robots'
        
        # Check X-Robots-Tag header
        x_robots = response.headers.get('X-Robots-Tag', b'').decode('utf-8', errors='ignore')
        if x_robots and 'noindex' in x_robots.lower():
            indexable = False
            indexability_status = 'noindex in X-Robots-Tag header'
        
        # Pagination links
        rel_next = response.css('link[rel="next"]::attr(href)').get()
        if rel_next:
            rel_next = response.urljoin(rel_next)
        
        rel_prev = response.css('link[rel="prev"]::attr(href)').get()
        if rel_prev:
            rel_prev = response.urljoin(rel_prev)
        
        # Language
        language = response.css('html::attr(lang)').get()
        if not language:
            language = response.css('meta[http-equiv="content-language"]::attr(content)').get()
        
        return {
            'canonical_url': canonical_url,
            'meta_robots': meta_robots,
            'indexable': indexable,
            'indexability_status': indexability_status,
            'rel_next': rel_next,
            'rel_prev': rel_prev,
            'language': language or '',
        }

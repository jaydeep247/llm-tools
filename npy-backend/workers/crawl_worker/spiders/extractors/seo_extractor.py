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
        
        # Indexability check (Screaming Frog compatible: checks noindex, non-200, canonical mismatch)
        indexable = True
        indexability_status = 'Indexable'
        indexability_reasons = []
        
        # Check non-200 status codes
        if response.status != 200:
            indexable = False
            if 300 <= response.status < 400:
                indexability_reasons.append(f'Redirect ({response.status})')
            elif 400 <= response.status < 500:
                indexability_reasons.append(f'Client Error ({response.status})')
            elif response.status >= 500:
                indexability_reasons.append(f'Server Error ({response.status})')
        
        if meta_robots:
            robots_lower = meta_robots.lower()
            if 'noindex' in robots_lower:
                indexable = False
                indexability_reasons.append('Noindex')
        
        # Check X-Robots-Tag header
        x_robots = response.headers.get('X-Robots-Tag', b'').decode('utf-8', errors='ignore')
        if x_robots and 'noindex' in x_robots.lower():
            indexable = False
            indexability_reasons.append('Noindex in X-Robots-Tag')
        
        # Check canonical mismatch (normalize trailing slash for comparison)
        if canonical_url:
            canon_norm = canonical_url.rstrip('/')
            response_norm = response.url.rstrip('/')
            if canon_norm != response_norm:
                indexable = False
                indexability_reasons.append('Canonicalised')
        
        if not indexable:
            indexability_status = ', '.join(indexability_reasons) if indexability_reasons else 'Non-Indexable'
        
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

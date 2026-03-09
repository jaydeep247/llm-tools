from bs4 import BeautifulSoup
import re
from urllib.parse import urljoin, urlparse
from modules.module_A.WebsiteCrawler.metrics.pixel_width import calculate_pixel_width as _pw


def _desc_pixel_width(text: str) -> int:
    return _pw(text, font_size=14)

def extract_meta_description(soup: BeautifulSoup) -> dict:
    """
    Extract meta description from a page.
    """
    meta_desc_element = soup.find('meta', attrs={'name': 'description'})
    meta_description = meta_desc_element.get('content', '').strip() if meta_desc_element else ''
    meta_description_length = len(meta_description)
    has_missing_meta_description = meta_description_length == 0
    
    # Calculate pixel width
    meta_description_pixel_width = _desc_pixel_width(meta_description)
    
    return {
        'metaDescription': meta_description or 'No description',
        'metaDescriptionLength': meta_description_length,
        'metaDescriptionPixelWidth': meta_description_pixel_width,
        'hasMissingMetaDescription': has_missing_meta_description
    }

def extract_meta_tags(soup: BeautifulSoup, base_url: str) -> dict:
    """
    Extract all meta tags from a page.
    """
    # Meta keywords
    meta_keywords_element = soup.find('meta', attrs={'name': 'keywords'})
    meta_keywords = meta_keywords_element.get('content', '').strip() if meta_keywords_element else None
    meta_keywords_length = len(meta_keywords) if meta_keywords else 0
    
    # Meta robots
    meta_robots_element = soup.find('meta', attrs={'name': 'robots'})
    meta_robots = meta_robots_element.get('content', '').strip() if meta_robots_element else None
    
    # Canonical URL
    canonical_element = soup.find('link', attrs={'rel': 'canonical'})
    canonical_url = canonical_element.get('href', '').strip() if canonical_element else None
    
    # Resolve relative canonical URLs
    if canonical_url and not canonical_url.startswith('http'):
        try:
            canonical_url = urljoin(base_url, canonical_url)
        except:
            # Keep original if URL resolution fails
            pass
            
    # Viewport
    viewport_element = soup.find('meta', attrs={'name': 'viewport'})
    viewport = viewport_element.get('content', '').strip() if viewport_element else None
    
    # Meta refresh
    meta_refresh_element = soup.find('meta', attrs={'http-equiv': 'refresh'})
    meta_refresh = meta_refresh_element.get('content', '').strip() if meta_refresh_element else None
    
    return {
        'metaKeywords': meta_keywords,
        'metaKeywordsLength': meta_keywords_length,
        'metaRobots': meta_robots,
        'metaRefresh': meta_refresh,
        'canonicalUrl': canonical_url,
        'viewport': viewport
    }

def validate_meta_description_length(length: int) -> dict:
    """
    Validate meta description length (SEO best practices).
    """
    if length == 0:
        return {'isValid': False, 'message': 'Missing meta description'}
    
    if length < 120:
        return {'isValid': False, 'message': 'Meta description is too short (< 120 characters)'}
    
    if length > 160:
        return {'isValid': False, 'message': 'Meta description is too long (> 160 characters)'}
    
    return {'isValid': True}

def validate_canonical(canonical_url: str, current_url: str) -> dict:
    """
    Check if canonical URL is valid.
    """
    if not canonical_url:
        return {'isValid': False, 'message': 'Missing canonical tag'}
    
    try:
        canonical_parsed = urlparse(canonical_url)
        current_parsed = urlparse(current_url)
        
        # Check if canonical points to a different domain
        if canonical_parsed.hostname != current_parsed.hostname:
            return {
                'isValid': False,
                'message': f"Canonical points to different domain: {canonical_parsed.hostname}"
            }
            
        return {'isValid': True}
    except:
        return {'isValid': False, 'message': 'Invalid canonical URL format'}

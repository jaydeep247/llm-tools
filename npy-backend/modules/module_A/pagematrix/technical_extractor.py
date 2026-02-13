from bs4 import BeautifulSoup
from urllib.parse import urlparse
import sys

def check_http_status(status_code: int) -> dict:
    """
    Check HTTP status code.
    """
    is_ok = 200 <= status_code < 300
    is_redirect = 300 <= status_code < 400
    is_client_error = 400 <= status_code < 500
    is_server_error = 500 <= status_code
    
    return {
        'statusCode': status_code,
        'isOk': is_ok,
        'isRedirect': is_redirect,
        'isClientError': is_client_error,
        'isServerError': is_server_error,
        'isError': is_client_error or is_server_error
    }

def check_mixed_content(soup: BeautifulSoup, final_url: str) -> dict:
    """
    Check for mixed content (HTTP resources on HTTPS page).
    """
    if not final_url.startswith('https'):
        return {'hasMixedContent': False, 'mixedContentResources': []}
        
    mixed_resources = []
    
    # Check images, scripts, iframes, links
    for tag_name, attr in [('img', 'src'), ('script', 'src'), ('iframe', 'src'), ('link', 'href')]:
        for element in soup.find_all(tag_name):
            url = element.get(attr)
            if url and url.startswith('http://'):
                mixed_resources.append({
                    'type': tag_name,
                    'url': url
                })
                
    return {
        'hasMixedContent': len(mixed_resources) > 0,
        'mixedContentResources': mixed_resources
    }

def measure_page_size(response_content: bytes) -> dict:
    """
    Measure page size in bytes.
    """
    size_bytes = len(response_content)
    size_kb = round(size_bytes / 1024, 2)
    size_mb = round(size_kb / 1024, 2)
    
    return {
        'sizeBytes': size_bytes,
        'sizeKb': size_kb,
        'sizeMb': size_mb,
        'isLarge': size_mb > 5 # Flag if > 5MB
    }

def extract_viewport(soup: BeautifulSoup) -> dict:
    """Extract viewport meta tag."""
    viewport_meta = soup.find('meta', attrs={'name': 'viewport'})
    content = viewport_meta.get('content', '') if viewport_meta else None
    
    has_viewport = content is not None
    is_mobile_optimized = False
    
    if has_viewport:
        content_lower = content.lower()
        if 'width=device-width' in content_lower and 'initial-scale=1' in content_lower:
            is_mobile_optimized = True
            
    return {
        'viewportContent': content,
        'hasViewport': has_viewport,
        'isMobileOptimized': is_mobile_optimized
    }

def extract_headers_tags(soup: BeautifulSoup) -> dict:
    """
    Extract H hreflang tags and other header links.
    """
    hreflangs = []
    for link in soup.find_all('link', attrs={'rel': 'alternate'}):
        hreflang = link.get('hreflang')
        href = link.get('href')
        if hreflang and href:
            hreflangs.append({'lang': hreflang, 'url': href})
            
    return {
        'hreflangs': hreflangs
    }

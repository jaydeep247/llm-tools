from bs4 import BeautifulSoup
from urllib.parse import urlparse
import sys

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

from bs4 import BeautifulSoup
import re
from modules.module_A.WebsiteCrawler.metrics.pixel_width import calculate_pixel_width as _pw


def _title_pixel_width(text: str) -> int:
    return _pw(text, font_size=20)

def extract_title(soup: BeautifulSoup) -> dict:
    """
    Extract title information from a page.
    """
    title_element = soup.find('title')
    title = title_element.get_text().strip() if title_element else ''
    title_length = len(title)
    has_missing_title = title_length == 0
    
    # Calculate pixel width
    title_pixel_width = _title_pixel_width(title)
    
    return {
        'title': title or 'No title',
        'titleLength': title_length,
        'titlePixelWidth': title_pixel_width,
        'hasMissingTitle': has_missing_title
    }

def validate_title_length(title_length: int) -> dict:
    """
    Validate title length (SEO best practices).
    """
    if title_length == 0:
        return {'isValid': False, 'message': 'Missing title tag'}
    
    if title_length < 30:
        return {'isValid': False, 'message': 'Title is too short (< 30 characters)'}
    
    if title_length > 60:
        return {'isValid': False, 'message': 'Title is too long (> 60 characters)'}
    
    return {'isValid': True}

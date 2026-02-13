from bs4 import BeautifulSoup
import re

def calculate_pixel_width(text: str) -> int:
    """
    Calculate approximate pixel width of text.
    Based on average character widths for common fonts.
    """
    if not text:
        return 0
    
    width = 0
    for char in text:
        # Approximate character widths (in pixels)
        if char == ' ':
            width += 3
        elif re.match(r"[iIl1\.,;:\-']", char):
            width += 4
        elif re.match(r"[fjtJ]", char):
            width += 5
        elif re.match(r"[a-z]", char):
            width += 6
        elif re.match(r"[A-Z]", char):
            width += 7
        elif re.match(r"[wWmM]", char):
            width += 9
        else:
            width += 6 # default
            
    return round(width)

def extract_title(soup: BeautifulSoup) -> dict:
    """
    Extract title information from a page.
    """
    title_element = soup.find('title')
    title = title_element.get_text().strip() if title_element else ''
    title_length = len(title)
    has_missing_title = title_length == 0
    
    # Calculate pixel width
    title_pixel_width = calculate_pixel_width(title)
    
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

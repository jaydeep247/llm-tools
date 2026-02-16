import re
from typing import List, Dict, Optional, Set, Tuple

# Placeholder values that indicate a missing/invalid title
PLACEHOLDER_TITLES = {
    '',
    ' ',
    'null',
    'undefined',
    'home',
    'index'
}

# Error titles that should be skipped from duplicate detection
ERROR_TITLES = {
    'request failed',
    'error',
    'page not found',
    'not found',
    '404',
    '500',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
    'timeout',
    'unreachable',
    'forbidden',
    'unauthorized',
    'bad request',
    'server error',
    'connection error',
    'network error',
    'failed',
    'error loading page',
    'page error',
    'access denied'
}

def is_error_title(title: Optional[str]) -> bool:
    """
    Check if a title is an error title that should be skipped.
    """
    if not title:
        return False
    
    normalized = title.strip().lower()
    
    # Check exact matches
    if normalized in ERROR_TITLES:
        return True
    
    # Check if title starts with common error patterns
    error_patterns = [
        r"^error\s+",
        r"^failed\s+",
        r"^\d{3}\s+", # HTTP status codes like "404", "500"
        r"^http\s+error",
        r"^server\s+error",
        r"^connection\s+error",
        r"^network\s+error"
    ]
    
    return any(re.match(pattern, normalized) for pattern in error_patterns)

def normalize_title(title: Optional[str], remove_branding: bool = True) -> str:
    """
    Normalize a title for comparison.
    """
    if not title:
        return ''
    
    normalized = title.strip().lower()
    
    # Normalize multiple spaces to single space
    normalized = re.sub(r'\s+', ' ', normalized)
    
    # Optionally remove branding suffix (e.g., "| Company Name")
    if remove_branding:
        # Remove patterns like "| Company", "- Company", "– Company", "— Company"
        normalized = re.sub(r'\s*[|\-–—]\s*.*$', '', normalized).strip()
        
    return normalized

def is_title_missing(title: Optional[str]) -> bool:
    """
    Check if a title is missing or invalid.
    """
    if not title:
        return True
    
    trimmed = title.strip()
    
    # Empty or whitespace only
    if len(trimmed) == 0:
        return True
    
    # Check for placeholder values
    if trimmed.lower() in PLACEHOLDER_TITLES:
        return True
    
    return False

def detect_missing_title(title: Optional[str]) -> str:
    """
    Detect missing title status for a single page.
    """
    return 'Missing' if is_title_missing(title) else 'OK'

def build_title_index(pages: List[Dict]) -> Dict[str, List[str]]:
    """
    Build a title index for duplicate detection.
    Returns a map: normalizedTitle -> array of URLs
    pages: List of dicts with 'url' and 'title' keys.
    """
    index = {}
    
    for page in pages:
        title = page.get('title')
        url = page.get('url')
        
        if is_title_missing(title):
            continue
            
        if is_error_title(title):
            continue
            
        normalized = normalize_title(title)
        if len(normalized) == 0:
            continue
            
        if normalized not in index:
            index[normalized] = []
        index[normalized].append(url)
        
    return index

def detect_duplicate_title(
    url: str,
    title: Optional[str],
    title_index: Dict[str, List[str]]
) -> Dict:
    """
    Detect duplicate titles for a single page given a title index.
    """
    # First check if title is missing
    if is_title_missing(title):
        return {
            'titleStatus': 'Missing',
            'duplicateTitleCount': 0,
            'duplicateWith': []
        }
    
    # Skip error titles
    if is_error_title(title):
        return {
            'titleStatus': 'OK',
            'duplicateTitleCount': 0,
            'duplicateWith': []
        }
    
    normalized = normalize_title(title)
    if len(normalized) == 0:
        return {
            'titleStatus': 'Missing',
            'duplicateTitleCount': 0,
            'duplicateWith': []
        }
    
    # Find all URLs with the same normalized title
    duplicate_urls = title_index.get(normalized, [])
    
    # Filter out current URL
    other_urls = [u for u in duplicate_urls if u != url]
    
    if not other_urls:
        return {
            'titleStatus': 'OK',
            'duplicateTitleCount': 0,
            'duplicateWith': []
        }
    
    total_count = len(duplicate_urls)
    status = 'Duplicate' if total_count > 5 else 'Duplicate'
    
    return {
        'titleStatus': status,
        'duplicateTitleCount': total_count,
        'duplicateWith': other_urls
    }

def batch_detect_title_issues(pages: List[Dict]) -> Dict[str, Dict]:
    """
    Batch detect title issues for all pages in a session.
    """
    results = {}
    
    # Build title index
    title_index = build_title_index(pages)
    
    # Detect for each page
    for page in pages:
        url = page.get('url')
        title = page.get('title')
        result = detect_duplicate_title(url, title, title_index)
        results[url] = result
        
    return results

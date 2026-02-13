import re
from typing import List, Dict, Optional, Set

# Placeholder values that indicate a missing/invalid meta description
PLACEHOLDER_DESCRIPTIONS = {
    '',
    ' ',
    'null',
    'undefined',
    'no description',
    'description'
}

# Error meta descriptions that should be skipped from duplicate detection
ERROR_DESCRIPTIONS = {
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

def normalize_meta_description(description: Optional[str]) -> str:
    """
    Normalize a meta description for comparison.
    """
    if not description:
        return ''
    
    normalized = description.strip().lower()
    
    # Normalize multiple spaces to single space
    normalized = re.sub(r'\s+', ' ', normalized)
    
    # Remove trailing punctuation (but keep meaningful punctuation)
    normalized = re.sub(r'[.,;:!?]+$', '', normalized).strip()
    
    return normalized

def is_meta_description_missing(description: Optional[str]) -> bool:
    """
    Check if a meta description is missing or invalid.
    """
    if not description:
        return True
    
    trimmed = description.strip()
    
    # Empty or whitespace only
    if len(trimmed) == 0:
        return True
    
    # Check for placeholder values
    if trimmed.lower() in PLACEHOLDER_DESCRIPTIONS:
        return True
    
    return False

def is_error_meta_description(description: Optional[str]) -> bool:
    """
    Check if a meta description is an error description that should be skipped.
    """
    if not description:
        return False
    
    normalized = description.strip().lower()
    
    # Check exact matches
    if normalized in ERROR_DESCRIPTIONS:
        return True
    
    # Check if description starts with common error patterns
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

def detect_missing_meta_description(description: Optional[str]) -> str:
    """
    Detect missing meta description status for a single page.
    """
    return 'Missing' if is_meta_description_missing(description) else 'OK'

def build_meta_description_index(pages: List[Dict]) -> Dict[str, List[str]]:
    """
    Build a meta description index for duplicate detection.
    Returns a map: normalizedDescription -> array of URLs
    """
    index = {}
    
    for page in pages:
        meta_description = page.get('metaDescription')
        url = page.get('url')
        
        if is_meta_description_missing(meta_description):
            continue
            
        if is_error_meta_description(meta_description):
            continue
            
        normalized = normalize_meta_description(meta_description)
        if len(normalized) == 0:
            continue
            
        # Skip very short descriptions (likely placeholders)
        if len(normalized) < 10:
            continue
            
        if normalized not in index:
            index[normalized] = []
        index[normalized].append(url)
        
    return index

def detect_duplicate_meta_description(
    url: str,
    meta_description: Optional[str],
    description_index: Dict[str, List[str]]
) -> Dict:
    """
    Detect duplicate meta descriptions for a single page given a description index.
    """
    # First check if meta description is missing
    if is_meta_description_missing(meta_description):
        return {
            'metaDescriptionStatus': 'Missing',
            'duplicateMetaDescriptionCount': 0,
            'duplicateWith': []
        }
    
    # Skip error meta descriptions
    if is_error_meta_description(meta_description):
        return {
            'metaDescriptionStatus': 'OK',
            'duplicateMetaDescriptionCount': 0,
            'duplicateWith': []
        }
    
    normalized = normalize_meta_description(meta_description)
    if len(normalized) == 0 or len(normalized) < 10:
        return {
            'metaDescriptionStatus': 'Missing',
            'duplicateMetaDescriptionCount': 0,
            'duplicateWith': []
        }
    
    # Find all URLs with the same normalized meta description
    duplicate_urls = description_index.get(normalized, [])
    
    # Filter out the current URL
    other_urls = [u for u in duplicate_urls if u != url]
    
    if not other_urls:
        return {
            'metaDescriptionStatus': 'OK',
            'duplicateMetaDescriptionCount': 0,
            'duplicateWith': []
        }
    
    # Determine status based on count
    total_count = len(duplicate_urls)
    status = 'Duplicate' if total_count > 5 else 'Duplicate'
    
    return {
        'metaDescriptionStatus': status,
        'duplicateMetaDescriptionCount': total_count,
        'duplicateWith': other_urls
    }

def batch_detect_meta_description_issues(pages: List[Dict]) -> Dict[str, Dict]:
    """
    Batch detect meta description issues for all pages in a session.
    """
    results = {}
    
    # Build meta description index
    description_index = build_meta_description_index(pages)
    
    # Detect for each page
    for page in pages:
        url = page.get('url')
        meta_description = page.get('metaDescription')
        result = detect_duplicate_meta_description(url, meta_description, description_index)
        results[url] = result
        
    return results

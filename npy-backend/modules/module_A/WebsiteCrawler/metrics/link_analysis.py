"""
Link Analysis Metrics
Calculates Link Score and Outlink statistics.
Ported from node-backend/src/utils/linkScoreCalculator.ts
"""

import math
import re
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse, urlunparse

# ==========================================
# Link Score Calculator
# ==========================================

POSITION_WEIGHTS = {
    'Header': 1.5,
    'Navigation': 1.5,
    'Main': 1.0,
    'Sidebar': 0.7,
    'Footer': 0.5,
    'Unknown': 0.3
}

def calculate_inlink_score(inlink_count: int) -> float:
    """
    Calculate base score from inlink count using logarithmic scale.
    """
    if inlink_count == 0:
        return 0.0
    
    # Logarithmic scale
    return min(55.0, 20.0 + math.log10(inlink_count + 1) * 17.5)

def calculate_position_bonus(inlinks: List[Dict[str, Any]]) -> float:
    """
    Calculate quality bonus based on link positions.
    """
    if not inlinks:
        return 0.0
        
    total_weight = 0.0
    max_possible = 0.0
    max_weight = POSITION_WEIGHTS['Header']
    
    for link in inlinks:
        position = link.get('position', 'Unknown')
        weight = POSITION_WEIGHTS.get(position, POSITION_WEIGHTS['Unknown'])
        total_weight += weight
        max_possible += max_weight
        
    if max_possible == 0:
        return 0.0
        
    quality_ratio = total_weight / max_possible
    return quality_ratio * 15.0

def calculate_depth_bonus(crawl_depth: int) -> float:
    """
    Calculate crawl depth bonus.
    """
    if crawl_depth is None: return 5.0
    
    if crawl_depth == 0: return 15.0
    if crawl_depth == 1: return 12.0
    if crawl_depth == 2: return 9.0
    if crawl_depth == 3: return 6.0
    return 3.0

def calculate_authority_bonus(inlinks: List[Dict[str, Any]]) -> float:
    """
    Calculate authority bonus from linking pages.
    """
    if not inlinks:
        return 0.0
        
    total_authority = 0.0
    count = 0
    
    for link in inlinks:
        score = link.get('sourcePageScore')
        if score is not None:
            total_authority += score
            count += 1
            
    if count == 0:
        return 5.0 # Default bonus
        
    avg_authority = total_authority / count
    return (avg_authority / 100.0) * 15.0

def calculate_link_score(inlinks: List[Dict[str, Any]], crawl_depth: int) -> float:
    """
    Calculate comprehensive Link Score (0-100).
    """
    inlink_score = calculate_inlink_score(len(inlinks))
    position_bonus = calculate_position_bonus(inlinks)
    depth_bonus = calculate_depth_bonus(crawl_depth)
    authority_bonus = calculate_authority_bonus(inlinks)
    
    total = inlink_score + position_bonus + depth_bonus + authority_bonus
    return round(min(100.0, total), 2)

def _normalize_outlink_url(url: str) -> str:
    """
    Normalise a resolved outlink URL for deduplication purposes.

    Three transformations applied:
      1. Strip surrounding whitespace (e.g. href="/path/ " in source HTML)
      2. Collapse multiple consecutive forward-slashes in the path to one
         (e.g. https://example.com//slug/ → https://example.com/slug/)
      3. Strip a trailing slash from non-root paths for consistent comparison
         (e.g. https://example.com/page/ == https://example.com/page)
    """
    if not url:
        return url
    url = url.strip()
    if not url:
        return url
    try:
        parsed = urlparse(url)
        # Collapse // → / in path (but never touch the scheme's ://)
        path = re.sub(r'/+', '/', parsed.path) if parsed.path else '/'
        # Strip trailing slash unconditionally – root '/' becomes '' which
        # urlunparse renders as the bare host (https://attrock.com)
        if path.endswith('/'):
            path = path[:-1]
        return urlunparse((parsed.scheme, parsed.netloc, path,
                           parsed.params, parsed.query, ''))
    except Exception:
        if url.endswith('/') and len(url) > 1:
            return url[:-1]
        return url


# ==========================================
# Outlink Statistics
# ==========================================

def analyze_outlinks(links: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze collected links to generate statistics.
    Expects list of dicts with 'is_internal', 'target_url', 'rel'.

    Both internal_outlinks and external_outlinks are UNIQUE counts (matching
    Screaming Frog behaviour) so internal_external_ratio is computed from
    de-duplicated values.

    URLs are normalised before deduplication so that variants differing only
    by trailing whitespace, redundant double-slashes, or a trailing slash on
    non-root paths are counted as the same destination.
    """
    total = len(links)
    unique_outlinks = set()
    unique_internal_outlinks: set = set()
    unique_external_outlinks: set = set()
    js_outlinks = 0
    external_js_outlinks = 0
    
    for link in links:
        url = link.get('target_url', '')
        is_internal = link.get('is_internal', False)

        # Check for JS links BEFORE normalisation (heuristic on raw value)
        if url.startswith('javascript:'):
            js_outlinks += 1
            if not is_internal:
                external_js_outlinks += 1

        # Normalise for deduplication
        norm_url = _normalize_outlink_url(url)
        unique_outlinks.add(norm_url)

        if is_internal:
            unique_internal_outlinks.add(norm_url)
        else:
            unique_external_outlinks.add(norm_url)
            
    return {
        'outlinks': total,
        'unique_outlinks': len(unique_outlinks),
        'unique_js_outlinks': js_outlinks,
        'internal_outlinks': len(unique_internal_outlinks),
        'external_outlinks': len(unique_external_outlinks),
        'unique_external_outlinks': len(unique_external_outlinks),
        'unique_external_js_outlinks': external_js_outlinks,
        'outlink_url_list': list(unique_internal_outlinks),
    }

import json
from urllib.parse import urlparse
from typing import List, Dict, Any

def get_folder_depth(url: str) -> int:
    """Calculate the folder depth of a URL."""
    path = urlparse(url).path
    # Remove trailing and leading slashes for accurate count
    segments = [p for p in path.split('/') if p]
    return len(segments)

def classify_page_types(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Classify page_type for a list of crawled items based on the provided rules.
    """
    stats = {
        "Hubs": 0,
        "Spokes": 0,
        "Sub-Spokes": 0,
        "Unknown": 0,
        "Skipped": 0
    }
    
    # Pre-compute depths and track items by URL for fast lookup
    url_map = {}
    for item in items:
        item['folder_depth'] = get_folder_depth(item['url'])
        url_map[item['url']] = item
        
    # Phase 1: Identify Hubs first (and skip already classified)
    confirmed_hubs = set()
    for item in items:
        if item.get('page_type'):
            stats["Skipped"] += 1
            if item['page_type'] == 'Hub':
                confirmed_hubs.add(item['url'])
            continue
            
        inlinks = item.get('inlink_count', 0)
        outlinks = item.get('outlink_count', 0)
        depth = item['folder_depth']
        
        # Rule 1: Hub — spec §1.4: ≥30 inlinks AND url_depth ≤ 2
        if inlinks >= 30 and depth <= 2:
            item['page_type'] = 'Hub'
            stats["Hubs"] += 1
            confirmed_hubs.add(item['url'])

    # Phase 2: Identify Spokes, Sub-Spokes, Unknown
    for item in items:
        if item.get('page_type'):
            continue

        inlinks = item.get('inlink_count', 0)
        depth = item['folder_depth']
        incoming_urls = item.get('incoming_links', [])
        pointed_to_by_hub = item.get('pointed_by_hub', False) or any(url in confirmed_hubs for url in incoming_urls)

        # Rule 2: Spoke — spec §1.4: ≥10 inlinks OR pointed to by a Hub
        if inlinks >= 10 or pointed_to_by_hub:
            item['page_type'] = 'Spoke'
            stats["Spokes"] += 1
            continue

        pointed_only_by_spoke = item.get('pointed_only_by_spoke', False)

        # Rule 3: Sub-Spoke — everything else
        item['page_type'] = 'Sub-Spoke'
        stats["Sub-Spokes"] += 1

    # Clean up temporary fields if we added them
    for item in items:
        if 'folder_depth' in item:
            del item['folder_depth']

    return {
        "items": items,
        "breakdown": stats
    }

# Example usage/test
if __name__ == "__main__":
    sample_data = [
        {"url": "https://example.com/", "inlink_count": 100, "outlink_count": 50, "page_type": "None"},
        {"url": "https://example.com/services/", "inlink_count": 25, "outlink_count": 15}, # Hub (depth 1)
        {"url": "https://example.com/services/seo/audit/", "inlink_count": 10, "outlink_count": 5, "pointed_by_hub": True}, # Spoke (depth 3)
        {"url": "https://example.com/services/seo/audit/technical/", "inlink_count": 2, "outlink_count": 1}, # Sub-Spoke (depth 4)
    ]
    
    result = classify_page_types(sample_data)
    print(json.dumps(result['breakdown'], indent=2))
    for item in result['items']:
        print(f"{item['url']}: {item.get('page_type')}")

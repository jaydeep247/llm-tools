"""
Crawl Data Verification Script
Validates and analyzes crawl results to authenticate the data
"""

import json
import os
import sys
from collections import Counter

def verify_crawl_data(session_id):
    """
    Verify and analyze crawl data for a given session
    
    Args:
        session_id: The session ID to verify
    """
    data_path = f"./data/{session_id}"
    
    if not os.path.exists(data_path):
        print(f"❌ Error: Session directory not found: {data_path}")
        return
    
    print("=" * 80)
    print(f"🔍 CRAWL DATA VERIFICATION REPORT")
    print(f"Session ID: {session_id}")
    print("=" * 80)
    
    # 1. Verify session.json
    session_file = os.path.join(data_path, 'session.json')
    if os.path.exists(session_file):
        with open(session_file, 'r') as f:
            session_data = json.load(f)
        
        print(f"\n📊 SESSION SUMMARY:")
        print(f"  Start URL: {session_data.get('start_url')}")
        print(f"  Started: {session_data.get('started_at')}")
        print(f"  Completed: {session_data.get('completed_at')}")
        print(f"  Status: {session_data.get('status')}")
        print(f"  Claimed Total Pages: {session_data.get('total_pages')}")
        print(f"  Claimed Total Resources: {session_data.get('total_resources')}")
        print(f"  Claimed Total Links: {session_data.get('total_links')}")
    
    # 2. Verify pages.json - COUNT ACTUAL PAGES
    pages_file = os.path.join(data_path, 'pages.json')
    if os.path.exists(pages_file):
        with open(pages_file, 'r') as f:
            pages_data = json.load(f)
        
        actual_page_count = len(pages_data)
        claimed_page_count = session_data.get('total_pages', 0)
        
        print(f"\n✅ PAGE VERIFICATION:")
        print(f"  Claimed pages: {claimed_page_count}")
        print(f"  Actual pages in pages.json: {actual_page_count}")
        
        if actual_page_count == claimed_page_count:
            print(f"  ✓ MATCH - Page count is accurate!")
        else:
            print(f"  ✗ MISMATCH - Discrepancy of {abs(actual_page_count - claimed_page_count)} pages")
        
        # Analyze pages
        print(f"\n📄 PAGE ANALYSIS:")
        
        # Status codes
        status_codes = Counter([p.get('status_code') for p in pages_data])
        print(f"  Status Code Distribution:")
        for code, count in sorted(status_codes.items()):
            print(f"    {code}: {count} pages")
        
        # Unique URLs
        urls = [p.get('url') for p in pages_data]
        unique_urls = set(urls)
        print(f"  Unique URLs: {len(unique_urls)}")
        if len(urls) != len(unique_urls):
            duplicates = len(urls) - len(unique_urls)
            print(f"  ⚠️  Warning: {duplicates} duplicate URLs found")
        
        # Depth analysis
        depths = [p.get('crawl_depth', 0) for p in pages_data]
        print(f"  Crawl Depth Range: {min(depths)} to {max(depths)}")
        depth_dist = Counter(depths)
        print(f"  Depth Distribution:")
        for depth in sorted(depth_dist.keys()):
            print(f"    Depth {depth}: {depth_dist[depth]} pages")
        
        # Show sample URLs
        print(f"\n  Sample URLs (first 10):")
        for i, page in enumerate(pages_data[:10], 1):
            print(f"    {i}. {page.get('url')} (Status: {page.get('status_code')})")
        
        if actual_page_count > 10:
            print(f"    ... and {actual_page_count - 10} more pages")
    
    # 3. Verify resources.json
    resources_file = os.path.join(data_path, 'resources.json')
    if os.path.exists(resources_file):
        with open(resources_file, 'r') as f:
            resources_data = json.load(f)
        
        actual_resource_count = len(resources_data)
        claimed_resource_count = session_data.get('total_resources', 0)
        
        print(f"\n✅ RESOURCE VERIFICATION:")
        print(f"  Claimed resources: {claimed_resource_count}")
        print(f"  Actual resources in resources.json: {actual_resource_count}")
        
        if actual_resource_count == claimed_resource_count:
            print(f"  ✓ MATCH - Resource count is accurate!")
        else:
            print(f"  ✗ MISMATCH - Discrepancy of {abs(actual_resource_count - claimed_resource_count)} resources")
        
        if resources_data:
            resource_types = Counter([r.get('resource_type') for r in resources_data])
            print(f"  Resource Type Distribution:")
            for rtype, count in sorted(resource_types.items()):
                print(f"    {rtype}: {count}")
    
    # 4. Verify links.json
    links_file = os.path.join(data_path, 'links.json')
    if os.path.exists(links_file):
        with open(links_file, 'r') as f:
            links_data = json.load(f)
        
        actual_link_count = len(links_data)
        claimed_link_count = session_data.get('total_links', 0)
        
        print(f"\n✅ LINK VERIFICATION:")
        print(f"  Claimed links: {claimed_link_count}")
        print(f"  Actual links in links.json: {actual_link_count}")
        
        if actual_link_count == claimed_link_count:
            print(f"  ✓ MATCH - Link count is accurate!")
        else:
            print(f"  ✗ MISMATCH - Discrepancy of {abs(actual_link_count - claimed_link_count)} links")
        
        if links_data:
            internal_links = sum(1 for l in links_data if l.get('is_internal'))
            external_links = actual_link_count - internal_links
            print(f"  Internal links: {internal_links}")
            print(f"  External links: {external_links}")
    
    # 5. Verify sitemaps.json
    sitemaps_file = os.path.join(data_path, 'sitemaps.json')
    if os.path.exists(sitemaps_file):
        with open(sitemaps_file, 'r') as f:
            sitemap_data = json.load(f)
        
        print(f"\n🗺️  SITEMAP DATA:")
        print(f"  Sitemap URLs found: {len(sitemap_data.get('sitemap_urls', []))}")
        for sitemap_url in sitemap_data.get('sitemap_urls', []):
            print(f"    - {sitemap_url}")
        print(f"  URLs discovered from sitemaps: {len(sitemap_data.get('discovered_urls', []))}")
    
    # 6. File sizes
    print(f"\n💾 FILE SIZES:")
    for filename in ['session.json', 'pages.json', 'resources.json', 'links.json', 'sitemaps.json']:
        filepath = os.path.join(data_path, filename)
        if os.path.exists(filepath):
            size = os.path.getsize(filepath)
            size_kb = size / 1024
            print(f"  {filename}: {size:,} bytes ({size_kb:.2f} KB)")
    
    print("\n" + "=" * 80)
    print("✅ VERIFICATION COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        session_id = sys.argv[1]
    else:
        # Default to yogreet_crawl_test
        session_id = "yogreet_crawl_test"
    
    verify_crawl_data(session_id)

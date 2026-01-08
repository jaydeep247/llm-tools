"""
Test script to verify bulk audit sitemap fetching works correctly
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.bulk_aeo_service import BulkAEOService
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def test_sitemap_fetch():
    """Test fetching URLs from a sitemap"""
    print("=" * 60)
    print("Testing Bulk AEO Service - Sitemap Fetch")
    print("=" * 60)
    
    service = BulkAEOService()
    
    # Test with the actual sitemap
    sitemap_url = "https://firstbud.in/sitemap.xml"
    
    try:
        print(f"\n1. Testing sitemap: {sitemap_url}")
        urls = service.fetch_sitemap_urls(sitemap_url, limit=5)
        
        print(f"\n✅ SUCCESS: Found {len(urls)} URLs")
        print("\nFirst 5 URLs:")
        for i, url in enumerate(urls[:5], 1):
            print(f"  {i}. {url}")
            
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        print("\nFull traceback:")
        traceback.print_exc()
        
    print("\n" + "=" * 60)

if __name__ == "__main__":
    test_sitemap_fetch()

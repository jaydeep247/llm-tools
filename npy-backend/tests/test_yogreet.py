"""
Test script for yogreet.com crawl timing
"""

import asyncio
import sys
import os
import time

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from workers.crawl_worker.crawler import CrawlWorker
from storage.object_store import LocalObjectStore
from clients.node_api_client import NodeApiClient
from utils.logger import logger


async def test_yogreet_crawl():
    """Test crawling yogreet.com and measure time"""
    
    # Create dependencies
    node_client = NodeApiClient(base_url="http://localhost:3000")
    storage = LocalObjectStore()
    worker = CrawlWorker(node_client, storage)
    
    # Create test job
    test_job = {
        "id": "yogreet_crawl_test",
        "config": {
            "url": "https://wearcomet.com",
            "allow_subdomains": True,
            "max_concurrency": 5,
        }
    }
    
    logger.info("=" * 60)
    logger.info("Starting yogreet.com crawl test...")
    logger.info("=" * 60)
    
    start_time = time.time()
    
    try:
        result = await worker.execute(test_job)
        
        end_time = time.time()
        duration = end_time - start_time
        
        logger.info("=" * 60)
        logger.info(f"✅ Crawl completed successfully!")
        logger.info(f"⏱️  Total time: {duration:.2f} seconds ({duration/60:.2f} minutes)")
        logger.info("=" * 60)
        
        # Check results
        session_id = result['session_id']
        data_path = f"./data/{session_id}"
        
        import json
        
        # Read session data
        session_file = os.path.join(data_path, 'session.json')
        if os.path.exists(session_file):
            with open(session_file, 'r') as f:
                session_data = json.load(f)
                logger.info(f"\n📊 Crawl Statistics:")
                logger.info(f"  • Total pages crawled: {session_data.get('total_pages')}")
                logger.info(f"  • Total resources found: {session_data.get('total_resources')}")
                logger.info(f"  • Total links found: {session_data.get('total_links')}")
                logger.info(f"  • Storage path: {data_path}")
        
        # Show sample pages
        pages_file = os.path.join(data_path, 'pages.json')
        if os.path.exists(pages_file):
            with open(pages_file, 'r') as f:
                pages_data = json.load(f)
                logger.info(f"\n📄 Sample Pages (first 5):")
                for i, page in enumerate(pages_data[:5], 1):
                    logger.info(f"  {i}. {page.get('url')}")
                    logger.info(f"     Title: {page.get('title')}")
                    logger.info(f"     Status: {page.get('status_code')}, Words: {page.get('word_count')}")
        
        logger.info("=" * 60)
        
    except Exception as e:
        end_time = time.time()
        duration = end_time - start_time
        logger.error(f"❌ Test failed after {duration:.2f} seconds: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_yogreet_crawl())

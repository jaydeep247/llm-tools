"""
Quick test to verify resource extraction changes
"""

import asyncio
import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Configure logging to show in terminal
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)

from workers.crawl_worker.crawler import CrawlWorker
from storage.object_store import LocalObjectStore
from clients.node_api_client import NodeApiClient
from utils.logger import logger

# Set the level for the custom logger as well


async def test_quick_crawl():
    """Quick test with example.com"""
    
    node_client = NodeApiClient(base_url="http://localhost:3000")
    storage = LocalObjectStore()
    worker = CrawlWorker(node_client, storage)
    
    test_job = {
        "id": "test_no_css_images",
        "config": {
            "url": "http://attrock.com/",
            "allow_subdomains": True,
            "max_concurrency": 3,
            "max_pages": 0,
            "timeout": 0,
        }
    }
    
    logger.info("Testing resource extraction (CSS and images disabled)...")
    start_time = time.time()
    
    try:
        result = await worker.execute(test_job)
        duration = time.time() - start_time
        
        logger.info(f"✅ Test completed in {duration:.2f} seconds")
        
        # Check resources
        import json
        session_id = result['session_id']
                    
    except Exception as e:
        logger.error(f"Test failed: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_quick_crawl())

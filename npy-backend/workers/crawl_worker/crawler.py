import sys
import os
import argparse
import asyncio
import time
from datetime import datetime

# Add project root to Python path to allow imports from workers.*
sys.path.append(os.getcwd())

from scrapy.crawler import CrawlerProcess
from scrapy.utils.log import configure_logging
from workers.crawl_worker.spiders.website_spider import WebsiteSpider
from utils.logger import logger
from utils.config import config
from clients.node_api_client import NodeApiClient

async def notify_completion(job_id, payload):
    client = NodeApiClient()
    try:
        await client.complete_job(job_id, payload)
        logger.info(f"Job {job_id} notification sent: COMPLETED.")
    except Exception as e:
        logger.error(f"Failed to notify backend of completion: {e}")

async def notify_failure(job_id, reason):
    client = NodeApiClient()
    try:
        await client.fail_job(job_id, reason)
        logger.info(f"Job {job_id} notification sent: FAILED.")
    except Exception as e:
        logger.error(f"Failed to notify backend of failure: {e}")

def main():
    parser = argparse.ArgumentParser(description='Run Scrapy Crawler for a specific job')
    parser.add_argument('--url', required=True, help='Start URL for the crawl')
    parser.add_argument('--session-id', required=True, help='Session ID for the crawl')
    parser.add_argument('--job-id', required=True, help='Job ID for database linking')
    parser.add_argument('--project-id', required=True, help='Project ID for metadata')
    parser.add_argument('--max-pages', type=int, default=0, help='Max pages to crawl (0 for unlimited)')
    parser.add_argument('--timeout', type=int, default=0, help='Timeout in seconds (0 for unlimited)')
    parser.add_argument('--max-concurrency', type=int, default=20, help='Max concurrent requests')

    args = parser.parse_args()

    # Configure logging
    configure_logging()
    logger.info(f"Starting crawl job {args.job_id} for {args.url}")

    # Initialize CrawlerProcess
    process = CrawlerProcess(settings={
        'LOG_LEVEL': 'WARNING',
        'LOG_FORMAT': '%(asctime)s [%(name)s] %(levelname)s: %(message)s',
        'MONGO_URI': config.MONGO_URI,
        'MONGO_DATABASE': config.MONGO_DB_NAME,
        'MONGO_BATCH_SIZE': 10,
    })

    # Start the spider
    crawler = process.create_crawler(WebsiteSpider)
    process.crawl(crawler, 
        start_url=args.url,
        session_id=args.session_id,
        job_id=args.job_id,
        project_id=args.project_id,
        max_concurrency=args.max_concurrency,
        max_pages=args.max_pages,
        timeout=args.timeout
    )
    
    try:
        # Start crawling (blocks until finished)
        process.start()
        
        # detailed stats are available after the crawl
        stats = crawler.stats.get_stats()
        pages_crawled = stats.get('pages_crawled', 0)
        start_time = stats.get('start_time', time.time())
        
        if isinstance(start_time, datetime):
            start_time = start_time.timestamp()
            
        duration = (time.time() - start_time)
        error_count = stats.get('log_count/ERROR', 0)
        
        payload = {
            'stats': {
                'pagesCrawled': pages_crawled,
                'duration': duration, # Seconds
                'errors': error_count
            }
        }
        
        logger.info(f"Crawl finished. Stats: {payload['stats']}")
        asyncio.run(notify_completion(args.job_id, payload))

    except Exception as e:
        logger.error(f"Crawl failed with exception: {e}")
        asyncio.run(notify_failure(args.job_id, str(e)))
        sys.exit(1)

if __name__ == "__main__":
    main()

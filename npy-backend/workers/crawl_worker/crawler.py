import sys
import os
import argparse
import asyncio
import time
from datetime import datetime
import logging

sys.path.append(os.getcwd())

from scrapy.crawler import CrawlerProcess
from workers.crawl_worker.spiders.website_spider import WebsiteSpider
from utils.logger import configure_logger, logger
from utils.config import config
from utils.event_publisher import publisher

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

    configure_logger()
    logger.info(f"Starting crawl job {args.job_id} for {args.url}")

    # Load project settings
    from scrapy.settings import Settings
    from workers.crawl_worker.spiders import settings as spider_settings
    
    crawler_settings = Settings()
    crawler_settings.setmodule(spider_settings)

    # Initialize CrawlerProcess with merged settings
    # We override specific settings for this job while preserving defaults
    settings_update = {
        'LOG_ENABLED': False,
        'LOG_LEVEL': 'ERROR',
        'LOG_FORMAT': '%(asctime)s [%(name)s] %(levelname)s: %(message)s',
        'MONGO_URI': config.MONGO_URI,
        'MONGO_DATABASE': config.MONGO_DB_NAME,
        'MONGO_BATCH_SIZE': 200,
        'REQUEST_FINGERPRINTER_IMPLEMENTATION': '2.7',

        # Ensure Item Pipelines are active (merge with existing)
        'ITEM_PIPELINES': spider_settings.ITEM_PIPELINES,
        # Ensure Redis settings are active
        'SCHEDULER': spider_settings.SCHEDULER,
        'DUPEFILTER_CLASS': spider_settings.DUPEFILTER_CLASS,
        'SCHEDULER_PERSIST': spider_settings.SCHEDULER_PERSIST,
    }

    # Apply limits if provided
    if args.max_pages > 0:
        settings_update['CLOSESPIDER_PAGECOUNT'] = args.max_pages
    
    if args.timeout > 0:
        settings_update['CLOSESPIDER_TIMEOUT'] = args.timeout
        
    if args.max_concurrency > 0:
        settings_update['CONCURRENT_REQUESTS'] = args.max_concurrency

    crawler_settings.update(settings_update)

    process = CrawlerProcess(settings=crawler_settings)

    # CrawlerProcess resets root logger level to NOTSET via configure_logging().
    # Re-apply suppression so scrapy DEBUG/INFO noise doesn't bleed into stdout.
    import logging as _logging
    _logging.getLogger("scrapy").setLevel(_logging.ERROR)
    _logging.getLogger("scrapy.core.scraper").setLevel(_logging.ERROR)
    for _h in _logging.root.handlers:
        if _h.level < _logging.INFO:
            _h.setLevel(_logging.INFO)

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
        logger.info(f"🕷️ Starting crawler process for {args.url} (max_pages={args.max_pages})")
        process.start()
        
        # detailed stats are available after the crawl
        stats = crawler.stats.get_stats()
        pages_crawled = stats.get('pages_crawled', 0)
        
        # Get custom stats from spider instance if available
        links_collected = 0
        if hasattr(crawler, 'spider'):
            links_collected = getattr(crawler.spider, 'links_collected', 0)
            
        start_time = stats.get('start_time', time.time())
        if isinstance(start_time, datetime):
            start_time = start_time.timestamp()
            
        duration = (time.time() - start_time)
        error_count = stats.get('log_count/ERROR', 0)
        
        logger.info(f"🕷️ Crawler finished. Pages: {pages_crawled}, Links: {links_collected}, Duration: {duration:.2f}s, Errors: {error_count}")

        # FALLBACK: Emit JOB_COMPLETED event to ensure status is updated
        # This handles cases where spider_closed might fail or not fire
        publisher.emit_event(args.job_id, 'JOB_COMPLETED', {
            'url': args.url,
            'completed_at': datetime.now().isoformat(),
            'pages_crawled': pages_crawled,
            'links_discovered': links_collected,
            'status': 'completed',
            'reason': 'finished',
            'source': 'crawler_wrapper',
            'projectId': args.project_id,
            'sessionId': args.session_id
        }, retries=5)
    except Exception as e:
        logger.error(f"❌ Crawler process failed: {e}")
        # Emit failure event
        publisher.emit_event(args.job_id, 'JOB_FAILED', {
            'url': args.url,
            'failed_at': datetime.now().isoformat(),
            'error': str(e),
            'status': 'failed',
            'reason': 'exception',
            'source': 'crawler_wrapper',
            'projectId': args.project_id,
            'sessionId': args.session_id
        }, retries=5)
        sys.exit(1)


if __name__ == "__main__":
    main()

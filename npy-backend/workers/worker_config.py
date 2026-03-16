"""
Worker Configuration
Shared settings for all workers
"""

import os

from utils.config import config


# Scrapy crawler settings
SCRAPY_SETTINGS = {
    "LOG_ENABLED": False,
    "ROBOTSTXT_OBEY": False,
    "CONCURRENT_REQUESTS": 64,
    "CONCURRENT_REQUESTS_PER_DOMAIN": 32,
    "DOWNLOAD_DELAY": 0.05,
    "RANDOMIZE_DOWNLOAD_DELAY": True,
    "AUTOTHROTTLE_ENABLED": False,
    "AUTOTHROTTLE_START_DELAY": 0.5,
    "AUTOTHROTTLE_MAX_DELAY": 10.0,
    "AUTOTHROTTLE_TARGET_CONCURRENCY": 32.0,
    "RETRY_ENABLED": True,
    "RETRY_TIMES": 3,
    "RETRY_HTTP_CODES": [429, 500, 502, 503, 504],
    "CLOSESPIDER_PAGECOUNT": config.MAX_CRAWL_PAGES,
    "COOKIES_ENABLED": False,
    "DEFAULT_REQUEST_HEADERS": {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0 Safari/537.36"
        ),
    },
    "MONGO_URI": config.MONGO_URI,
    "MONGO_DATABASE": config.MONGO_DB_NAME,
    "MONGO_BATCH_SIZE": 50,
    "ITEM_PIPELINES": {
        "workers.crawl_worker.pipelines.mongo_pipeline.MongoPipeline": 300,
    },
    "REQUEST_FINGERPRINTER_IMPLEMENTATION": "2.7",
    "REACTOR_THREADPOOL_MAXSIZE": 30,

    # Scrapy Redis Settings
    "SCHEDULER": "scrapy_redis.scheduler.Scheduler",
    "DUPEFILTER_CLASS": "scrapy_redis.dupefilter.RFPDupeFilter",
    "REDIS_URL": config.REDIS_URL,
    # Default to non-persistent scheduler state to avoid stale Redis queues
    # accumulating indefinitely for abandoned jobs. Enable explicitly when
    # resumable distributed crawl queues are required.
    "SCHEDULER_PERSIST": os.getenv("SCRAPY_SCHEDULER_PERSIST", "false").lower() == "true",
    "SCHEDULER_QUEUE_CLASS": "scrapy_redis.queue.PriorityQueue",
    # Close spider if Redis queue is empty for 10 seconds to prevent hanging
    "SCHEDULER_IDLE_BEFORE_CLOSE": 10,
}


# Worker pool configuration
POOL_SIZE_PER_CATEGORY = 2
TOTAL_POOL_SIZE = 8

"""
Worker Configuration
Shared settings for all workers
"""

from utils.config import config


# Scrapy crawler settings
SCRAPY_SETTINGS = {
    "LOG_ENABLED": False,
    "ROBOTSTXT_OBEY": False,
    "CONCURRENT_REQUESTS": 4,
    "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
    "DOWNLOAD_DELAY": 1.0,
    "RANDOMIZE_DOWNLOAD_DELAY": True,
    "AUTOTHROTTLE_ENABLED": True,
    "AUTOTHROTTLE_START_DELAY": 1.5,
    "AUTOTHROTTLE_MAX_DELAY": 10.0,
    "AUTOTHROTTLE_TARGET_CONCURRENCY": 1.0,
    "RETRY_ENABLED": True,
    "RETRY_TIMES": 5,
    "RETRY_HTTP_CODES": [429, 500, 502, 503, 504],
    "CLOSESPIDER_PAGECOUNT": 3000,
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
    "MONGO_BATCH_SIZE": 10,
    "ITEM_PIPELINES": {
        "workers.crawl_worker.pipelines.mongo_pipeline.MongoPipeline": 300,
    },
}


# Worker pool configuration
POOL_SIZE_PER_CATEGORY = 2
TOTAL_POOL_SIZE = 8

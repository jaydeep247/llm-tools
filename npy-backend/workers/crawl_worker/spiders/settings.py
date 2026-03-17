"""
Scrapy Settings
Configuration for the website spider
"""

import os

# Scrapy settings for website crawler

BOT_NAME = 'website_crawler'

SPIDER_MODULES = ['workers.crawl_worker.spiders']
NEWSPIDER_MODULE = 'workers.crawl_worker.spiders'

# Crawl responsibly
ROBOTSTXT_OBEY = False
USER_AGENT = 'Mozilla/5.0 (compatible; WebCrawler/1.0; +http://www.example.com/bot)'

# Configure maximum concurrent requests
# SPEED OPTIMIZATION
CONCURRENT_REQUESTS = 96
CONCURRENT_REQUESTS_PER_DOMAIN = 48

# Configure a delay for requests for the same website
DOWNLOAD_DELAY = 0
DOWNLOAD_TIMEOUT = 20
RETRY_TIMES = 1

# Disable cookies (unless needed)
COOKIES_ENABLED = False

# AutoThrottle (Adaptive Throttling)
AUTOTHROTTLE_ENABLED = False
AUTOTHROTTLE_START_DELAY = 0.5
AUTOTHROTTLE_MAX_DELAY = 60.0
AUTOTHROTTLE_TARGET_CONCURRENCY = 8.0
AUTOTHROTTLE_DEBUG = False

# MongoDB Settings
MONGO_BATCH_SIZE = 200  # Increased for high concurrency
ITEM_PIPELINES = {
    'workers.crawl_worker.spiders.pipelines.JsonStoragePipeline': 300,
    'workers.crawl_worker.pipelines.mongo_pipeline.MongoPipeline': 400,
}

# MongoDB Settings
MONGO_URI = os.getenv('MONGO_URI')
MONGO_DATABASE = os.getenv('MONGO_DB_NAME')

# Crawl page limit (0 = unlimited)
CLOSESPIDER_PAGECOUNT = int(os.getenv('MAX_CRAWL_PAGES', '3000'))

# Enable and configure HTTP caching (optional)
HTTPCACHE_ENABLED = False

# Logging — only show ERRORs; the noise-filter extension suppresses the
# spurious 'Engine slot not assigned' Twisted panic emitted while idle.
LOG_LEVEL = 'ERROR'
LOG_ENABLED = True

EXTENSIONS = {
    'workers.crawl_worker.extensions.log_filter.SuppressEngineSlotNoise': 100,
}

# Set settings whose default value is deprecated to a future-proof value
REQUEST_FINGERPRINTER_IMPLEMENTATION = '2.7'
TWISTED_REACTOR = 'twisted.internet.asyncioreactor.AsyncioSelectorReactor'
FEED_EXPORT_ENCODING = 'utf-8'

# Scrapy Redis Settings
SCHEDULER = "scrapy_redis.scheduler.Scheduler"

SCHEDULER_PERSIST = os.getenv('SCRAPY_SCHEDULER_PERSIST', 'false').lower() == 'true'
DUPEFILTER_CLASS = "scrapy_redis.dupefilter.RFPDupeFilter"
# Use REDIS_URL if available (takes precedence), otherwise fallback to host/port
REDIS_URL = os.getenv('REDIS_URL')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))
SCHEDULER_QUEUE_CLASS = "scrapy_redis.queue.PriorityQueue"

# Critical: Close spider if Redis queue is empty for 5 seconds
# This prevents the spider from hanging indefinitely in distributed mode
SCHEDULER_IDLE_BEFORE_CLOSE = 5

# Performance Tuning
REACTOR_THREADPOOL_MAXSIZE = 80
CONCURRENT_ITEMS = 200


# NOTE: These standard Scrapy queue settings are ignored when using Scrapy-Redis (SCHEDULER above)
# SCHEDULER_MEMORY_QUEUE = "scrapy.squeues.FifoMemoryQueue"
# SCHEDULER_DISK_QUEUE = "scrapy.squeues.PickleFifoDiskQueue"

REDIS_PARAMS = {
    "socket_timeout": 30,
    "socket_connect_timeout": 30,
    "retry_on_timeout": True,
}

# Allow 4xx/5xx HTTP responses to be processed by the spider instead of errback
HTTPERROR_ALLOW_ALL = True

# Logging — WARNING suppresses scrapy.* framework startup spam;
# application [npy-backend] logs use their own handler (see utils/logger.py)
LOG_LEVEL = 'WARNING'

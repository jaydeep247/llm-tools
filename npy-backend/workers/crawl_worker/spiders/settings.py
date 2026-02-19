"""
Scrapy Settings
Configuration for the website spider
"""

# Scrapy settings for website crawler

BOT_NAME = 'website_crawler'

SPIDER_MODULES = ['workers.crawl_worker.spiders']
NEWSPIDER_MODULE = 'workers.crawl_worker.spiders'

# Crawl responsibly
ROBOTSTXT_OBEY = True
USER_AGENT = 'Mozilla/5.0 (compatible; WebCrawler/1.0; +http://www.example.com/bot)'

# Configure maximum concurrent requests
CONCURRENT_REQUESTS = 5
CONCURRENT_REQUESTS_PER_DOMAIN = 5

# Configure a delay for requests for the same website
DOWNLOAD_DELAY = 0.5

# Disable cookies (unless needed)
COOKIES_ENABLED = False

# Configure item pipelines
ITEM_PIPELINES = {
    'workers.crawl_worker.spiders.pipelines.JsonStoragePipeline': 300,
}

# Enable and configure HTTP caching (optional)
HTTPCACHE_ENABLED = False

# Set settings whose default value is deprecated to a future-proof value
REQUEST_FINGERPRINTER_IMPLEMENTATION = '2.7'
TWISTED_REACTOR = 'twisted.internet.asyncioreactor.AsyncioSelectorReactor'
FEED_EXPORT_ENCODING = 'utf-8'

# Logging
LOG_LEVEL = 'WARNING'

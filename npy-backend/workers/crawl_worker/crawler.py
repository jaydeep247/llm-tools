"""
Crawl Worker
Executes website crawling using Scrapy spider via subprocess
"""

from typing import Dict, Any
from workers.base_worker import BaseWorker
from utils.logger import logger
import uuid
import os
import subprocess
import json


class CrawlWorker(BaseWorker):
    async def execute(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a CRAWL job using Scrapy spider.
        
        Args:
            job: Job dictionary containing crawl configuration
            
        Returns:
            Dictionary with crawl results and storage paths
        """
        # Extract configuration
        config = job.get("config", {})
        url = config.get("url", "https://example.com")
        allow_subdomains = config.get("allow_subdomains", True)
        max_concurrency = config.get("max_concurrency", 5)
        max_pages = config.get("max_pages", 100)  # Default: 100 pages
        timeout = config.get("timeout", 300)  # Default: 5 minutes
        
        # Generate session ID
        session_id = job.get("id", str(uuid.uuid4()))
        
        logger.info(f"Starting Scrapy crawl for: {url}")
        logger.info(f"Session ID: {session_id}")
        logger.info(f"Allow subdomains: {allow_subdomains}")
        logger.info(f"Max concurrency: {max_concurrency}")
        logger.info(f"Max pages: {max_pages if max_pages > 0 else 'unlimited'}")
        logger.info(f"Timeout: {timeout if timeout > 0 else 'unlimited'} seconds")
        
        try:
            # Create a Python script to run the spider
            script_content = f"""
import sys
from scrapy.crawler import CrawlerProcess
from scrapy.utils.log import configure_logging

# Add parent directory to path
sys.path.insert(0, '{os.getcwd()}')

from workers.crawl_worker.spiders.website_spider import WebsiteSpider

configure_logging({{'LOG_LEVEL': 'INFO'}})

settings = {{
    'CONCURRENT_REQUESTS': {max_concurrency},
    'ROBOTSTXT_OBEY': True,
    'USER_AGENT': 'Mozilla/5.0 (compatible; WebCrawler/1.0)',
    'DOWNLOAD_DELAY': 0.5,
    'COOKIES_ENABLED': False,
    'ITEM_PIPELINES': {{
        'workers.crawl_worker.spiders.pipelines.JsonStoragePipeline': 300,
    }},
    'LOG_LEVEL': 'INFO',
    'REQUEST_FINGERPRINTER_IMPLEMENTATION': '2.7',
    'FEED_EXPORT_ENCODING': 'utf-8',
}}

process = CrawlerProcess(settings)
process.crawl(
    WebsiteSpider,
    start_url='{url}',
    session_id='{session_id}',
    allow_subdomains={allow_subdomains},
    max_concurrency={max_concurrency},
    max_pages={max_pages},
    timeout={timeout},
)
process.start()
"""
            
            # Write script to temp file
            script_path = f"/tmp/scrapy_crawl_{session_id}.py"
            with open(script_path, 'w') as f:
                f.write(script_content)
            
            # Run the script as a subprocess
            logger.info("Running Scrapy spider in subprocess...")
            
            # Use timeout + 60 seconds buffer for subprocess
            subprocess_timeout = (timeout + 60) if timeout > 0 else None
            
            # Stream output directly to terminal (stdout/stderr)
            result = subprocess.run(
                [f"{os.getcwd()}/venv/bin/python", script_path],
                timeout=subprocess_timeout,
            )
            
            # Clean up script file
            os.remove(script_path)
            
            if result.returncode != 0:
                logger.error(f"Scrapy process failed with exit code {result.returncode}")
                raise Exception(f"Scrapy crawl failed with exit code {result.returncode}")
            
            # Get storage path
            storage_path = os.path.join("./data", session_id)
            
            logger.info(f"Crawl completed for session: {session_id}")
            logger.info(f"Data stored in: {storage_path}")
            
            return {
                "session_id": session_id,
                "storage_path": storage_path,
                "url": url,
                "status": "completed",
            }
        
        except subprocess.TimeoutExpired:
            error_msg = "Crawl timed out after 5 minutes"
            logger.error(error_msg)
            raise Exception(error_msg)
        except Exception as e:
            error_msg = f"Crawl failed: {str(e)}"
            logger.error(error_msg)
            raise Exception(error_msg)




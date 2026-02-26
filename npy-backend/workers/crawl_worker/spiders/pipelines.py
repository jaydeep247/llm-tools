"""
Scrapy Pipelines
Process and store scraped items to JSON files
"""

import json
import os
from typing import Dict, Any, List
from datetime import datetime
from utils.logger import logger


class JsonStoragePipeline:
    """Store items as JSON files in data folder"""
    
    def __init__(self):
        self.base_path = "./data"
        self.session_data = {}
        self.pages = []
        self.links = []
        self.sitemap_urls = []
    
    def open_spider(self, spider):
        """Initialize when spider opens"""
        self.session_id = getattr(spider, 'session_id', None)
        if not self.session_id:
            # Generate a default session ID if not provided (e.g. distributed crawl)
            self.session_id = f"crawl_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            # Set it back to spider for consistency
            spider.session_id = self.session_id
            
        self.session_path = os.path.join(self.base_path, self.session_id)
        os.makedirs(self.session_path, exist_ok=True)
        
        # Initialize session metadata
        self.session_data = {
            'session_id': self.session_id,
            'start_url': getattr(spider, 'start_url', 'distributed_crawl'),
            'started_at': getattr(spider, 'crawl_started_at', datetime.now().isoformat()),
            'allow_subdomains': getattr(spider, 'allow_subdomains', True),
            'max_concurrency': getattr(spider, 'max_concurrency', 20),
            'status': 'running',
        }
        
        logger.info(f"Initialized storage for session: {self.session_id}")
    
    def close_spider(self, spider):
        """Save all data when spider closes"""
        # Update session metadata
        self.session_data['completed_at'] = datetime.now().isoformat()
        self.session_data['total_pages'] = len(self.pages)
        self.session_data['total_links'] = len(self.links)
        self.session_data['status'] = 'completed'
        
        # Save session metadata
        session_file = os.path.join(self.session_path, 'session.json')
        with open(session_file, 'w', encoding='utf-8') as f:
            json.dump(self.session_data, f, indent=2, ensure_ascii=False)
        
        # Save pages
        pages_file = os.path.join(self.session_path, 'pages.json')
        with open(pages_file, 'w', encoding='utf-8') as f:
            json.dump(self.pages, f, indent=2, ensure_ascii=False)
        
        # Save links
        links_file = os.path.join(self.session_path, 'links.json')
        with open(links_file, 'w', encoding='utf-8') as f:
            json.dump(self.links, f, indent=2, ensure_ascii=False)
        
        # Save sitemap data
        sitemaps_file = os.path.join(self.session_path, 'sitemaps.json')
        sitemap_data = {
            'sitemap_urls': spider.sitemap_data.get('sitemap_urls', []),
            'discovered_urls': self.sitemap_urls,
        }
        with open(sitemaps_file, 'w', encoding='utf-8') as f:
            json.dump(sitemap_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Saved crawl data to {self.session_path}")
        logger.info(f"  - Pages: {len(self.pages)}")
        logger.info(f"  - Links: {len(self.links)}")
        logger.info(f"  - Sitemap URLs: {len(self.sitemap_urls)}")
    
    def process_item(self, item, spider):
        """Process each item"""
        from .items import PageItem, LinkItem, SitemapUrlItem
        
        if isinstance(item, PageItem):
            self.pages.append(dict(item))
        elif isinstance(item, LinkItem):
            self.links.append(dict(item))
        elif isinstance(item, SitemapUrlItem):
            self.sitemap_urls.append(dict(item))
        
        return item

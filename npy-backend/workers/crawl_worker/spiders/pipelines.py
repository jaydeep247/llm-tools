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
        self.resources = []
        self.links = []
        self.sitemap_urls = []
    
    def open_spider(self, spider):
        """Initialize when spider opens"""
        self.session_id = spider.session_id
        self.session_path = os.path.join(self.base_path, self.session_id)
        os.makedirs(self.session_path, exist_ok=True)
        
        # Initialize session metadata
        self.session_data = {
            'session_id': self.session_id,
            'start_url': spider.start_url,
            'started_at': spider.crawl_started_at,
            'allow_subdomains': spider.allow_subdomains,
            'max_concurrency': spider.max_concurrency,
            'status': 'running',
        }
        
        logger.info(f"Initialized storage for session: {self.session_id}")
    
    def close_spider(self, spider):
        """Save all data when spider closes"""
        # Update session metadata
        self.session_data['completed_at'] = datetime.now().isoformat()
        self.session_data['total_pages'] = len(self.pages)
        self.session_data['total_resources'] = len(self.resources)
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
        
        # Save resources
        resources_file = os.path.join(self.session_path, 'resources.json')
        with open(resources_file, 'w', encoding='utf-8') as f:
            json.dump(self.resources, f, indent=2, ensure_ascii=False)
        
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
        logger.info(f"  - Resources: {len(self.resources)}")
        logger.info(f"  - Links: {len(self.links)}")
        logger.info(f"  - Sitemap URLs: {len(self.sitemap_urls)}")
    
    def process_item(self, item, spider):
        """Process each item"""
        from .items import PageItem, ResourceItem, LinkItem, SitemapUrlItem
        
        if isinstance(item, PageItem):
            self.pages.append(dict(item))
        elif isinstance(item, ResourceItem):
            self.resources.append(dict(item))
        elif isinstance(item, LinkItem):
            self.links.append(dict(item))
        elif isinstance(item, SitemapUrlItem):
            self.sitemap_urls.append(dict(item))
        
        return item

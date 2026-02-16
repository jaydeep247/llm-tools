from datetime import datetime
from scrapy.exceptions import DropItem
from utils.mongo import mongo_manager
from utils.logger import logger
from workers.crawl_worker.spiders.items import PageItem, LinkItem, SitemapUrlItem

class MongoPipeline:
    def __init__(self, mongo_uri, mongo_db, batch_size=100):
        self.mongo_uri = mongo_uri
        self.mongo_db = mongo_db
        self.batch_size = batch_size
        
        # Buffers for streaming writes
        self.buffers = {
            'pages': [],
            'links': [],
            'sitemaps': [],
            'fields': []
        }
        
        # Counters for summary
        self.total_counts = {
            'pages': 0,
            'links': 0,
            'sitemaps': 0,
            'fields': 0
        }
        
        self.job_id = None
        self.project_id = None
        self.session_id = None

    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            mongo_uri=crawler.settings.get('MONGO_URI'),
            mongo_db=crawler.settings.get('MONGO_DATABASE'),
            batch_size=crawler.settings.get('MONGO_BATCH_SIZE', 100)
        )

    def open_spider(self, spider):
        """Initialize connection and get job metadata from spider"""
        self.job_id = getattr(spider, 'job_id', None)
        self.project_id = getattr(spider, 'project_id', None)
        self.session_id = getattr(spider, 'session_id', None)
        
        mongo_manager.connect()
        logger.info(f"MongoPipeline (Streaming) initialized for Job {self.job_id}")

    def close_spider(self, spider):
        """Flush remaining buffers and write job summary"""
        try:
            # 1. Flush all remaining items
            for item_type in self.buffers:
                self._flush_buffer(item_type)

            # 2. Write Job Summary document
            summary_doc = {
                'jobId': self.job_id,
                'type': 'job_summary',
                'createdAt': datetime.utcnow(),
                'session': {
                    'session_id': self.session_id,
                    'projectId': self.project_id,
                    'jobId': self.job_id,
                    'start_url': getattr(spider, 'start_url', None),
                    'started_at': getattr(spider, 'crawl_started_at', None),
                    'allow_subdomains': getattr(spider, 'allow_subdomains', True),
                    'max_concurrency': getattr(spider, 'max_concurrency', 20),
                    'status': 'completed',
                    'completed_at': datetime.now().isoformat(),
                    'total_pages': self.total_counts['pages'],
                    'total_links': self.total_counts['links'],
                    'total_sitemaps': self.total_counts['sitemaps'],
                    'total_fields': self.total_counts['fields']
                }
            }
            
            mongo_manager.job_summaries.update_one(
                {'jobId': self.job_id},
                {'$set': summary_doc},
                upsert=True
            )
            logger.info(f"Job {self.job_id} complete. Summary: {self.total_counts['pages']} pages, {self.total_counts['links']} links.")
            
        except Exception as e:
            logger.error(f"Error finalizing job {self.job_id} in MongoDB: {e}")
        finally:
            mongo_manager.close()

    def process_item(self, item, spider):
        """Buffer items and flush periodically to respective collections"""
        item_dict = dict(item)
        item_dict['jobId'] = self.job_id # Ensure all documents linked by jobId
        item_dict['createdAt'] = datetime.utcnow()
        
        target_buffer = None
        
        if isinstance(item, PageItem):
            if not item_dict.get('url'): return item
            
            # Extract fields for separate collection
            if 'fields' in item_dict:
                fields_data = item_dict.pop('fields') # Remove from page document
                
                # Create separate fields document
                fields_doc = {
                    'jobId': self.job_id,
                    'url': item_dict['url'],
                    'createdAt': datetime.utcnow(),
                    **fields_data # Flatten: status, website_crawler, Wordcount_analysis, etc.
                }
                
                # Buffer fields
                self.buffers['fields'].append(fields_doc)
                self.total_counts['fields'] += 1
                
                if len(self.buffers['fields']) >= self.batch_size:
                    self._flush_buffer('fields')
            
            target_buffer = 'pages'
        elif isinstance(item, LinkItem):
            target_buffer = 'links'
        elif isinstance(item, SitemapUrlItem):
            if not item_dict.get('url'): return item
            target_buffer = 'sitemaps'
            
        if target_buffer:
            self.buffers[target_buffer].append(item_dict)
            self.total_counts[target_buffer] += 1
            
            if len(self.buffers[target_buffer]) >= self.batch_size:
                self._flush_buffer(target_buffer)
                
        return item

    def _flush_buffer(self, item_type):
        """Write a specific buffer to MongoDB"""
        buffer = self.buffers[item_type]
        if not buffer:
            return
            
        try:
            collection = getattr(mongo_manager, item_type)
            collection.insert_many(buffer, ordered=False)
            self.buffers[item_type] = []
        except Exception as e:
            logger.error(f"Failed to flush {item_type} buffer for Job {self.job_id}: {e}")
            self.buffers[item_type] = [] # Clear even on error to prevent memory bloat

from twisted.internet import threads, defer
from datetime import datetime
from scrapy.exceptions import DropItem
from pymongo import UpdateOne
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

    @defer.inlineCallbacks
    def close_spider(self, spider):
        """Flush all buffers and update job summary"""
        try:
            logger.info(f"Closing spider for Job {self.job_id}. Buffers: { {k: len(v) for k, v in self.buffers.items()} }")
            
            # 1. Flush all remaining items
            for item_type in self.buffers:
                try:
                    yield self._flush_buffer(item_type)
                except Exception as e:
                    logger.error(f"Error flushing {item_type} buffer: {e}")

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
            
            def _write_summary(doc):
                try:
                    # Ensure connection is alive
                    if mongo_manager.job_summaries is None:
                        mongo_manager.connect()
                        
                    mongo_manager.job_summaries.update_one(
                        {'jobId': self.job_id},
                        {'$set': doc},
                        upsert=True
                    )
                    logger.info(f"Job summary written for {self.job_id}")
                    
                    # Also update jobs collection stats
                    mongo_manager.db.jobs.update_one(
                        {'id': self.job_id},
                        {'$set': {
                            'status': 'completed', 
                            'completedAt': datetime.now().isoformat(),
                            'pagesCrawled': self.total_counts['pages'],
                            'linksFound': self.total_counts['links']
                        }}
                    )
                except Exception as ex:
                    logger.error(f"Failed to write summary/stats: {ex}")
            
            yield threads.deferToThread(_write_summary, summary_doc)
            
            logger.info(
                f"Job {self.job_id} complete. Pages: {self.total_counts['pages']}, "
                f"Links: {self.total_counts['links']}, "
                f"Sitemaps: {self.total_counts['sitemaps']}, "
                f"Fields: {self.total_counts['fields']}"
            )
            
        except Exception as e:
            error_type = type(e).__name__
            import traceback
            logger.error(f"Error finalizing job {self.job_id} in MongoDB ({error_type}): {traceback.format_exc()}")
        # finally:
        #    mongo_manager.close() # Do NOT close global connection to avoid race conditions

    def process_item(self, item, spider):
        """Buffer items and flush periodically to respective collections"""
        item_dict = dict(item)
        # Prefer job_id from item, fallback to spider's initial job_id
        item_dict['jobId'] = item.get('job_id') or self.job_id 
        
        # Update pipeline's job_id if we found one and didn't have one
        if not self.job_id and item_dict['jobId']:
             self.job_id = item_dict['jobId']
             self.project_id = getattr(spider, 'project_id', None)
             self.session_id = getattr(spider, 'session_id', None)
        
        if not item_dict['jobId']:
             # If no job ID, we can't save it properly. Log warning?
             # But keep going to avoid crashing
             pass
        item_dict['createdAt'] = datetime.utcnow()
        
        target_buffer = None
        deferreds = []
        
        if isinstance(item, PageItem):
            if not item_dict.get('url'): return item
            
            # Extract fields for separate collection
            if 'fields' in item_dict:
                fields_data = item_dict.pop('fields') # Remove from page document
                
                # Create separate fields document
                fields_doc = {
                    'jobId': item_dict['jobId'],
                    'url': item_dict['url'],
                    'createdAt': datetime.utcnow(),
                    **fields_data # Flatten: status, website_crawler, Wordcount_analysis, etc.
                }
                
                # Buffer fields
                self.buffers['fields'].append(fields_doc)
                self.total_counts['fields'] += 1
                
                if len(self.buffers['fields']) >= self.batch_size:
                    deferreds.append(self._flush_buffer('fields'))
            
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
                deferreds.append(self._flush_buffer(target_buffer))
        
        if deferreds:
            return defer.DeferredList(deferreds).addCallback(lambda _: item)
                
        return item

    def _flush_buffer(self, item_type):
        """Write a specific buffer to MongoDB (Async)"""
        buffer = self.buffers[item_type]
        if not buffer:
            return defer.succeed(None)
            
        # Clear buffer immediately for new items
        self.buffers[item_type] = []
        
        def _write_to_mongo(data_buffer):
                try:
                    collection = getattr(mongo_manager, item_type)
                    if collection is None:
                        logger.error(f"Collection {item_type} not found in MongoManager")
                        return

                    logger.info(f"Flushing {len(data_buffer)} items to {item_type} collection")
                    
                    if item_type in ['pages', 'fields', 'sitemaps']:
                        operations = []
                        for item in data_buffer:
                            # Use URL and JobID as unique key
                            # Ensure we have required fields
                            if 'jobId' not in item or 'url' not in item:
                                logger.warning(f"Skipping item in {item_type} due to missing jobId or url")
                                continue
                                
                            filter_query = {'jobId': item['jobId'], 'url': item['url']}
                            operations.append(UpdateOne(
                                filter_query,
                                {'$set': item},
                                upsert=True
                            ))
                        
                        if operations:
                            result = collection.bulk_write(operations, ordered=False)
                            logger.info(f"Successfully processed {len(operations)} items in {item_type} (Matched: {result.matched_count}, Upserted: {result.upserted_count})")
                    else:
                        # For links or other collections, keep insert_many for speed/behavior
                        result = collection.insert_many(data_buffer, ordered=False)
                        logger.info(f"Successfully inserted {len(result.inserted_ids)} items into {item_type}")
                        
                except Exception as e:
                    error_type = type(e).__name__
                    import traceback
                    logger.error(f"Failed to flush {item_type} buffer for Job {self.job_id}: {str(e)}\n{traceback.format_exc()}")

        return threads.deferToThread(_write_to_mongo, buffer)

import os
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from typing import Optional
from utils.logger import logger
from utils.config import config

class MongoManager:
    _instance: Optional['MongoManager'] = None
    _client: Optional[MongoClient] = None
    _db: Optional[Database] = None

    def __init__(self):
        if MongoManager._instance is not None:
            raise Exception("This class is a singleton!")
        
        self.mongo_uri = config.MONGO_URI
        self.db_name = config.MONGO_DB_NAME
        
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = MongoManager()
        return cls._instance
    
    def connect(self):
        if self._client is None:
            try:
                logger.info(f"Connecting to MongoDB at {self.mongo_uri}...")
                self._client = MongoClient(self.mongo_uri)
                self._db = self._client[self.db_name]
                
                # Check connection
                self._client.admin.command('ping')
                logger.info("Successfully connected to MongoDB")
                
                # Ensure indexes on startup
                self._ensure_indexes()
            except Exception as e:
                logger.error(f"Failed to connect to MongoDB: {e}")
                raise e
    
    def _ensure_indexes(self):
        """Create mandatory indexes at startup"""
        if self._db is not None:
            pages = self._db.pages
            # 1. Job ID index (Critical for cleanup and retrieval)
            pages.create_index("jobId")
            
            # 2. URL index (For uniqueness and lookups)
            pages.create_index("url")
            
            # 3. Compound index (Optional but good for job-scoped lookups)
            pages.create_index([("jobId", 1), ("url", 1)])

            # 4. Links and Sitemaps indexes
            self._db.links.create_index("jobId")
            self._db.sitemaps.create_index("jobId")
            self._db.fields.create_index("jobId")
            self._db.fields.create_index([("jobId", 1), ("url", 1)])
            self._db.job_summaries.create_index("jobId")
            
            logger.info("MongoDB indexes verified")

    @property
    def db(self) -> Database:
        if self._db is None:
            self.connect()
        return self._db
    
    @property
    def pages(self) -> Collection:
        return self.db.pages

    @property
    def links(self) -> Collection:
        return self.db.links

    @property
    def sitemaps(self) -> Collection:
        return self.db.sitemaps

    @property
    def job_summaries(self) -> Collection:
        return self.db.job_summaries

    @property
    def fields(self) -> Collection:
        return self.db.fields

    def close(self):
        if self._client:
            self._client.close()
            self._client = None
            logger.info("MongoDB connection closed")

# Global instance
mongo_manager = MongoManager.get_instance()

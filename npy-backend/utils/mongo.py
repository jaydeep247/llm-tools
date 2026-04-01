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
                self._client = MongoClient(
                    self.mongo_uri,
                    serverSelectionTimeoutMS=5000,
                    connectTimeoutMS=10000,
                    socketTimeoutMS=45000,
                    maxPoolSize=config.MONGO_MAX_POOL_SIZE,
                    minPoolSize=config.MONGO_MIN_POOL_SIZE,
                    maxIdleTimeMS=config.MONGO_MAX_IDLE_TIME_MS,
                    waitQueueTimeoutMS=config.MONGO_WAIT_QUEUE_TIMEOUT_MS,
                )
                self._db = self._client[self.db_name]
                
                # Check connection
                self._client.admin.command('ping')
                logger.info("Successfully connected to MongoDB")
                
                # Ensure indexes on startup
                self._ensure_indexes()
            except Exception as e:
                error_type = type(e).__name__
                logger.error(f"Failed to connect to MongoDB ({error_type})")
                raise e
    
    def _ensure_indexes(self):
        """Create mandatory indexes at startup"""
        if self._db is not None:
            pages = self._db.pages
            pages.create_index("jobId")
            pages.create_index("url")
            pages.create_index([("jobId", 1), ("url", 1)])
            pages.create_index([("jobId", 1), ("createdAt", 1)])

            self._db.links.create_index("jobId")
            self._db.links.create_index([("jobId", 1), ("createdAt", 1)])
            self._db.sitemaps.create_index("jobId")
            self._db.sitemaps.create_index([("jobId", 1), ("createdAt", 1)])
            self._db.fields.create_index("jobId")
            self._db.fields.create_index([("jobId", 1), ("url", 1)])
            self._db.fields.create_index([("jobId", 1), ("createdAt", 1)])
            self._db.sessions.create_index([("projectId", 1), ("createdAt", -1)])
            self._db.sessions.create_index([("projectId", 1), ("status", 1), ("createdAt", -1)])
            self._db.jobs.create_index([("sessionId", 1), ("createdAt", -1)])
            self._db.projects.create_index([("userId", 1), ("status", 1), ("createdAt", -1)])
            # job_summaries: unique+sparse index on jobId.
            # An older non-unique index with the same auto-generated name
            # ("jobId_1") may exist from a previous deployment.  MongoDB
            # rejects create_index when the name matches but the spec differs
            # (code 86 IndexKeySpecsConflict), so we drop the stale index
            # first and then recreate with the correct options.
            try:
                self._db.job_summaries.create_index(
                    "jobId",
                    unique=True,
                    sparse=True,
                )
            except Exception as idx_err:
                from pymongo.errors import OperationFailure
                if isinstance(idx_err, OperationFailure) and idx_err.code == 86:
                    logger.warning(
                        "job_summaries.jobId_1 index spec conflict — dropping stale "
                        "index and recreating with unique+sparse options."
                    )
                    try:
                        self._db.job_summaries.drop_index("jobId_1")
                    except Exception:
                        pass
                    self._db.job_summaries.create_index(
                        "jobId",
                        unique=True,
                        sparse=True,
                    )
                else:
                    raise
            self._db.module_e.create_index("jobId", unique=True)
            self._db.module_f.create_index("jobId", unique=True)
            self._db.module_f.create_index([("sessionId", 1), ("updatedAt", -1)])
            self._db.module_c.create_index("jobId")
            self._db.module_c.create_index([("jobId", 1), ("url", 1)])
            self._db.module_c.create_index([("jobId", 1), ("timestamp", -1)])
            self._db.performance_audits.create_index([("jobId", 1), ("device", 1), ("runAt", -1)])
            self._db.serp_results.create_index("jobId", unique=True)
            self._db.serp_results.create_index("sessionId")

            # HTML dedup index: one entry per (project, url)
            self._db.html_dedup.create_index(
                [("project_id", 1), ("url_hash", 1)],
                unique=True,
            )
            
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

    @property
    def schemas(self) -> Collection:
        return self.db.schemas

    @property
    def content_metrics(self) -> Collection:
        return self.db.content_metrics

    @property
    def schemas(self) -> Collection:
        return self.db.schemas

    @property
    def content_metrics(self) -> Collection:
        return self.db.content_metrics

    @property
    def module_e(self) -> Collection:
        return self.db.module_e

    @property
    def module_f(self) -> Collection:
        return self.db.module_f

    @property
    def module_c(self) -> Collection:
        return self.db.module_c

    @property
    def serp_results(self) -> Collection:
        return self.db.serp_results

    @property
    def html_dedup(self) -> Collection:
        return self.db.html_dedup

    def close(self):
        if self._client:
            self._client.close()
            self._client = None
            self._db = None
            logger.info("MongoDB connection closed")

# Global instance
mongo_manager = MongoManager.get_instance()


def get_db():
    """Return the MongoDB database instance.

    Convenience helper so callers can write::

        from utils.mongo import get_db
        db = get_db()
    """
    return mongo_manager.db

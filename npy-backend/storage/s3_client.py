"""
S3 Storage Client for DigitalOcean Spaces
Provides async/sync methods for storing and retrieving raw HTML files.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional
import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError, NoCredentialsError

from utils.config import config
from utils.logger import logger


class S3StorageClient:
    """
    S3-compatible storage client for DigitalOcean Spaces.
    Handles raw HTML storage with job_id-based keys.
    """
    
    _instance: Optional['S3StorageClient'] = None
    _executor = ThreadPoolExecutor(max_workers=4)
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
            
        self._initialized = True
        self._client = None
        self._bucket = config.S3_BUCKET_NAME
        self._enabled = config.S3_ENABLED
        
        if self._enabled:
            self._init_client()
    
    def _init_client(self):
        """Initialize the boto3 S3 client"""
        try:
            session = boto3.session.Session()
            self._client = session.client(
                's3',
                region_name=config.S3_REGION,
                endpoint_url=config.S3_ENDPOINT_URL,
                aws_access_key_id=config.S3_ACCESS_KEY_ID,
                aws_secret_access_key=config.S3_SECRET_ACCESS_KEY,
                config=BotoConfig(
                    signature_version='s3v4',
                    retries={'max_attempts': 3, 'mode': 'standard'}
                )
            )
            logger.info(f"✅ S3 client initialized for bucket: {self._bucket}")
        except Exception as e:
            logger.error(f"❌ Failed to initialize S3 client: {e}")
            self._client = None
    
    @property
    def is_enabled(self) -> bool:
        """Check if S3 storage is enabled and client is ready"""
        return self._enabled and self._client is not None
    
    def _get_key(self, job_id: str, filename: str = "source.html") -> str:
        """Generate S3 key for a job's file"""
        return f"raw_html/{job_id}/{filename}"
    
    # ─── SYNC METHODS ────────────────────────────────────────────────────────
    
    def save_sync(self, job_id: str, content: str, filename: str = "source.html") -> str:
        """
        Synchronously save content to S3.
        
        Args:
            job_id: Job identifier
            content: HTML content to store
            filename: Filename within the job folder
            
        Returns:
            S3 URI of the saved object
        """
        if not self.is_enabled:
            raise RuntimeError("S3 storage is not enabled")
        
        key = self._get_key(job_id, filename)
        
        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=content.encode('utf-8'),
                ContentType='text/html; charset=utf-8',
                ACL='private',
                Metadata={
                    'job_id': job_id,
                }
            )
            uri = f"s3://{self._bucket}/{key}"
            return uri
        except ClientError as e:
            logger.error(f"❌ S3 save failed for {key}: {e}")
            raise
    
    def load_sync(self, job_id: str, filename: str = "source.html") -> str:
        """
        Synchronously load content from S3.
        
        Args:
            job_id: Job identifier
            filename: Filename within the job folder
            
        Returns:
            Content as string, empty string if not found
        """
        if not self.is_enabled:
            raise RuntimeError("S3 storage is not enabled")
        
        key = self._get_key(job_id, filename)
        
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            content = response['Body'].read().decode('utf-8')
            return content
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                return ""
            logger.error(f"❌ S3 load failed for {key}: {e}")
            raise
    
    def exists_sync(self, job_id: str, filename: str = "source.html") -> bool:
        """Check if a file exists in S3"""
        if not self.is_enabled:
            return False
        
        key = self._get_key(job_id, filename)
        
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False
    
    def delete_sync(self, job_id: str, filename: str = "source.html") -> bool:
        """Delete a file from S3"""
        if not self.is_enabled:
            return False
        
        key = self._get_key(job_id, filename)
        
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError as e:
            logger.error(f"❌ S3 delete failed for {key}: {e}")
            return False
    
    # ─── RAW KEY METHODS (for dedup / content-addressable storage) ───────────

    def save_by_key_sync(self, key: str, content: str) -> str:
        """
        Save content to S3 using an explicit full key (no job_id prefix).
        Used by the HTML dedup layer.
        """
        if not self.is_enabled:
            raise RuntimeError("S3 storage is not enabled")

        try:
            self._client.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=content.encode('utf-8'),
                ContentType='text/html; charset=utf-8',
                ACL='private',
            )
            return f"s3://{self._bucket}/{key}"
        except ClientError as e:
            logger.error(f"❌ S3 save_by_key failed for {key}: {e}")
            raise

    def load_by_key_sync(self, key: str) -> str:
        """
        Load content from S3 using an explicit full key (no job_id prefix).
        Used by the HTML dedup layer.
        """
        if not self.is_enabled:
            raise RuntimeError("S3 storage is not enabled")

        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            return response['Body'].read().decode('utf-8')
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                return ""
            logger.error(f"❌ S3 load_by_key failed for {key}: {e}")
            raise

    def delete_by_key_sync(self, key: str) -> bool:
        """Delete a file from S3 using an explicit full key."""
        if not self.is_enabled:
            return False

        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError as e:
            logger.error(f"❌ S3 delete_by_key failed for {key}: {e}")
            return False

    # ─── ASYNC METHODS ───────────────────────────────────────────────────────
    
    async def save(self, job_id: str, content: str, filename: str = "source.html") -> str:
        """Async wrapper for save_sync"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            self.save_sync,
            job_id,
            content,
            filename
        )
    
    async def load(self, job_id: str, filename: str = "source.html") -> str:
        """Async wrapper for load_sync"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            self.load_sync,
            job_id,
            filename
        )
    
    async def exists(self, job_id: str, filename: str = "source.html") -> bool:
        """Async wrapper for exists_sync"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            self.exists_sync,
            job_id,
            filename
        )
    
    async def delete(self, job_id: str, filename: str = "source.html") -> bool:
        """Async wrapper for delete_sync"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            self._executor,
            self.delete_sync,
            job_id,
            filename
        )

    async def save_by_key(self, key: str, content: str) -> str:
        """Async wrapper for save_by_key_sync"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, self.save_by_key_sync, key, content)

    async def load_by_key(self, key: str) -> str:
        """Async wrapper for load_by_key_sync"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self._executor, self.load_by_key_sync, key)


# Global singleton instance
s3_storage = S3StorageClient()

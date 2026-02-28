import os
import aiofiles
import json
from abc import ABC, abstractmethod
from typing import Any, Dict
from utils.logger import logger

class StorageBackend(ABC):
    @abstractmethod
    async def save_crawl_data(self, job_id: str, url: str, content: str, metadata: Dict[str, Any]) -> str:
        """Save HTML content and metadata. Returns the storage path/URI."""
        pass

    @abstractmethod
    async def save_analysis_result(self, job_id: str, result: Dict[str, Any]) -> str:
        """Save analysis result JSON. Returns the storage path/URI."""
        pass

class LocalObjectStore(StorageBackend):
    def __init__(self, base_path: str = "./data"):
        self.base_path = base_path
        os.makedirs(self.base_path, exist_ok=True)

    def _get_job_path(self, job_id: str) -> str:
        path = os.path.join(self.base_path, job_id)
        os.makedirs(path, exist_ok=True)
        return path

    async def save_crawl_data(self, job_id: str, url: str, content: str, metadata: Dict[str, Any]) -> str:
        try:
            job_dir = self._get_job_path(job_id)
            
            # Sanitize URL for filename (basic hash or safe chars)
            # For simplicity, using a simple counter or hash would be better in prod, 
            # here we'll assume the URL is unique enough or just use a timestamp based name if needed.
            # actually better to just hash the CLI
            import hashlib
            url_hash = hashlib.md5(url.encode()).hexdigest()
            
            html_filename = f"{url_hash}.html"
            meta_filename = f"{url_hash}.json"
            
            html_path = os.path.join(job_dir, html_filename)
            meta_path = os.path.join(job_dir, meta_filename)
            
            # Write HTML
            async with aiofiles.open(html_path, 'w', encoding='utf-8') as f:
                await f.write(content)
                
            # Write Metadata
            meta_payload = {
                "url": url,
                "job_id": job_id,
                **metadata
            }
            async with aiofiles.open(meta_path, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(meta_payload, indent=2))
                
            return html_path
        except Exception as e:
            logger.error(f"Storage error for job {job_id}: {str(e)}")
            raise

    async def save_analysis_result(self, job_id: str, result: Dict[str, Any]) -> str:
        try:
            job_dir = self._get_job_path(job_id)
            result_path = os.path.join(job_dir, "analysis_result.json")
            
            async with aiofiles.open(result_path, 'w', encoding='utf-8') as f:
                await f.write(json.dumps(result, indent=2))
                
            return result_path
        except Exception as e:
            logger.error(f"Storage error for job {job_id}: {str(e)}")
            raise

from abc import ABC, abstractmethod
from typing import Dict, Any
from clients.node_api_client import NodeApiClient
from storage.object_store import StorageBackend
from utils.logger import logger

class BaseWorker(ABC):
    def __init__(self, node_client: NodeApiClient, storage: StorageBackend):
        self.node_client = node_client
        self.storage = storage

    @abstractmethod
    async def execute(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute the job logic.
        Returns a result dictionary causing success, or raises an exception for failure.
        """
        pass

    async def run(self, job: Dict[str, Any]):
        """
        Wrapper to handle job execution lifecycle.
        Assumes job is already claimed (RUNNING).
        """
        job_id = job["id"]
        try:
            logger.info(f"Worker starting execution for job {job_id}")
            result = await self.execute(job)
            
            # Store result if any (for non-crawl jobs like analysis)
            if result:
                 await self.storage.save_analysis_result(job_id, result)
            
            await self.node_client.complete_job(job_id)
            logger.info(f"Worker completed job {job_id}")
            
        except Exception as e:
            logger.error(f"Worker failed job {job_id}: {str(e)}")
            await self.node_client.fail_job(job_id, str(e))

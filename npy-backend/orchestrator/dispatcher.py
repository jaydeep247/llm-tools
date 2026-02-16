from typing import Dict, Any, Type
from clients.node_api_client import NodeApiClient
from storage.object_store import StorageBackend
from workers.base_worker import BaseWorker
from workers.crawl_worker.crawler import CrawlWorker
from workers.seo_worker.analyzer import SeoWorker
from utils.logger import logger

class Dispatcher:
    def __init__(self, node_client: NodeApiClient, storage: StorageBackend):
        self.node_client = node_client
        self.storage = storage
        self.worker_map: Dict[str, Type[BaseWorker]] = {
            "CRAWL": CrawlWorker,
            "SEO_ANALYSIS": SeoWorker,
            # "AEO_ANALYSIS": AeoWorker, # Future
            # "SERP_FETCH": SerpWorker, # Future
            # "ENTITY_ANALYSIS": EntityWorker # Future
        }

    async def dispatch(self, job: Dict[str, Any]):
        """
        Dispatch a job to the appropriate worker.
        """
        job_type = job.get("jobType")
        job_id = job.get("id")
        
        if not job_type or job_type not in self.worker_map:
            logger.error(f"Unknown job type: {job_type} for job {job_id}")
            # If we picked it up but can't handle it, fail it.
            # But wait, if we claim it, we MUST update status.
            # We should probably claim it first, then check type?
            # Or check type first? If we check type first and don't know it, we shouldn't claim it.
            # BUT the poller already fetched it. If we don't claim it, it stays PENDING.
            # This is a "poison pill" scenario.
            # Ideally, we should claim it and then fail it if unknown.
            return

        WorkerClass = self.worker_map[job_type]
        worker = WorkerClass(self.node_client, self.storage)
        
        # 1. Claim the job (Mark as RUNNING)
        # We need to ensure we can claim it.
        claimed_job_data = await self.node_client.start_job(job_id)
        
        if not claimed_job_data:
            logger.info(f"Job {job_id} could not be claimed (likely taken by another worker). Skipping.")
            return

        # 2. Execute the job
        # We run this in the same asyncio loop for now. 
        # In a real heavy implementation, we would use a process pool or thread pool if CPU bound.
        # But 'crawling' is IO bound, so asyncio is perfect.
        # 'Analysis' might be CPU bound, so we might need `run_in_executor` later.
        await worker.run(claimed_job_data)

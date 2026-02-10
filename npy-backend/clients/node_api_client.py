import httpx
import os
from typing import Optional, Dict, List, Any
from utils.logger import logger
from tenacity import retry, stop_after_attempt, wait_exponential

class NodeApiClient:
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv("NODE_API_URL", "http://localhost:4000/api/v1")
        self.worker_id = os.getenv("WORKER_ID", "python-worker-1")
        # Use API Key authentication for workers
        self.worker_key = os.getenv("WORKER_API_KEY", "default-insecure-worker-key-change-me")
        
        self.headers = {
            "Content-Type": "application/json",
            "User-Agent": f"npy-worker/{self.worker_id}",
            "x-worker-key": self.worker_key
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def get_pending_jobs(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Fetch pending jobs from Node control plane."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/jobs/pending",
                    params={"limit": limit},
                    headers=self.headers,
                    timeout=10.0
                )
                response.raise_for_status()
                data = response.json()
                if data.get("success"):
                     jobs = data.get("data", [])
                     logger.info(f"Fetched {len(jobs)} pending jobs")
                     return jobs
                else:
                    logger.error(f"Failed to fetch jobs: {data.get('message')}")
                    return []
            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error fetching jobs: {e.response.text}")
                raise
            except Exception as e:
                logger.error(f"Error fetching jobs: {str(e)}")
                raise

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=5))
    async def start_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Mark a job as RUNNING in Node control plane."""
        async with httpx.AsyncClient() as client:
            try:
                logger.info(f"Attempting to claim job {job_id}")
                response = await client.put(
                    f"{self.base_url}/jobs/{job_id}",
                    json={"status": "RUNNING"},
                    headers=self.headers,
                    timeout=5.0
                )
                # 400/403 means another worker might have claimed it or invalid transition
                if response.status_code in [400, 403, 404]:
                     logger.warning(f"Failed to claim job {job_id}: {response.text}")
                     return None
                
                response.raise_for_status()
                data = response.json()
                if data.get("success"):
                    logger.info(f"Successfully claimed job {job_id}")
                    return data.get("data")
                return None
            except Exception as e:
                logger.error(f"Error starting job {job_id}: {str(e)}")
                raise

    @retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def complete_job(self, job_id: str) -> bool:
        """Mark a job as COMPLETED."""
        async with httpx.AsyncClient() as client:
            try:
                logger.info(f"Marking job {job_id} as COMPLETED")
                response = await client.put(
                    f"{self.base_url}/jobs/{job_id}",
                    json={"status": "COMPLETED"},
                    headers=self.headers,
                    timeout=5.0
                )
                response.raise_for_status()
                return True
            except Exception as e:
                logger.error(f"Error completing job {job_id}: {str(e)}")
                # If we fail to acknowledge completion, the job might remain RUNNING in Node.
                # Node doesn't have a timeout yet, but operationally this is bad.
                raise

    @retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def fail_job(self, job_id: str, reason: str) -> bool:
        """Mark a job as FAILED with a reason."""
        async with httpx.AsyncClient() as client:
            try:
                logger.warning(f"Marking job {job_id} as FAILED: {reason}")
                response = await client.put(
                    f"{self.base_url}/jobs/{job_id}",
                    json={
                        "status": "FAILED",
                        "failureReason": reason
                    },
                    headers=self.headers,
                    timeout=5.0
                )
                response.raise_for_status()
                return True
            except Exception as e:
                logger.error(f"Error failing job {job_id}: {str(e)}")
                raise

import time
import asyncio
import subprocess
import os
import sys
from utils.logger import logger
from utils.mongo import mongo_manager
from utils.config import config
from clients.node_api_client import NodeApiClient

# Configuration from validated central config
POLL_INTERVAL = config.POLL_INTERVAL
MAX_CONCURRENT_JOBS = config.MAX_CONCURRENT_JOBS

class JobPoller:
    def __init__(self):
        self.active_jobs = {}
        self.active_jobs_data = {}
        self.api_client = NodeApiClient()

    async def poll_for_job(self):
        """Fetch a pending job from the Control Plane"""
        try:
            # We fetch a few but process one at a time in this simple loop
            jobs = await self.api_client.get_pending_jobs(limit=1)
            if jobs:
                return jobs[0]
        except Exception as e:
            logger.error(f"Error polling for jobs: {e}")
        return None

    async def start_job(self, job):
        """Mark job as running and spawn crawler process"""
        job_id = job['id']
        config_data = job.get('config', {})
        url = config_data.get('url')
        session_data = job.get('session', {})
        project_id = session_data.get('projectId')

        if not url:
            logger.error(f"Job {job_id} is missing 'url' in config. Cannot start.")
            await self.api_client.fail_job(job_id, "Missing 'url' in job config")
            return

        logger.info(f"Starting job {job_id} for URL: {url}")
        
        try:
            # 1. Notify Control Plane (Claim the job)
            claimed_job = await self.api_client.start_job(job_id)
            if not claimed_job:
                logger.warning(f"Could not claim job {job_id} (already taken or error)")
                return

            # 2. Prepare Crawler Command
            cmd = [
                sys.executable,
                "workers/crawl_worker/crawler.py",
                "--url", url,
                "--session-id", job['sessionId'],
                "--job-id", job_id,
                "--project-id", project_id or "unknown"
            ]
            
            if 'limits' in config_data:
                limits = config_data['limits']
                if 'maxPages' in limits:
                    cmd.extend(["--max-pages", str(limits['maxPages'])])
                if 'timeout' in limits:
                    cmd.extend(["--timeout", str(limits['timeout'])])
            
            # 3. Spawn Subprocess
            # Note: subprocess.Popen is sync, but we can poll it in our loop
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            self.active_jobs[job_id] = process
            self.active_jobs_data[job_id] = job # Store full job data
            logger.info(f"Spawned crawler process (PID {process.pid}) for Job {job_id}")
            
        except Exception as e:
            logger.error(f"Failed to start job {job_id}: {e}")
            # Try to notify failure
            await self.api_client.fail_job(job_id, str(e))

    async def check_active_jobs(self):
        """Check status of running jobs and clean up"""
        completed_jobs = []
        
        for job_id, process in list(self.active_jobs.items()):
            return_code = process.poll()
            
            if return_code is not None:
                # Process finished
                stdout, stderr = process.communicate()
                
                if return_code == 0:
                    logger.info(f"Job {job_id} completed successfully")
                    # Note: crawler.py handles the 'complete' notification with stats
                    
                    # TRIGGER ORCHESTRATOR FOR POST-CRAWL MODULES
                    # We assume modules are in job['config']['modules'] or default to []
                    # For now, we manually default to module_c if not present (as per user request "make this functionality")
                    # but typically this comes from the frontend job config.
                    
                    # Fetch fresh job data to get config? Or use what we have.
                    job_config = self.active_jobs_data.get(job_id, {}).get('config', {})
                    modules = job_config.get('modules', [])
                    
                    # If valid modules exist (or force module_c for testing/demo as user requested)
                    # "not all modules but onlt which is selected"
                    
                    if modules:
                        logger.info(f"Triggering Post-Crawl Modules for {job_id}: {modules}")
                        from orchestrator.job_runner import execute_job
                        # Pass query if it exists in config
                        query = job_config.get('query')
                        # We pass html_content=None so it loads from disk
                        asyncio.create_task(execute_job(
                            job_id=job_id,
                            url=job_config.get('url'),
                            html_content=None,
                            modules=modules,
                            query=query
                        ))
                else:
                    logger.error(f"Job {job_id} failed with code {return_code}")
                    logger.error(f"Stderr: {stderr}")
                    # Notify failure
                    await self.api_client.fail_job(job_id, f"Crawler subprocess failed with code {return_code}")
                
                completed_jobs.append(job_id)
        
        # Cleanup
        for job_id in completed_jobs:
            del self.active_jobs[job_id]
            if job_id in self.active_jobs_data:
                del self.active_jobs_data[job_id]

    async def run(self):
        """Main polling loop"""
        logger.info(f"Job Poller started. API: {config.API_BASE_URL}")
        
        while True:
            # 1. Check/Cleanup active jobs
            await self.check_active_jobs()
            
            # 2. Poll for new jobs if we have capacity
            if len(self.active_jobs) < MAX_CONCURRENT_JOBS:
                job = await self.poll_for_job()
                if job:
                    await self.start_job(job)
                else:
                    await asyncio.sleep(POLL_INTERVAL)
            else:
                await asyncio.sleep(POLL_INTERVAL)

async def main():
    poller = JobPoller()
    await poller.run()

if __name__ == "__main__":
    asyncio.run(main())

import asyncio
from clients.node_api_client import NodeApiClient
from .dispatcher import Dispatcher
from utils.logger import logger

class JobPoller:
    def __init__(self, node_client: NodeApiClient, dispatcher: Dispatcher, poll_interval: int = 5):
        self.node_client = node_client
        self.dispatcher = dispatcher
        self.poll_interval = poll_interval
        self.running = False

    async def start(self):
        self.running = True
        logger.info("Starting Job Poller...")
        while self.running:
            try:
                # 1. Fetch pending jobs
                # Limit 5 to avoid overwhelming this single worker instance
                jobs = await self.node_client.get_pending_jobs(limit=5)
                
                if not jobs:
                    logger.debug("No pending jobs found.")
                    await asyncio.sleep(self.poll_interval)
                    continue

                # 2. Process jobs
                # We can process them concurrently or sequentially.
                # For simplicity in this v1, let's do sequential dispatch (which is async inside).
                # To do concurrent, we would gather tasks.
                
                # Let's do concurrent dispatch!
                tasks = []
                for job in jobs:
                    tasks.append(self.dispatcher.dispatch(job))
                
                if tasks:
                    await asyncio.gather(*tasks)

            except Exception as e:
                logger.error(f"Error in poll loop: {str(e)}")
                await asyncio.sleep(self.poll_interval)

    def stop(self):
        self.running = False
        logger.info("Stopping Job Poller...")

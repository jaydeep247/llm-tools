import asyncio
import os
from dotenv import load_dotenv
from clients.node_api_client import NodeApiClient
from storage.object_store import LocalObjectStore
from orchestrator.dispatcher import Dispatcher
from orchestrator.job_poller import JobPoller
from utils.logger import configure_logger, logger

# Load env vars
load_dotenv()

async def main():
    # 1. Configure logging
    configure_logger()
    logger.info("Initializing Python Execution Layer (npy-backend)...")

    # 2. Initialize components
    node_client = NodeApiClient()
    storage = LocalObjectStore(base_path=os.getenv("STORAGE_BASE_PATH", "./data"))
    dispatcher = Dispatcher(node_client, storage)
    poller = JobPoller(node_client, dispatcher, poll_interval=int(os.getenv("POLL_INTERVAL", "5")))

    # 3. Start Poller
    try:
        await poller.start()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        poller.stop()

if __name__ == "__main__":
    asyncio.run(main())

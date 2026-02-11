import asyncio
from utils.logger import configure_logger, logger
from utils.config import config
from workers.job_poller import JobPoller

async def main():
    # 1. Configure logging
    configure_logger()
    logger.info("Initializing Python Execution Layer (npy-backend)...")

    # 2. Initialize and Run Poller
    try:
        # Config is already loaded and validated by importing it
        poller = JobPoller()
        await poller.run()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error(f"Application crashed: {str(e)}")

if __name__ == "__main__":
    asyncio.run(main())

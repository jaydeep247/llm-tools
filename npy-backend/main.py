from utils.logger import configure_logger, logger
import sys


def main():
    configure_logger()
    logger.info("="*80)
    logger.info("🚀 NPY BACKEND STARTING - Queue Worker (parallel job processing)")
    logger.info("="*80)
    logger.info(f"📍 Python: {sys.version.split()[0]}")
    logger.info("📦 Modules enabled: A (Crawler), B (Schema), C (AEO), D (Content), E (Brand), F (Competitor AI)")
    logger.info("🔄 Processing mode: Parallel with spawn context (Twisted safe)")
    logger.info("="*80)
    
    from workers.queue_worker import start_queue_worker
    start_queue_worker()


if __name__ == "__main__":
    main()


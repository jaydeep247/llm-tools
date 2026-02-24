from utils.logger import configure_logger, logger


def main():
    configure_logger()
    logger.info("🚀 Starting Queue Worker (parallel job processing)...")
    
    from workers.queue_worker import start_queue_worker
    start_queue_worker()


if __name__ == "__main__":
    main()


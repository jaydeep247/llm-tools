from utils.logger import configure_logger, logger
from workers.queue_worker import start_queue_worker


def main():
    configure_logger()
    logger.info("Starting Python RabbitMQ worker...")
    start_queue_worker()


if __name__ == "__main__":
    main()

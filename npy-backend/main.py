from utils.logger import configure_logger, logger


def main():
    configure_logger()
    logger.info("Python backend started (no job system configured).")


if __name__ == "__main__":
    main()

import logging
import sys
import warnings

# Suppress noisy third-party package warnings at import time
warnings.filterwarnings("ignore", category=Warning, module="requests")
warnings.filterwarnings("ignore", message=".*urllib3.*", category=Warning)
warnings.filterwarnings("ignore", message=".*chardet.*", category=Warning)


def configure_logger():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
    # Pin root handlers to INFO so Scrapy's root-level reset (NOTSET) doesn't expose DEBUG logs
    for _h in logging.root.handlers:
        if _h.level < logging.INFO:
            _h.setLevel(logging.INFO)

    # Give npy-backend its own handler so Scrapy's root-logger overrides
    # (which strip the CrawlFieldsFilter and raise root level to WARNING)
    # never silence our application INFO logs.
    npy_logger = logging.getLogger("npy-backend")
    if not npy_logger.handlers:
        _handler = logging.StreamHandler(sys.stdout)
        _handler.setLevel(logging.INFO)
        _handler.setFormatter(
            logging.Formatter(
                "%(asctime)s [%(name)s] %(levelname)s: %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        npy_logger.addHandler(_handler)
    npy_logger.setLevel(logging.INFO)
    npy_logger.propagate = False  # don't bubble up to root (Scrapy-controlled)

    logging.getLogger("scrapy").setLevel(logging.ERROR)
    logging.getLogger("scrapy.core.scraper").setLevel(logging.ERROR)
    logging.getLogger("twisted").setLevel(logging.ERROR)
    logging.getLogger("pika").setLevel(logging.WARNING)
    logging.getLogger("pymongo").setLevel(logging.CRITICAL)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("s3transfer").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("py.warnings").setLevel(logging.ERROR)  # suppress urllib3/chardet version noise


logger = logging.getLogger("npy-backend")

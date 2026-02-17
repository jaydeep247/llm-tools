import structlog
import logging
import sys

def configure_logger():
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.dev.ConsoleRenderer()
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=False,
    )
    
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=logging.INFO,
    )
    
    logging.getLogger("scrapy.core.scraper").setLevel(logging.CRITICAL)
    logging.getLogger("scrapy").setLevel(logging.CRITICAL)
    logging.getLogger("pymongo").setLevel(logging.CRITICAL)

logger = structlog.get_logger()

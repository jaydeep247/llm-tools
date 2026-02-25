import logging
import sys


class CrawlFieldsFilter(logging.Filter):
    def __init__(self, name: str = "") -> None:
        super().__init__(name)
        self.last_scrapy_message: str | None = None

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        if not message:
            return True

        text = message.lstrip()

        # For Scrapy-related loggers, only allow concise crawl lines, drop everything else
        if record.name.startswith("scrapy"):
            # Scrapy often logs "Scraped from ..." and the item dict in a single message
            # Sanitize by keeping only the first line (the URL info) and dropping the rest
            if text.startswith("Scraped from <") and "\n" in message:
                first_line = text.splitlines()[0]
                record.msg = first_line
                record.args = ()
                text = first_line

            # Drop consecutive duplicate Scrapy messages to avoid spam
            if text == self.last_scrapy_message:
                return False
            self.last_scrapy_message = text

            if text.startswith("Crawled (") or text.startswith("Scraped from <"):
                return True

            # Block all other Scrapy logs (including item repr, stats, etc.)
            return False

        # Drop big dict that includes cookies + amphtml_link from any logger
        if text.startswith("{") and "'cookies'" in text and "'amphtml_link'" in text:
            return False

        return True


def configure_logger():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )

    root_logger = logging.getLogger()
    field_filter = CrawlFieldsFilter()
    for handler in root_logger.handlers:
        handler.addFilter(field_filter)

    # Allow Scrapy to emit debug crawl lines; filtering is done by CrawlFieldsFilter
    logging.getLogger("scrapy.core.scraper").setLevel(logging.DEBUG)
    logging.getLogger("scrapy.core.engine").setLevel(logging.DEBUG)
    logging.getLogger("scrapy").setLevel(logging.DEBUG)
    logging.getLogger("twisted").setLevel(logging.ERROR)
    logging.getLogger("pika").setLevel(logging.WARNING)
    logging.getLogger("pymongo").setLevel(logging.CRITICAL)
    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("s3transfer").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


logger = logging.getLogger("npy-backend")

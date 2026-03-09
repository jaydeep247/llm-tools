"""
Scrapy extension: suppress the 'Engine slot not assigned' Twisted runtime
noise that fires whenever the crawl-worker spider is idle waiting for
new URLs in the Redis queue.

Note: the primary suppression layer is run_worker.py (raw I/O wrappers).
This extension provides a belt-and-suspenders Python-logging filter for
any messages that do go through Python's logging system.
"""

import logging

_NOISE = frozenset([
    "Engine slot not assigned",
    "Unhandled Error",
])


class _NoiseFilter(logging.Filter):
    def filter(self, record):
        try:
            msg = record.getMessage()
        except Exception:
            return True
        return not any(phrase in msg for phrase in _NOISE)


class SuppressEngineSlotNoise:
    """
    Attaches a Python logging.Filter to the 'twisted', 'scrapy', and
    'scrapy.core.engine' loggers as soon as the extension is instantiated
    (in from_crawler), so it is active before the spider even opens.
    """

    @classmethod
    def from_crawler(cls, crawler):
        ext = cls()
        f = _NoiseFilter()
        for logger_name in ("twisted", "scrapy.core.engine", "scrapy"):
            logging.getLogger(logger_name).addFilter(f)
        return ext

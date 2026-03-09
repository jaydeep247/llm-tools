"""
Entrypoint for the crawl-worker container.

Runs `scrapy crawl website_spider` but filters out the noisy
'Engine slot not assigned' / 'Unhandled Error' Twisted tracebacks that
scrapy-redis emits repeatedly while the worker idles waiting for new jobs.

Two layers of suppression:
  1. Raw I/O wrappers on sys.stdout / sys.stderr (catches Twisted's direct
     writes that bypass Python logging entirely).
  2. Python logging.Filter on the 'twisted' and 'scrapy' loggers (catches
     messages that DO go through Python logging).
"""

import logging
import os
import re
import sys

# ── Constants ────────────────────────────────────────────────────────────────

_NOISE_TRIGGERS = (
    "Engine slot not assigned",
    "Unhandled Error",
)

# A line that signals the end of a traceback block: starts with a timestamp
# (20xx-…), a log-bracket ([logger]), or is completely blank.
_CLEAN_LINE_RE = re.compile(r"^20\d\d-|\[|^$")


# ── Layer 1: raw I/O filter ───────────────────────────────────────────────────

class _SilentWriter:
    """Wraps a text stream and drops 'Engine slot / Unhandled Error' blocks."""

    def __init__(self, wrapped):
        self._w = wrapped
        self._in_noise = False
        self._buf = ""

    def write(self, text):
        self._buf += text
        # Process one complete line at a time.
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            self._emit(line + "\n")

    def _emit(self, line):
        stripped = line.rstrip("\n")
        if self._in_noise:
            # Stay suppressed until we see a clean non-noise log line.
            if _CLEAN_LINE_RE.match(stripped) and stripped:
                if any(t in stripped for t in _NOISE_TRIGGERS):
                    return  # new trigger inside block — keep suppressing
                self._in_noise = False
                self._w.write(line)
            # else: still inside traceback — drop silently
        else:
            if any(t in stripped for t in _NOISE_TRIGGERS):
                self._in_noise = True
                return
            self._w.write(line)

    def flush(self):
        # Flush any partial (no-newline) buffer as-is.
        if self._buf:
            self._w.write(self._buf)
            self._buf = ""
        self._w.flush()

    def fileno(self):
        return self._w.fileno()

    def __getattr__(self, name):
        return getattr(self._w, name)


sys.stdout = _SilentWriter(sys.stdout)
sys.stderr = _SilentWriter(sys.stderr)


# ── Layer 2: Python logging filter ───────────────────────────────────────────

class _NoiseFilter(logging.Filter):
    def filter(self, record):
        try:
            return not any(t in record.getMessage() for t in _NOISE_TRIGGERS)
        except Exception:
            return True


_nf = _NoiseFilter()
for _logger_name in ("twisted", "scrapy", "scrapy.core.engine"):
    logging.getLogger(_logger_name).addFilter(_nf)


# ── Start scrapy ─────────────────────────────────────────────────────────────

os.environ.setdefault(
    "SCRAPY_SETTINGS_MODULE", "workers.crawl_worker.spiders.settings"
)

if __name__ == "__main__":
    from scrapy.cmdline import execute
    execute(["scrapy", "crawl", "website_spider"])

"""DataForSEO SERP API async client with exponential-backoff retry."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.dataforseo.com/v3"
_SERP_ENDPOINT = "/serp/google/organic/live/advanced"

# HTTP status codes that warrant a retry
_RETRYABLE_STATUSES = {429, 500, 502, 503, 504}


class DataForSEOError(Exception):
    """Raised when the DataForSEO API returns an unrecoverable error."""


class _RetryableHTTPError(Exception):
    """Internal sentinel for statuses we want tenacity to retry."""


def _make_retry_predicate():
    """Return a tenacity ``retry_if_exception_type`` covering all retryable cases."""
    return retry_if_exception_type(
        (httpx.TimeoutException, httpx.NetworkError, _RetryableHTTPError)
    )


async def _call_once(client: httpx.AsyncClient, payload: list[dict]) -> dict:
    """POST the payload once; raise ``_RetryableHTTPError`` on 429/5xx."""
    url = f"{_BASE_URL}{_SERP_ENDPOINT}"
    response = await client.post(url, json=payload, timeout=60.0)

    if response.status_code in _RETRYABLE_STATUSES:
        raise _RetryableHTTPError(
            f"DataForSEO returned {response.status_code} — will retry"
        )
    if response.status_code != 200:
        raise DataForSEOError(
            f"DataForSEO API error {response.status_code}: {response.text[:300]}"
        )
    return response.json()


# Wrap in a tenacity retry decorator.  We define a standalone coroutine so that
# the decorator can be applied cleanly without a class.
_retry_decorator = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=_make_retry_predicate(),
    reraise=True,
)


async def fetch_serp(
    keyword: str,
    login: str,
    password: str,
    *,
    location_code: int = 2840,
    language_code: str = "en",
    device: str = "desktop",
    depth: int = 100,
) -> dict[str, Any]:
    """Fetch live SERP results for a single keyword.

    Returns the full raw DataForSEO JSON response, which is also persisted as
    ``raw_serp_json`` in MongoDB so the response can be re-parsed without
    re-calling the API.

    Retries up to 3 times with exponential back-off on 429 and 5xx responses.
    """
    payload = [
        {
            "keyword": keyword,
            "location_code": location_code,
            "language_code": language_code,
            "device": device,
            "os": "windows",
            "depth": depth,
        }
    ]

    auth = (login, password)

    @_retry_decorator
    async def _call_with_retry() -> dict:
        async with httpx.AsyncClient(auth=auth) as client:
            return await _call_once(client, payload)

    try:
        raw = await _call_with_retry()
        logger.debug("[SERP CLIENT] keyword=%r fetched successfully", keyword)
        return raw
    except DataForSEOError:
        raise
    except Exception as exc:
        raise DataForSEOError(
            f"Failed to fetch SERP for keyword={keyword!r}: {exc}"
        ) from exc

"""DataForSEO REST API client for SERP data retrieval."""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any, Dict, List, Optional

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger("serp_analyzer")

_DFS_BASE = "https://api.dataforseo.com"


def _build_auth_headers(login: str, password: str) -> Dict[str, str]:
    token = base64.b64encode(f"{login}:{password}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Content-Type": "application/json",
    }


class DataForSEOError(Exception):
    """Raised when DataForSEO returns a non-20000 status code."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(f"DataForSEO error {status_code}: {message}")
        self.status_code = status_code


class DataForSEOClient:
    """Thin async wrapper around the DataForSEO v3 SERP API.

    Usage::

        async with DataForSEOClient(login, password) as client:
            result = await client.fetch_serp("buy laptop")
    """

    def __init__(self, login: str, password: str) -> None:
        self._headers = _build_auth_headers(login, password)
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "DataForSEOClient":
        self._client = httpx.AsyncClient(timeout=90.0, headers=self._headers)
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None

    # ── private helpers ────────────────────────────────────────────────────

    def _client_or_raise(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError(
                "DataForSEOClient must be used as an async context manager."
            )
        return self._client

    @retry(
        retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.TransportError)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        reraise=True,
    )
    async def _post(self, endpoint: str, payload: List[Dict[str, Any]]) -> Dict[str, Any]:
        client = self._client_or_raise()
        response = await client.post(f"{_DFS_BASE}{endpoint}", json=payload)
        response.raise_for_status()
        body = response.json()

        # DataForSEO embeds its own status_code in the JSON payload
        dfs_status = body.get("status_code")
        if dfs_status and dfs_status not in (20000, 20100):
            raise DataForSEOError(
                dfs_status, body.get("status_message", "Unknown error")
            )
        return body

    # ── public API ─────────────────────────────────────────────────────────

    async def fetch_serp(
        self,
        keyword: str,
        location_code: int = 2840,   # United States
        language_code: str = "en",
        device: str = "desktop",
        depth: int = 100,
    ) -> Dict[str, Any]:
        """Return raw DataForSEO response for a single keyword (live advanced)."""
        payload = [
            {
                "keyword": keyword,
                "location_code": location_code,
                "language_code": language_code,
                "device": device,
                "os": "windows" if device == "desktop" else "android",
                "depth": depth,
            }
        ]
        logger.debug(f"[DFS] SERP fetch: keyword={keyword!r}")
        return await self._post(
            "/v3/serp/google/organic/live/advanced", payload
        )

    async def fetch_serp_batch(
        self,
        keywords: List[str],
        location_code: int = 2840,
        language_code: str = "en",
        device: str = "desktop",
        depth: int = 100,
        concurrency: int = 5,
    ) -> List[Dict[str, Any]]:
        """Fetch SERP data for multiple keywords with rate-limited concurrency."""
        semaphore = asyncio.Semaphore(concurrency)

        async def _bounded_fetch(kw: str) -> Dict[str, Any]:
            async with semaphore:
                try:
                    return await self.fetch_serp(kw, location_code, language_code, device, depth)
                except Exception as exc:
                    logger.error(f"[DFS] Failed to fetch SERP for {kw!r}: {exc}")
                    return {"error": str(exc), "keyword": kw}

        tasks = [_bounded_fetch(kw) for kw in keywords]
        return await asyncio.gather(*tasks)

    async def fetch_locations(self, country: str = "United States") -> Dict[str, Any]:
        """Utility: list DataForSEO location codes for a country."""
        async with httpx.AsyncClient(timeout=30.0, headers=self._headers) as client:
            resp = await client.get(f"{_DFS_BASE}/v3/serp/google/locations")
            resp.raise_for_status()
            data = resp.json()
            if country:
                tasks = data.get("tasks", [{}])
                items = tasks[0].get("result", []) if tasks else []
                return [i for i in items if country.lower() in (i.get("location_name") or "").lower()]
            return data

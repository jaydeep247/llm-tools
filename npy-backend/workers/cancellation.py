"""
Shared Redis connection pool and job cancellation check.

A single module-level ConnectionPool is shared across all threads — avoids
creating a new TCP connection on every cancellation probe.
"""

import redis
from utils.config import config

_redis_pool = redis.ConnectionPool.from_url(
    config.REDIS_URL,
    max_connections=80,
    decode_responses=True,
    socket_timeout=2,
    socket_connect_timeout=2,
    health_check_interval=30,
    retry_on_timeout=True,
)


def _get_redis() -> redis.Redis:
    """Return a Redis client backed by the shared connection pool."""
    return redis.Redis(connection_pool=_redis_pool)


def is_job_cancelled(job_id: str) -> bool:
    """Return True when a session-delete request has flagged this job."""
    try:
        return _get_redis().get(f"job:{job_id}:cancelled") == "true"
    except Exception:
        return False


def is_job_paused(job_id: str) -> bool:
    """Return True when the crawl has been paused at the quick-start page threshold."""
    try:
        return _get_redis().get(f"job:{job_id}:paused") == "true"
    except Exception:
        return False


def set_job_paused(job_id: str) -> None:
    """Mark a job as paused in Redis (24 h TTL — removed on resume)."""
    try:
        _get_redis().set(f"job:{job_id}:paused", "true", ex=86400)
    except Exception:
        pass


def clear_job_paused(job_id: str) -> None:
    """Remove the paused flag so a resumed crawl starts cleanly."""
    try:
        _get_redis().delete(f"job:{job_id}:paused")
    except Exception:
        pass


def set_pages_at_pause(job_id: str, count: int) -> None:
    """Persist the page count at the moment of pause so the resume spider
    can offset its counter and display cumulative progress correctly."""
    try:
        _get_redis().set(f"job:{job_id}:pages_at_pause", str(count), ex=86400)
    except Exception:
        pass


def get_pages_at_pause(job_id: str) -> int:
    """Return the page count stored at pause-time, or 0 if not found."""
    try:
        val = _get_redis().get(f"job:{job_id}:pages_at_pause")
        return int(val) if val else 0
    except Exception:
        return 0

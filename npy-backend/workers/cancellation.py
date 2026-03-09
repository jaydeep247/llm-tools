"""
Shared Redis connection pool and job cancellation check.

A single module-level ConnectionPool is shared across all threads — avoids
creating a new TCP connection on every cancellation probe.
"""

import redis
from utils.config import config

_redis_pool = redis.ConnectionPool.from_url(
    config.REDIS_URL, max_connections=20, decode_responses=True
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

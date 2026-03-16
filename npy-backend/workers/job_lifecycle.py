"""
Redis-only job lifecycle updates.

Node.js (job-events.consumer.ts) is the sole MongoDB writer for job/session
status.  Python workers only update Redis — which drives UI progress streaming
and cancellation checks.  MongoDB state is reconciled when Node.js processes
the JOB_COMPLETED / JOB_FAILED event from the job.events RabbitMQ exchange.
"""

from workers.cancellation import _get_redis
from utils.logger import logger

REDIS_TTL_SECONDS = 3600 * 24


def _write_job_status(r, job_id: str, status: str, error_message: str | None = None) -> None:
    """Write canonical and compatibility status keys in one pipeline."""
    pipe = r.pipeline()
    pipe.set(f"job:{job_id}:status", status)
    pipe.expire(f"job:{job_id}:status", REDIS_TTL_SECONDS)
    mapping = {"status": status.upper()}
    if error_message:
        mapping["error"] = error_message[:500]
    pipe.hset(f"job:{job_id}", mapping=mapping)
    pipe.expire(f"job:{job_id}", REDIS_TTL_SECONDS)
    pipe.execute()


def mark_job_completed(job_id: str, session_id: str) -> None:
    """Update Redis state to COMPLETED. MongoDB is updated by Node.js consumer."""
    r = _get_redis()
    try:
        pipe = r.pipeline()
        pipe.hset(f"session:{session_id}", mapping={"status": "completed"})
        pipe.expire(f"session:{session_id}", REDIS_TTL_SECONDS)
        pipe.execute()
        _write_job_status(r, job_id, "completed")
        logger.info(f"[LIFECYCLE] Redis: job {job_id} → COMPLETED")
    except Exception as e:
        logger.error(f"[LIFECYCLE] Redis update failed for job {job_id}: {e}")


def mark_job_failed(job_id: str, session_id: str, error_message: str) -> None:
    """Update Redis state to FAILED. MongoDB is updated by Node.js consumer."""
    r = _get_redis()
    try:
        pipe = r.pipeline()
        pipe.hset(f"session:{session_id}", mapping={"status": "failed"})
        pipe.expire(f"session:{session_id}", REDIS_TTL_SECONDS)
        pipe.execute()
        _write_job_status(r, job_id, "failed", error_message=error_message)
        logger.info(f"[LIFECYCLE] Redis: job {job_id} → FAILED")
    except Exception as e:
        logger.error(f"[LIFECYCLE] Redis update failed for job {job_id}: {e}")

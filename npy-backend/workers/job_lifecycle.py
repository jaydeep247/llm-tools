"""
Redis-only job lifecycle updates.

Node.js (job-events.consumer.ts) is the sole MongoDB writer for job/session
status.  Python workers only update Redis — which drives UI progress streaming
and cancellation checks.  MongoDB state is reconciled when Node.js processes
the JOB_COMPLETED / JOB_FAILED event from the job.events RabbitMQ exchange.
"""

from workers.cancellation import _get_redis
from utils.logger import logger


def mark_job_completed(job_id: str, session_id: str) -> None:
    """Update Redis state to COMPLETED. MongoDB is updated by Node.js consumer."""
    r = _get_redis()
    try:
        r.hset(f"session:{session_id}", mapping={"status": "COMPLETED"})
        r.expire(f"session:{session_id}", 3600)
        r.hset(f"job:{job_id}", mapping={"status": "COMPLETED"})
        r.expire(f"job:{job_id}", 3600)
        logger.info(f"[LIFECYCLE] Redis: job {job_id} → COMPLETED")
    except Exception as e:
        logger.error(f"[LIFECYCLE] Redis update failed for job {job_id}: {e}")


def mark_job_failed(job_id: str, session_id: str, error_message: str) -> None:
    """Update Redis state to FAILED. MongoDB is updated by Node.js consumer."""
    r = _get_redis()
    try:
        r.hset(f"job:{job_id}", mapping={"status": "FAILED", "error": error_message[:500]})
        r.expire(f"job:{job_id}", 3600)
        logger.info(f"[LIFECYCLE] Redis: job {job_id} → FAILED")
    except Exception as e:
        logger.error(f"[LIFECYCLE] Redis update failed for job {job_id}: {e}")

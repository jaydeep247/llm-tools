"""
Queue Worker
Consumes from isolated queues with parallel processing.
Each job category runs independently without affecting others.
"""

import json
import time
import queue as thread_queue
from concurrent.futures import ThreadPoolExecutor

import pika
from pika.adapters.blocking_connection import BlockingConnection

from utils.logger import configure_logger, logger
from utils.config import config
from utils.event_publisher import publisher

from workers.job_types import QUEUE_CONFIGS
from workers.worker_config import POOL_SIZE_PER_CATEGORY
from workers.cancellation import is_job_cancelled, _get_redis
from workers.job_lifecycle import mark_job_completed, mark_job_failed
from workers.registry import get_executor

result_queue = thread_queue.Queue()


# ============ EXCEPTIONS ============

class RetryableJobError(Exception):
    """Error that should trigger a requeue"""
    pass


class NonRetryableJobError(Exception):
    """Error that should send job to DLQ"""
    pass


class JobCancelledError(Exception):
    """Raised when a job has been cancelled (session deleted)"""
    pass


# ============ JOB DISPATCH ============

def run_job_in_worker(payload: dict, job_type_override: str | None = None) -> None:
    """Look up the correct executor from the registry and run the job."""
    job_type = (job_type_override or payload.get("jobType") or "CRAWL").upper()
    job_id = payload.get("jobId") or f"job_{payload.get('sessionId')}"
    session_id = payload.get("sessionId", "unknown")

    if is_job_cancelled(job_id):
        logger.info(f"[WORKER] Job {job_id} was cancelled before execution - skipping")
        mark_job_failed(job_id, session_id, "Cancelled: session deleted by user")
        return

    logger.info(f"[WORKER] Processing job {job_id} (Type: {job_type})")
    executor_fn = get_executor(job_type)
    executor_fn(payload)


def drain_results(connection: BlockingConnection) -> None:
    while not result_queue.empty():
        ch, tag, action = result_queue.get()

        def do_ack() -> None:
            if action == "ack":
                ch.basic_ack(tag)
            elif action == "nack_requeue":
                ch.basic_nack(tag, requeue=True)
            else:
                ch.basic_nack(tag, requeue=False)

        connection.add_callback_threadsafe(do_ack)


def start_queue_worker() -> None:
    executor = ThreadPoolExecutor(max_workers=POOL_SIZE_PER_CATEGORY * len(QUEUE_CONFIGS))
    dispatch_redis = _get_redis()

    def on_message(ch, method, _properties, body) -> None:
        """Receive a job message, update Redis, and submit to the thread pool."""
        try:
            payload = json.loads(body)
        except Exception:
            logger.error("Invalid message format received; sending to DLQ")
            try:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except Exception:
                pass
            return

        required_fields = ("sessionId", "projectId", "url")
        missing_fields = [field for field in required_fields if field not in payload]
        if missing_fields:
            logger.error(f"Missing required fields: {missing_fields}; routing key: {method.routing_key}")
            try:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except Exception:
                pass
            return

        session_id = payload["sessionId"]
        project_id = payload["projectId"]
        url = payload["url"]
        job_id = payload.get("jobId") or f"job_{session_id}"
        job_type = payload.get("jobType")

        logger.info(f"[QUEUE] Message received | Session: {session_id} | Job: {job_id} | Type: {job_type or 'CRAWL'}")

        dispatch_redis.hset(
            f"session:{session_id}",
            mapping={"status": "RECEIVED", "url": url, "projectId": project_id},
        )
        dispatch_redis.hset(
            f"job:{job_id}",
            mapping={
                "status": "RECEIVED",
                "sessionId": session_id,
                "projectId": project_id,
                "url": url,
                "jobType": job_type,
            },
        )

        future = executor.submit(run_job_in_worker, payload, job_type)

        def when_done(f) -> None:
            try:
                f.result()
                logger.info(f"[RESULT] Job {job_id} completed successfully")
                # Redis-only update - Node.js consumer writes MongoDB via JOB_COMPLETED event
                mark_job_completed(job_id, session_id)
                try:
                    publisher.emit_event(job_id, "JOB_COMPLETED", {
                        "status": "completed",
                        "sessionId": session_id,
                        "projectId": project_id,
                    })
                except Exception as pub_err:
                    logger.warning(f"[RESULT] Failed to emit JOB_COMPLETED: {pub_err}")
                action = "ack"
            except RetryableJobError as e:
                logger.error(f"[RESULT] Job {job_id} retryable error; requeueing", exc_info=e)
                action = "nack_requeue"
            except Exception as e:
                logger.error(f"[RESULT] Job {job_id} non-retryable error; sending to DLQ", exc_info=e)
                # Redis-only update - Node.js consumer writes MongoDB via JOB_FAILED event
                mark_job_failed(job_id, session_id, str(e))
                try:
                    publisher.emit_event(job_id, "JOB_FAILED", {
                        "status": "failed",
                        "sessionId": session_id,
                        "projectId": project_id,
                        "reason": str(e),
                    })
                except Exception as pub_err:
                    logger.warning(f"[RESULT] Failed to emit JOB_FAILED: {pub_err}")
                action = "nack_drop"

            result_queue.put((ch, method.delivery_tag, action))

        future.add_done_callback(when_done)

    # Reconnect loop
    while True:
        connection: BlockingConnection | None = None
        try:
            params = pika.URLParameters(config.RABBITMQ_URL)
            connection = BlockingConnection(params)

            # Infrastructure channel: declare all exchanges, queues, and bindings
            infra_ch = connection.channel()
            for category, cfg in QUEUE_CONFIGS.items():
                infra_ch.exchange_declare(exchange=cfg.exchange, exchange_type="direct", durable=True)
                infra_ch.exchange_declare(exchange=cfg.dlx, exchange_type="direct", durable=True)
                infra_ch.queue_declare(
                    queue=cfg.queue, durable=True,
                    arguments={"x-dead-letter-exchange": cfg.dlx},
                )
                infra_ch.queue_declare(queue=cfg.dlq, durable=True)
                infra_ch.queue_bind(exchange=cfg.exchange, queue=cfg.queue, routing_key=cfg.routing_key)
                infra_ch.queue_bind(
                    exchange=cfg.dlx,
                    queue=cfg.dlq,
                    routing_key=cfg.routing_key.replace(".job", ".failed"),
                )
            # Declare job.events exchange for publishing. Python no longer CONSUMES
            # from this exchange; Node.js job-events.consumer.ts is the sole reader.
            infra_ch.exchange_declare(exchange="job.events", exchange_type="topic", durable=True)
            infra_ch.close()

            # One consumer channel per job category (isolated prefetch budgets)
            consumer_channels = []
            for category, cfg in QUEUE_CONFIGS.items():
                ch = connection.channel()
                ch.basic_qos(prefetch_count=POOL_SIZE_PER_CATEGORY, global_qos=False)
                ch.basic_consume(queue=cfg.queue, on_message_callback=on_message, auto_ack=False)
                consumer_channels.append(ch)

            logger.info("RabbitMQ worker connected. Waiting for messages...")
            for cat, cfg in QUEUE_CONFIGS.items():
                logger.info(f"  {cat.upper()}: queue={cfg.queue}, prefetch={POOL_SIZE_PER_CATEGORY}")

            while any(ch._consumer_infos for ch in consumer_channels):
                connection.process_data_events(time_limit=1)
                drain_results(connection)
        except Exception as e:
            logger.error("Worker crashed, restarting", exc_info=e)
            if connection is not None:
                try:
                    connection.close()
                except Exception:
                    pass
            time.sleep(5)

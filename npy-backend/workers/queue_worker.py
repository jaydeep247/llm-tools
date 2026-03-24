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
    
    logger.info(f"[DISPATCH] 📥 Routing job | Type: {job_type} | Session: {session_id} | Job: {job_id}")
    executor = get_executor(job_type)
    return executor(payload)


def execute_module_f_job(payload: dict) -> bool:
    """Execute Module F (Competitor AI Intelligence) job"""
    from modules.module_F.runner import run_module_f_competitor_ai_intelligence

    configure_logger()

    session_id = payload["sessionId"]
    project_id = payload.get("projectId") or payload.get("project_id") or payload.get("config", {}).get("projectId")
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_F_COMPETITOR_AI_INTELLIGENCE").upper()
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")

    target_job_id = source_job_id if source_job_id else job_id

    logger.info(f"[MODULE_F] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}...")

    try:
        logger.info(f"[MODULE_F] ⚡ Executing Competitor AI Intelligence analysis...")
        # Currently only one job type, but structure allows for future expansion
        result = asyncio.run(run_module_f_competitor_ai_intelligence(target_job_id, url, session_id, project_id))

        if isinstance(result, dict) and "error" in result:
            logger.error(f"[MODULE_F] ⚠️  Module returned error: {result.get('error')}")
        else:
            logger.info(f"[MODULE_F] 📊 Result received")
        
        logger.info(f"[MODULE_F] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_F] ❌ {job_type} Processing failed: {e}", exc_info=True)
        raise


def execute_module_e_job(payload: dict) -> bool:
    """Execute Module E (Brand Intelligence) job"""
    from modules.module_E.runner import run_module_e, run_consistency_only
    from modules.quick_start.runner import run_quick_start
    from modules.module_E.sentiment_runner import run_sentiment_only
    from modules.module_E.competitor_runner import run_competitor_analysis
    from modules.module_E.ai_sov_runner import run_ai_sov_analysis
    from modules.module_E.ranking_runner import run_ranking_analysis
    from modules.module_E.brand_runner import run_brand_only
    
    configure_logger()
    
    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_E_FULL").upper()
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    main_keyword = payload.get("mainKeyword") or ""
    ga_property_id = payload.get("gaPropertyId") or ""
    
    # Use sourceJobId to load HTML if needed (points to crawl job)
    target_job_id = source_job_id if source_job_id else job_id
    
    try:
        # Check cancellation before starting
        if is_job_cancelled(job_id):
            logger.info(f"[MODULE_E] 🛑 Job {job_id} cancelled before execution — skipping")
            return True

        # Execute specific sub-module based on job type
        if job_type == "MODULE_E_QUICK_START":
            logger.info(f"[MODULE_E] ⚡ Running Quick Start (Brand Analysis + Competitor + AI SOV + Crawl)...")
            # Runs Brand Analysis + Competitor Mentions + AI SOV + full crawl in parallel
            result = asyncio.run(run_quick_start(
                job_id, url,
                session_id=session_id,
                project_id=project_id,
                main_keyword=main_keyword,
                ga_property_id=ga_property_id,
            ))

            # Check if quick_start returned early due to cancellation
            if isinstance(result, dict) and result.get("cancelled"):
                logger.info(f"[MODULE_E] 🛑 Quick Start job {job_id} was cancelled — not marking completed")
                return True
        elif job_type == "MODULE_E_CONSISTENCY":
            logger.info(f"[MODULE_E] ⚡ Running Consistency Analysis...")
            result = asyncio.run(run_consistency_only(target_job_id, url))
        elif job_type == "MODULE_E_SENTIMENT":
            logger.info(f"[MODULE_E] ⚡ Running Sentiment Analysis...")
            result = asyncio.run(run_sentiment_only(target_job_id, url))
        elif job_type == "MODULE_E_COMPETITORS":
            logger.info(f"[MODULE_E] ⚡ Running Competitor Analysis...")
            result = asyncio.run(run_competitor_analysis(target_job_id, url))
        elif job_type == "MODULE_E_AI_SOV":
            logger.info(f"[MODULE_E] ⚡ Running AI Share of Voice Analysis...")
            result = asyncio.run(run_ai_sov_analysis(target_job_id, url))
        elif job_type == "MODULE_E_RANKING":
            logger.info(f"[MODULE_E] ⚡ Running Ranking Analysis...")
            result = asyncio.run(run_ranking_analysis(target_job_id, url))
        elif job_type == "MODULE_E_BRAND":
            logger.info(f"[MODULE_E] ⚡ Running Brand Analysis...")
            result = asyncio.run(run_brand_only(target_job_id, url))
        else:
            logger.info(f"[MODULE_E] ⚡ Running full Module E analysis (default)...")
            # Default to full run or generic run
            result = asyncio.run(run_module_e(target_job_id, url))
        
        if isinstance(result, dict) and "error" in result:
            logger.error(f"[MODULE_E] ⚠️  Module returned error: {result.get('error')}")
        else:
            logger.info(f"[MODULE_E] 📊 Result received")
            
        logger.info(f"[MODULE_E] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
        
    except Exception as e:
        logger.error(f"[MODULE_E] ❌ {job_type} Processing failed: {e}", exc_info=True)
        raise


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

        pipe = dispatch_redis.pipeline()
        pipe.hset(
            f"session:{session_id}",
            mapping={"status": "received", "url": url, "projectId": project_id},
        )
        pipe.expire(f"session:{session_id}", 3600 * 24)
        pipe.set(f"job:{job_id}:status", "received")
        pipe.expire(f"job:{job_id}:status", 3600 * 24)
        pipe.hset(
            f"job:{job_id}",
            mapping={
                "status": "RECEIVED",
                "sessionId": session_id,
                "projectId": project_id,
                "url": url,
                "jobType": job_type,
            },
        )
        pipe.expire(f"job:{job_id}", 3600 * 24)
        pipe.execute()

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

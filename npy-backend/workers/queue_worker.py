"""
Queue Worker
Consumes from isolated queues with parallel processing.
Each job category runs independently without affecting others.
"""

import json
import os
import sys
import subprocess
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import time
import threading
import queue as thread_queue
import multiprocessing
from typing import Dict, Callable

import pika
from pika.adapters.blocking_connection import BlockingConnection
import redis
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, AutoReconnect, ConnectionFailure
from redis.exceptions import ConnectionError as RedisConnectionError, TimeoutError as RedisTimeoutError
from scrapy.crawler import CrawlerProcess

from utils.logger import configure_logger, logger
from utils.config import config
from utils.mongo import mongo_manager
from utils.storage import load_raw_html_sync
from utils.event_publisher import publisher

from workers.job_types import (
    JobType,
    JobCategory,
    QUEUE_CONFIGS,
    get_queue_config,
)
from workers.worker_config import SCRAPY_SETTINGS, POOL_SIZE_PER_CATEGORY

# Use spawn context to avoid fork issues with Twisted reactor and RabbitMQ connections
spawn_ctx = multiprocessing.get_context('spawn')

result_queue = thread_queue.Queue()

# ============ EXCEPTIONS ============

class RetryableJobError(Exception):
    """Error that should trigger a requeue"""
    pass


class NonRetryableJobError(Exception):
    """Error that should send job to DLQ"""
    pass


# ============ UTILITIES ============

def get_mongo_client() -> MongoClient:
    """Get MongoDB client"""
    return MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=5000)


def _run_spider_subprocess(state_dict, url, session_id, job_id, project_id, max_pages, timeout, scrapy_settings):
    """
    Run Scrapy spider in subprocess.
    This function is at module level to be picklable for spawn multiprocessing.
    """
    import traceback
    from scrapy.crawler import CrawlerProcess
    
    try:
        from workers.crawl_worker.spiders.website_spider import WebsiteSpider
        from utils.event_publisher import publisher
        from utils.logger import configure_logger
        
        configure_logger()
        
        process = CrawlerProcess(settings=scrapy_settings)
        crawler = process.create_crawler(WebsiteSpider)
        process.crawl(
            crawler,
            start_url=url,
            session_id=session_id,
            job_id=job_id,
            project_id=project_id,
            max_pages=max_pages,
            timeout=timeout,
            allow_discovery=True,
        )
        process.start()
        
        # If we reach here, crawl completed (Scrapy finished)
        state_dict["success"] = True
        
        # Clean up publisher connection
        publisher.close()
        
    except Exception as e:
        state_dict["error"] = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        state_dict["success"] = False


# ============ JOB EXECUTORS ============

def execute_crawler_job(payload: dict) -> bool:
    """Execute crawler job in separate process (Twisted reactor isolation)"""
    configure_logger()
    
    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    max_pages = payload.get("maxPages", 3000)
    timeout = payload.get("timeout", 0)
    
    # Use spawn context Manager to capture state from subprocess
    # spawn avoids fork issues with Twisted reactor and RabbitMQ connections
    manager = spawn_ctx.Manager()
    state = manager.dict()
    state["success"] = False
    state["error"] = None
    
    # Use module-level function (picklable for spawn)
    p = spawn_ctx.Process(
        target=_run_spider_subprocess,
        args=(state, url, session_id, job_id, project_id, max_pages, timeout, SCRAPY_SETTINGS)
    )
    p.start()
    p.join()
    
    # Check success flag first (more reliable than exit code)
    if state.get("success"):
        return True
    
    # If not successful, report the error
    error_msg = state.get("error") or f"Unknown error (exit code {p.exitcode})"
    logger.error(f"[CRAWLER] Subprocess error: {error_msg}")
    raise RuntimeError(f"Crawl process failed: {error_msg}")


def execute_schema_job(payload: dict) -> bool:
    """Execute schema generation job (Module B)"""
    from modules.module_B.schema_generator import SchemaGenerator
    
    configure_logger()
    
    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    schema_type = payload.get("schemaType")
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    
    # Use sourceJobId to load HTML (points to crawl job that saved the HTML)
    target_job_id = source_job_id if source_job_id else job_id
    
    html_content = load_raw_html_sync(target_job_id)
    if not html_content:
        logger.warning(f"[SCHEMA] No HTML for job {target_job_id}")
        result = {"success": False, "error": "RAW_HTML_NOT_FOUND"}
    else:
        generator = SchemaGenerator()
        result = generator.generate_schema(html_content, url, schema_type or "auto")
    
    mongo_manager.connect()
    mongo_manager.schemas.update_one(
        {"jobId": job_id, "url": url},
        {"$set": {
            "jobId": job_id,
            "sessionId": session_id,
            "projectId": project_id,
            "url": url,
            "createdAt": datetime.utcnow(),
            **result,
        }},
        upsert=True,
    )
    
    return True


def execute_module_c_job(payload: dict) -> bool:
    """Execute Module C (AEO Analysis) job"""
    from modules.module_C.runner import runner, run_module_c
    
    configure_logger()
    
    session_id = payload["sessionId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "AEO_ANALYSIS")
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    query = payload.get("query") or payload.get("config", {}).get("query")
    
    target_job_id = source_job_id if source_job_id else job_id
    
    logger.info(f"[MODULE_C] Starting job {job_id} type={job_type} for {url}")
    
    if job_type == "MODULE_C_AI_PRESENCE":
        asyncio.run(runner.run_submodule("ai_presence", target_job_id, url, query=query))
    elif job_type == "MODULE_C_ANSWERABILITY":
        asyncio.run(runner.run_submodule("answerability", target_job_id, url, query=query))
    elif job_type == "MODULE_C_KNOWLEDGE_BASE":
        asyncio.run(runner.run_submodule("knowledge_base", target_job_id, url, query=query))
    elif job_type == "MODULE_C_LLM_SIMULATOR":
        asyncio.run(runner.run_submodule("llm_simulator", target_job_id, url, query=query))
    elif job_type == "MODULE_C_ACTIONABLE_INSIGHTS":
        asyncio.run(runner.run_submodule("actionable_insights", target_job_id, url, query=query))
    else:
        # Default to full run
        asyncio.run(run_module_c(target_job_id, url, query=query))

    return True


def execute_module_d_job(payload: dict) -> bool:
    """Execute Module D (Content Analysis) job"""
    from modules.module_D.runner import run_module_d, run_content_metrics, run_entity_analysis
    
    configure_logger()
    
    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_D").upper()
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    
    # Use sourceJobId to load HTML (points to crawl job that saved the HTML)
    target_job_id = source_job_id if source_job_id else job_id
    
    logger.info(f"[MODULE_D] Starting job {job_id} type={job_type} for {url}, loading HTML from {target_job_id}")
    
    try:
        if job_type == "MODULE_D_CONTENT_METRICS" or job_type == "CONTENT_METRICS":
            asyncio.run(run_content_metrics(target_job_id, url))
        elif job_type == "MODULE_D_ENTITY_ANALYSIS":
            asyncio.run(run_entity_analysis(target_job_id, url))
        else:
            # Default to full run
            asyncio.run(run_module_d(target_job_id, url))
            
        return True
    except Exception as e:
        logger.error(f"[MODULE_D] Job failed: {e}", exc_info=True)
        raise


def mark_job_completed(job_id: str, session_id: str) -> None:
    """Mark a job as COMPLETED in Mongo and Redis"""
    mongo_client = get_mongo_client()
    db = mongo_client[config.MONGO_DB_NAME]
    r = redis.from_url(config.REDIS_URL)

    jobs = db.jobs
    sessions = db.sessions
    session_key = f"session:{session_id}"
    job_key = f"job:{job_id}"

    try:
        # Update status to COMPLETED
        jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "COMPLETED", "completedAt": datetime.utcnow()}},
        )
        
        sessions.update_one(
            {"id": session_id},
            {"$set": {"status": "COMPLETED", "completedAt": datetime.utcnow()}},
        )

        r.hset(session_key, mapping={"status": "COMPLETED"})
        r.expire(session_key, 3600)
        
        r.hset(job_key, mapping={"status": "COMPLETED"})
        r.expire(job_key, 3600)
        
        logger.info(f"Marked job {job_id} as COMPLETED via event handler")
    except Exception as e:
        logger.error(f"Failed to mark job {job_id} as completed: {e}")
    finally:
        mongo_client.close()


def mark_job_failed(job_id: str, session_id: str, error_message: str) -> None:
    """Mark a job as FAILED in Mongo and Redis"""
    mongo_client = get_mongo_client()
    db = mongo_client[config.MONGO_DB_NAME]
    r = redis.from_url(config.REDIS_URL)

    jobs = db.jobs
    sessions = db.sessions
    job_key = f"job:{job_id}"

    try:
        jobs.update_one(
            {"id": job_id},
            {"$set": {"status": "FAILED", "completedAt": datetime.utcnow(), "errorMessage": error_message}},
        )
        
        sessions.update_one(
            {"id": session_id},
            {"$set": {"status": "FAILED", "completedAt": datetime.utcnow(), "errorMessage": error_message}},
        )
        
        r.hset(job_key, mapping={"status": "FAILED"})
        r.expire(job_key, 3600)
        logger.info(f"Marked job {job_id} as FAILED: {error_message}")
    except Exception as e:
        logger.error(f"Failed to mark job {job_id} as failed: {e}")
    finally:
        mongo_client.close()


def execute_job(payload: dict, job_type: str = "crawl") -> bool:
    """Dispatch job execution based on payload.jobType or override"""
    job_type_resolved = (payload.get("jobType") or job_type or "CRAWL").upper()
    
    if job_type_resolved == "CRAWL":
        return execute_crawler_job(payload)
        
    if job_type_resolved.startswith("MODULE_C") or job_type_resolved == "AEO_ANALYSIS":
        return execute_module_c_job(payload)
        
    if job_type_resolved.startswith("MODULE_E"):
        return execute_module_e_job(payload)
        
    if job_type_resolved.startswith("MODULE_D") or job_type_resolved == "CONTENT_METRICS":
        return execute_module_d_job(payload)
        
    if job_type_resolved == "SCHEMA":
        return execute_schema_job(payload)
        
    # Default fallback
    logger.warning(f"Unknown job type {job_type_resolved}, defaulting to Module D analysis")
    return execute_module_d_job(payload)


def execute_module_e_job(payload: dict) -> bool:
    """Execute Module E (Brand Intelligence) job"""
    from modules.module_E.runner import run_module_e, run_consistency_only
    from modules.module_E.quick_start_runner import run_quick_start
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
    
    # Use sourceJobId to load HTML if needed (points to crawl job)
    target_job_id = source_job_id if source_job_id else job_id
    
    logger.info(f"[MODULE_E] Starting job {job_id} type={job_type} for {url}")
    
    try:
        # Execute specific sub-module based on job type
        if job_type == "MODULE_E_QUICK_START":
            # Runs Brand Analysis + Competitor Mentions + AI SOV + full crawl in parallel
            asyncio.run(run_quick_start(job_id, url, session_id=session_id, project_id=project_id))
        elif job_type == "MODULE_E_CONSISTENCY":
            asyncio.run(run_consistency_only(target_job_id, url))
        elif job_type == "MODULE_E_SENTIMENT":
            asyncio.run(run_sentiment_only(target_job_id, url))
        elif job_type == "MODULE_E_COMPETITORS":
            asyncio.run(run_competitor_analysis(target_job_id, url))
        elif job_type == "MODULE_E_AI_SOV":
            asyncio.run(run_ai_sov_analysis(target_job_id, url))
        elif job_type == "MODULE_E_RANKING" or job_type == "MODULE_E_AI_CITATION_RANKING":
            # Assuming AI_CITATION_RANKING uses ranking runner or similar
            asyncio.run(run_ranking_analysis(target_job_id, url))
        elif job_type == "MODULE_E_BRAND":
            asyncio.run(run_brand_only(target_job_id, url))
        else:
            # Default to full run or generic run
            asyncio.run(run_module_e(target_job_id, url))
            
        return True
        
    except Exception as e:
        logger.error(f"[MODULE_E] Job failed: {e}", exc_info=True)
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


def run_job_in_worker(payload: dict, job_type_override: str | None = None) -> None:
    job_type = (job_type_override or payload.get("jobType") or "CRAWL").upper()
    execute_job(payload, job_type)


def start_queue_worker() -> None:
    executor = ThreadPoolExecutor(max_workers=POOL_SIZE_PER_CATEGORY * len(QUEUE_CONFIGS))
    
    while True:
        connection: BlockingConnection | None = None
        try:
            params = pika.URLParameters(config.RABBITMQ_URL)
            connection = BlockingConnection(params)
            channel = connection.channel()
            runtime_redis = redis.from_url(config.REDIS_URL)

            # --- Setup Queues for All Categories ---
            for category, cfg in QUEUE_CONFIGS.items():
                
                # Main Exchange
                channel.exchange_declare(exchange=cfg.exchange, exchange_type="direct", durable=True)
                
                # DLX Exchange
                channel.exchange_declare(exchange=cfg.dlx, exchange_type="direct", durable=True)
                
                # Main Queue
                channel.queue_declare(
                    queue=cfg.queue,
                    durable=True,
                    arguments={"x-dead-letter-exchange": cfg.dlx},
                )
                
                # DLQ Queue
                channel.queue_declare(queue=cfg.dlq, durable=True)
                
                # Bindings
                channel.queue_bind(
                    exchange=cfg.exchange,
                    queue=cfg.queue,
                    routing_key=cfg.routing_key,
                )
                channel.queue_bind(
                    exchange=cfg.dlx,
                    queue=cfg.dlq,
                    routing_key=cfg.routing_key.replace(".job", ".failed"),
                )

            # --- Event Setup (for job completion tracking) ---
            channel.exchange_declare(exchange="job.events", exchange_type="topic", durable=True)
            channel.queue_declare(queue="job.events.queue", durable=True, arguments={'x-message-ttl': 86400000})
            channel.queue_bind(exchange="job.events", queue="job.events.queue", routing_key="job.#.JOB_COMPLETED")
            channel.queue_bind(exchange="job.events", queue="job.events.queue", routing_key="job.#.JOB_FAILED")

            channel.basic_qos(prefetch_count=POOL_SIZE_PER_CATEGORY)

            logger.info("🐇 RabbitMQ worker connected. Waiting for messages...")

            def on_event_message(ch, method, _properties, body) -> None:
                try:
                    message = json.loads(body)
                    job_id = message.get("jobId")
                    payload = message.get("payload", {})
                    session_id = payload.get("sessionId")
                    
                    if not job_id:
                        ch.basic_ack(delivery_tag=method.delivery_tag)
                        return

                    if not session_id:
                         # Try to get session_id from Redis if missing in payload
                         try:
                             r = redis.from_url(config.REDIS_URL)
                             job_key = f"job:{job_id}"
                             session_id_bytes = r.hget(job_key, "sessionId")
                             if session_id_bytes:
                                 session_id = session_id_bytes.decode('utf-8')
                         except Exception:
                             pass
                    
                    if not session_id:
                         logger.warning(f"Event {method.routing_key} missing session_id even after lookup")
                         ch.basic_ack(delivery_tag=method.delivery_tag)
                         return

                    if "JOB_COMPLETED" in method.routing_key:
                        mark_job_completed(job_id, session_id)
                    elif "JOB_FAILED" in method.routing_key:
                        reason = payload.get("reason", "Unknown error")
                        mark_job_failed(job_id, session_id, reason)
                        
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                    
                except Exception as e:
                    logger.error(f"Error processing event: {e}", exc_info=True)
                    ch.basic_ack(delivery_tag=method.delivery_tag)

            channel.basic_consume(queue="job.events.queue", on_message_callback=on_event_message)

            def on_message(ch, method, _properties, body) -> None:
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
                    logger.error(
                        f"Missing required fields in message: {missing_fields}; routing key: {method.routing_key}"
                    )
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

                session_key = f"session:{session_id}"
                job_key = f"job:{job_id}"

                runtime_redis.hset(
                    session_key,
                    mapping={
                        "status": "RECEIVED",
                        "url": url,
                        "projectId": project_id,
                    },
                )

                runtime_redis.hset(
                    job_key,
                    mapping={
                        "status": "RECEIVED",
                        "sessionId": session_id,
                        "projectId": project_id,
                        "url": url,
                        "jobType": job_type
                    },
                )

                future = executor.submit(run_job_in_worker, payload, job_type)

                def when_done(f) -> None:
                    try:
                        f.result()
                        action = "ack"
                    except RetryableJobError as e:
                        logger.error(
                            "Job execution failed with retryable error; requeueing",
                            exc_info=e,
                        )
                        action = "nack_requeue"
                    except Exception as e:
                        logger.error(
                            "Job execution failed with non-retryable error; sending to DLQ",
                            exc_info=e,
                        )
                        action = "nack_drop"

                    result_queue.put((ch, method.delivery_tag, action))

                future.add_done_callback(when_done)

            # --- Start Consuming from All Queues ---
            for category, cfg in QUEUE_CONFIGS.items():
                channel.basic_consume(
                    queue=cfg.queue,
                    on_message_callback=on_message,
                    auto_ack=False,
                )

            logger.info("🐇 RabbitMQ worker connected and consuming...")

            while channel._consumer_infos:
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

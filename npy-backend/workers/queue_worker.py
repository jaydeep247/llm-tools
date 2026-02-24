"""
Queue Worker
Consumes from isolated queues with parallel processing.
Each job category runs independently without affecting others.
"""

import json
import os
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
    
    logger.info(f"[CRAWLER] Starting job {job_id} for {url}")
    
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
        logger.info(f"[CRAWLER] Completed job {job_id}")
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
    
    logger.info(f"[SCHEMA] Starting job {job_id} for {url}, loading HTML from {target_job_id}")
    
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
    
    logger.info(f"[SCHEMA] Completed job {job_id}")
    return True


def execute_module_c_job(payload: dict) -> bool:
    """Execute Module C (AEO Analysis) job"""
    from modules.module_C.runner import run_module_c
    
    configure_logger()
    
    session_id = payload["sessionId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "AEO_ANALYSIS")
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    query = payload.get("query") or payload.get("config", {}).get("query")
    
    target_job_id = source_job_id if source_job_id else job_id
    
    logger.info(f"[MODULE_C] Starting job {job_id} type={job_type} for {url}")
    asyncio.run(run_module_c(target_job_id, url, query=query))
    logger.info(f"[MODULE_C] Completed job {job_id}")
    return True


def execute_module_d_job(payload: dict) -> bool:
    """Execute Module D (Content Analysis) job"""
    from modules.module_C.knowledge_base import KnowledgeBaseModule
    from modules.module_D.contentAnylsisMatrix import OpenAIService
    
    configure_logger()
    
    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    
    # Use sourceJobId to load HTML (points to crawl job that saved the HTML)
    target_job_id = source_job_id if source_job_id else job_id
    
    logger.info(f"[MODULE_D] Starting job {job_id} for {url}, loading HTML from {target_job_id}")
    
    html_content = load_raw_html_sync(target_job_id)
    if not html_content:
        result = {"success": False, "error": "RAW_HTML_NOT_FOUND"}
    else:
        kb_module = KnowledgeBaseModule()
        kb_result = asyncio.run(kb_module.run_analysis(html_content, url))
        entity_coverage = kb_result.get("entity_coverage") or {}
        
        found_entities = entity_coverage.get("found_entities") or []
        expected_entities = entity_coverage.get("expected_entities") or []
        
        ai_service = OpenAIService()
        content_metrics = ai_service.analyze_content_metrics(html_content, url)
        entity_relevance = ai_service.analyze_entity_relevance(
            html_content, url, found_entities, expected_entities
        )
        
        result = {
            "success": True,
            "content_metrics": content_metrics,
            "entity_metrics": {
                "entities_detected_count": len(found_entities),
                "entity_coverage_score": entity_coverage.get("coverage_score", 0),
                "entity_relevance_score": entity_relevance.get("entity_relevance_score", 50),
            },
        }
    
    mongo_manager.connect()
    mongo_manager.content_metrics.update_one(
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
    
    logger.info(f"[MODULE_D] Completed job {job_id}")
    return True


def execute_module_e_job(payload: dict) -> bool:
    """Execute Module E (Brand Intelligence) job"""
    from modules.module_E.runner import run_module_e, run_consistency_only
    from modules.module_E.sentiment_runner import run_sentiment_only
    from modules.module_E.competitor_runner import run_competitor_analysis
    from modules.module_E.ai_sov_runner import run_ai_sov_analysis
    from modules.module_E.ranking_runner import run_ranking_analysis
    from modules.module_E.brand_runner import run_brand_only
    
    configure_logger()
    
    session_id = payload["sessionId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_E_FULL")
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")
    sub_module = payload.get("subModule")
    modules = payload.get("modules", [])
    
    target_job_id = source_job_id if source_job_id else job_id
    
    logger.info(f"[MODULE_E] Starting job {job_id} type={job_type} for {url}")
    
    # Route to specific sub-module
    if job_type == JobType.MODULE_E_CONSISTENCY.value or sub_module == 'consistency' or 'module_e_consistency' in modules:
        asyncio.run(run_consistency_only(target_job_id, url, source_job_id=source_job_id))
    elif job_type == JobType.MODULE_E_SENTIMENT.value or sub_module == 'sentiment' or 'module_e_sentiment' in modules:
        asyncio.run(run_sentiment_only(target_job_id, url))
    elif job_type == JobType.MODULE_E_COMPETITORS.value or sub_module == 'competitors' or 'module_e_competitors' in modules:
        asyncio.run(run_competitor_analysis(target_job_id, url))
    elif job_type == JobType.MODULE_E_AI_SOV.value or sub_module == 'ai_sov' or 'module_e_ai_sov' in modules:
        asyncio.run(run_ai_sov_analysis(target_job_id, url))
    elif job_type == JobType.MODULE_E_RANKING.value or sub_module == 'ranking' or 'module_e_ranking' in modules:
        asyncio.run(run_ranking_analysis(target_job_id, url))
    elif job_type == JobType.MODULE_E_BRAND.value or sub_module == 'brand' or 'module_e_brand' in modules:
        asyncio.run(run_brand_only(target_job_id, url))
    else:
        asyncio.run(run_module_e(target_job_id, url, source_job_id=source_job_id))
    
    logger.info(f"[MODULE_E] Completed job {job_id}")
    return True


# Category to executor mapping
CATEGORY_EXECUTORS: Dict[JobCategory, Callable[[dict], bool]] = {
    JobCategory.CRAWLER: execute_crawler_job,
    JobCategory.SCHEMA: execute_schema_job,
    JobCategory.MODULE_C: execute_module_c_job,
    JobCategory.MODULE_D: execute_module_d_job,
    JobCategory.MODULE_E: execute_module_e_job,
}


# ============ QUEUE CONSUMER ============

class QueueConsumer:
    """
    Consumes from a single queue with its own thread pool.
    Ensures complete isolation between job categories.
    """
    
    def __init__(self, category: JobCategory, pool_size: int = 2):
        self.category = category
        self.queue_config = get_queue_config(category)
        self.pool_size = pool_size
        self.executor = ThreadPoolExecutor(max_workers=pool_size)
        self.result_queue: thread_queue.Queue = thread_queue.Queue()
        self.running = False
        
    def start(self) -> threading.Thread:
        """Start consuming from the queue in a separate thread"""
        self.running = True
        thread = threading.Thread(target=self._consume_loop, daemon=True)
        thread.start()
        logger.info(f"[{self.category.value}] Consumer started for {self.queue_config.queue}")
        return thread
    
    def stop(self):
        """Stop the consumer"""
        self.running = False
        self.executor.shutdown(wait=False)
        
    def _consume_loop(self):
        """Main consumption loop with reconnection"""
        while self.running:
            connection = None
            try:
                connection = self._connect_and_consume()
            except Exception as e:
                logger.error(f"[{self.category.value}] Consumer error: {e}")
                if connection:
                    try:
                        connection.close()
                    except:
                        pass
                time.sleep(5)
    
    def _connect_and_consume(self) -> BlockingConnection:
        """Connect to RabbitMQ and start consuming"""
        params = pika.URLParameters(config.RABBITMQ_URL)
        connection = BlockingConnection(params)
        channel = connection.channel()
        runtime_redis = redis.from_url(config.REDIS_URL)
        
        # Setup exchange and queues
        channel.exchange_declare(exchange=self.queue_config.exchange, exchange_type='direct', durable=True)
        channel.exchange_declare(exchange=self.queue_config.dlx, exchange_type='direct', durable=True)
        channel.queue_declare(
            queue=self.queue_config.queue,
            durable=True,
            arguments={'x-dead-letter-exchange': self.queue_config.dlx}
        )
        channel.queue_declare(queue=self.queue_config.dlq, durable=True)
        channel.queue_bind(exchange=self.queue_config.exchange, queue=self.queue_config.queue, routing_key=self.queue_config.routing_key)
        channel.queue_bind(exchange=self.queue_config.dlx, queue=self.queue_config.dlq, routing_key=f"{self.queue_config.routing_key}.failed")
        
        channel.basic_qos(prefetch_count=self.pool_size)
        logger.info(f"[{self.category.value}] Connected to queue: {self.queue_config.queue}")
        
        def on_message(ch, method, properties, body):
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                logger.error(f"[{self.category.value}] Invalid JSON, sending to DLQ")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return
            
            # Validate required fields
            required = ('sessionId', 'projectId', 'url')
            missing = [f for f in required if f not in payload]
            if missing:
                logger.error(f"[{self.category.value}] Missing fields: {missing}")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return
            
            job_id = payload.get('jobId') or f"job_{payload['sessionId']}"
            job_type = payload.get('jobType', self.category.value)
            
            # Update Redis status
            job_key = f"job:{job_id}"
            runtime_redis.hset(job_key, mapping={
                "status": "RUNNING",
                "jobType": job_type,
                "category": self.category.value,
                "url": payload["url"],
            })
            runtime_redis.expire(job_key, 3600)
            
            # Submit to thread pool
            future = self.executor.submit(self._execute_job, payload)
            
            def done_callback(f):
                try:
                    f.result()
                    self.result_queue.put((ch, method.delivery_tag, 'ack'))
                except RetryableJobError as e:
                    logger.error(f"[{self.category.value}] Retryable error: {e}")
                    self.result_queue.put((ch, method.delivery_tag, 'nack_requeue'))
                except Exception as e:
                    logger.error(f"[{self.category.value}] Non-retryable error: {e}")
                    self.result_queue.put((ch, method.delivery_tag, 'nack_drop'))
            
            future.add_done_callback(done_callback)
        
        channel.basic_consume(queue=self.queue_config.queue, on_message_callback=on_message, auto_ack=False)
        
        while self.running and channel._consumer_infos:
            connection.process_data_events(time_limit=1)
            self._drain_results(connection)
        
        return connection
    
    def _execute_job(self, payload: dict) -> bool:
        """Execute job using category-specific executor"""
        configure_logger()
        
        job_id = payload.get('jobId') or f"job_{payload['sessionId']}"
        
        mongo_client = get_mongo_client()
        db = mongo_client[config.MONGO_DB_NAME]
        r = redis.from_url(config.REDIS_URL)
        
        jobs = db.jobs
        sessions = db.sessions
        job_key = f"job:{job_id}"
        session_key = f"session:{payload['sessionId']}"
        
        try:
            # Update status to RUNNING
            jobs.update_one({"id": job_id}, {"$set": {"status": "RUNNING", "startedAt": datetime.utcnow()}})
            r.hset(job_key, mapping={"status": "RUNNING"})
            r.hset(session_key, mapping={"status": "RUNNING"})
            
            # Get and execute category-specific handler
            executor_fn = CATEGORY_EXECUTORS.get(self.category)
            if not executor_fn:
                raise NonRetryableJobError(f"No executor for category: {self.category}")
            
            executor_fn(payload)
            
            # Update status to COMPLETED
            jobs.update_one({"id": job_id}, {"$set": {"status": "COMPLETED", "completedAt": datetime.utcnow()}})
            sessions.update_one({"id": payload['sessionId']}, {"$set": {"status": "COMPLETED", "completedAt": datetime.utcnow()}})
            r.hset(job_key, mapping={"status": "COMPLETED"})
            r.hset(session_key, mapping={"status": "COMPLETED"})
            
            return True
            
        except (ServerSelectionTimeoutError, AutoReconnect, ConnectionFailure, RedisConnectionError, RedisTimeoutError) as e:
            raise RetryableJobError(str(e)) from e
        except Exception as e:
            logger.error(f"[{self.category.value}] Job {job_id} failed: {e}", exc_info=True)
            jobs.update_one({"id": job_id}, {"$set": {"status": "FAILED", "completedAt": datetime.utcnow(), "errorMessage": str(e)}})
            sessions.update_one({"id": payload['sessionId']}, {"$set": {"status": "FAILED", "errorMessage": str(e)}})
            r.hset(job_key, mapping={"status": "FAILED"})
            raise NonRetryableJobError(str(e)) from e
        finally:
            mongo_client.close()
    
    def _drain_results(self, connection: BlockingConnection):
        """Process acknowledgment queue"""
        while not self.result_queue.empty():
            ch, tag, action = self.result_queue.get()
            
            def do_ack():
                if action == 'ack':
                    ch.basic_ack(tag)
                elif action == 'nack_requeue':
                    ch.basic_nack(tag, requeue=True)
                else:
                    ch.basic_nack(tag, requeue=False)
            
            connection.add_callback_threadsafe(do_ack)


# ============ MAIN WORKER ============

class QueueWorker:
    """Main worker that spawns isolated consumers for each job category"""
    
    def __init__(self):
        self.consumers: Dict[JobCategory, QueueConsumer] = {}
        
    def start(self):
        """Start all isolated consumers"""
        logger.info("🚀 Starting Queue Worker...")
        
        threads = []
        for category in JobCategory:
            consumer = QueueConsumer(category=category, pool_size=POOL_SIZE_PER_CATEGORY)
            self.consumers[category] = consumer
            thread = consumer.start()
            threads.append(thread)
        
        logger.info(f"✅ Started {len(threads)} queue consumers (one per category)")
        
        # Wait for all threads
        for thread in threads:
            thread.join()
    
    def stop(self):
        """Stop all consumers"""
        for consumer in self.consumers.values():
            consumer.stop()


def start_queue_worker():
    """Entry point for queue worker"""
    configure_logger()
    worker = QueueWorker()
    
    try:
        worker.start()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        worker.stop()


if __name__ == "__main__":
    start_queue_worker()

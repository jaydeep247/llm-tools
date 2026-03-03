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

# Module-level Redis connection pool — shared across all threads, no per-call
# connection creation.
_redis_pool = redis.ConnectionPool.from_url(config.REDIS_URL, max_connections=20, decode_responses=True)


def _get_redis() -> redis.Redis:
    """Return a Redis client that draws from the shared connection pool."""
    return redis.Redis(connection_pool=_redis_pool)


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


# ============ UTILITIES ============

def is_job_cancelled(job_id: str) -> bool:
    """Check if a job has been cancelled by looking at Redis flag.
    Uses the shared connection pool — never opens a new connection per call.
    """
    try:
        return _get_redis().get(f"job:{job_id}:cancelled") == "true"
    except Exception:
        return False

def get_mongo_client() -> MongoClient:
    """Get MongoDB client"""
    return MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=5000)


def _run_spider_subprocess(state_dict, url, session_id, job_id, project_id, max_pages, timeout, scrapy_settings, suppress_completion_events=False):
    """
    Run Scrapy spider in subprocess.
    This function is at module level to be picklable for spawn multiprocessing.
    
    When suppress_completion_events=True the spider will NOT emit JOB_COMPLETED /
    JOB_FAILED / JOB_STARTED events via RabbitMQ.  Used by quick_start_runner's
    fire-and-forget crawl so the spider doesn't overwrite the real job status.
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
            suppress_completion_events=suppress_completion_events,
        )
        process.start()
        
        # If we reach here, crawl completed (Scrapy finished)
        try:
            state_dict["success"] = True
        except Exception:
            pass  # Manager may have been shut down (fire-and-forget caller)
        
        # Clean up publisher connection
        publisher.close()
        
    except Exception as e:
        try:
            state_dict["error"] = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
            state_dict["success"] = False
        except Exception:
            pass  # Manager may have been shut down (fire-and-forget caller)


# ============ JOB EXECUTORS ============

def execute_crawler_job(payload: dict) -> bool:
    """Execute crawler job in separate process (Twisted reactor isolation)"""
    configure_logger()
    
    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    max_pages = payload.get("maxPages") or config.MAX_CRAWL_PAGES
    timeout = payload.get("timeout", 0)
    
    logger.info(f"[CRAWLER] ▶️  Starting crawler job: {job_id} | URL: {url[:60]}... | MaxPages: {max_pages}")
    
    # Use spawn context Manager to capture state from subprocess
    # spawn avoids fork issues with Twisted reactor and RabbitMQ connections
    manager = spawn_ctx.Manager()
    state = manager.dict()
    state["success"] = False
    state["error"] = None
    
    # Build per-job settings with the correct page limit, overriding the module default
    job_scrapy_settings = {**SCRAPY_SETTINGS, "CLOSESPIDER_PAGECOUNT": max_pages}

    # Use module-level function (picklable for spawn)
    p = spawn_ctx.Process(
        target=_run_spider_subprocess,
        args=(state, url, session_id, job_id, project_id, max_pages, timeout, job_scrapy_settings)
    )
    p.start()

    # Poll with cancellation check instead of a blocking join()
    while p.is_alive():
        p.join(timeout=2.0)
        if p.is_alive() and is_job_cancelled(job_id):
            logger.info(f"[CRAWLER] 🛑 Job {job_id} cancelled — terminating crawler subprocess")
            p.terminate()
            p.join(timeout=5)
            if p.is_alive():
                p.kill()
                p.join(timeout=3)
            try:
                manager.shutdown()
            except Exception:
                pass
            logger.info(f"[CRAWLER] 🛑 Crawler subprocess terminated for cancelled job {job_id}")
            return True
    
    # Check success flag first (more reliable than exit code)
    if state.get("success"):
        logger.info(f"[CRAWLER] ✅ Completed successfully: {job_id}")
        return True
    
    # If not successful, report the error
    error_msg = state.get("error") or f"Unknown error (exit code {p.exitcode})"
    logger.error(f"[CRAWLER] ❌ Subprocess error: {error_msg}")
    raise RuntimeError(f"Crawl process failed: {error_msg}")


def execute_schema_job(payload: dict) -> bool:
    """Execute schema generation job (Module B)"""
    from modules.module_B.schema_generator import SchemaGenerator
    
    configure_logger()
    logger.info(f"[MODULE_B] ▶️  SCHEMA Processing started | Job: {payload.get('jobId', payload['sessionId'])}")
    
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
    
    logger.info(f"[MODULE_B] ✅ SCHEMA Processing completed | Job: {job_id}")
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
    html_content = payload.get("htmlContent") or payload.get("html_content")  # Support both formats
    
    target_job_id = source_job_id if source_job_id else job_id
    
    logger.info(f"[MODULE_C] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}...")
    logger.info(f"[MODULE_C] 🔧 Analysis type: {job_type.replace('MODULE_C_', '')}")
    logger.info(f"[MODULE_C] 🪣 HTML source: {('S3 bucket (target job: ' + target_job_id + ')') if not html_content else 'payload'}")
    logger.info(f"[MODULE_C] 🔍 Query: {query if query else 'None (using default)'}")
    
    try:
        if job_type == "MODULE_C_AI_PRESENCE":
            logger.info(f"[MODULE_C] ⚡ Executing AI Presence submodule...")
            result = asyncio.run(runner.run_submodule("ai_presence", target_job_id, url, html_content=html_content, query=query))
        elif job_type == "MODULE_C_ANSWERABILITY":
            logger.info(f"[MODULE_C] ⚡ Executing Answerability submodule...")
            result = asyncio.run(runner.run_submodule("answerability", target_job_id, url, html_content=html_content, query=query))
        elif job_type == "MODULE_C_KNOWLEDGE_BASE":
            logger.info(f"[MODULE_C] ⚡ Executing Knowledge Base submodule...")
            result = asyncio.run(runner.run_submodule("knowledge_base", target_job_id, url, html_content=html_content, query=query))
        elif job_type == "MODULE_C_LLM_SIMULATOR":
            logger.info(f"[MODULE_C] ⚡ Executing LLM Simulator submodule...")
            result = asyncio.run(runner.run_submodule("llm_simulator", target_job_id, url, html_content=html_content, query=query))
        elif job_type == "MODULE_C_ACTIONABLE_INSIGHTS":
            logger.info(f"[MODULE_C] ⚡ Executing Actionable Insights submodule...")
            result = asyncio.run(runner.run_submodule("actionable_insights", target_job_id, url, html_content=html_content, query=query))
        else:
            # Default to full run for AEO_ANALYSIS or unknown types
            logger.info(f"[MODULE_C] ⚡ Executing full Module C analysis (default)...")
            result = asyncio.run(run_module_c(target_job_id, url, html_content=html_content, query=query))
        
        # Check if result contains errors
        if isinstance(result, dict):
            if "error" in result:
                error_msg = result.get('error', '')
                logger.error(f"[MODULE_C] ⚠️  Module returned error: {error_msg}")
                logger.info(f"[MODULE_C] 📋 Full result: {result}")
                
                # Check if it's a missing HTML error
                if "HTML not found" in error_msg or "S3" in error_msg:
                    logger.error(f"[MODULE_C] ❌ S3 HTML retrieval failed for job {target_job_id}")
                    logger.info(f"[MODULE_C] 💡 Solution: Ensure crawler job {target_job_id} saved HTML to S3")
                    raise RuntimeError(f"HTML not found in S3 for job {target_job_id}. Run CRAWLER first.")
                else:
                    raise RuntimeError(f"Module C analysis error: {error_msg}")
            else:
                logger.info(f"[MODULE_C] 📊 Result received with {len(result)} keys")
                if "modules" in result:
                    logger.info(f"[MODULE_C] 📈 Overall score: {result.get('overall_score', 'N/A')}")

        logger.info(f"[MODULE_C] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_C] ❌ {job_type} Processing failed with error: {str(e)}", exc_info=True)
        raise


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
    
    logger.info(f"[MODULE_D] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}...")
    logger.info(f"[MODULE_D] 📄 Loading HTML from: {target_job_id}")
    
    try:
        logger.info(f"[MODULE_D] ⚡ Executing {job_type} analysis...")
        if job_type == "MODULE_D_CONTENT_METRICS" or job_type == "CONTENT_METRICS":
            logger.info(f"[MODULE_D] 📈 Running Content Metrics analysis...")
            result = asyncio.run(run_content_metrics(target_job_id, url))
        elif job_type == "MODULE_D_ENTITY_ANALYSIS":
            logger.info(f"[MODULE_D] 🏷️  Running Entity Analysis...")
            result = asyncio.run(run_entity_analysis(target_job_id, url))
        else:
            # Default to full run
            logger.info(f"[MODULE_D] 🔍 Running full Module D analysis (default)...")
            result = asyncio.run(run_module_d(target_job_id, url))
        
        # Check if result contains errors
        if isinstance(result, dict) and "error" in result:
            logger.error(f"[MODULE_D] ⚠️  Module returned error: {result.get('error')}")
            if "HTML" in str(result.get("error", "")):
                raise RuntimeError(f"HTML not found for job {target_job_id}. Make sure sourceJobId is provided.")
        else:
            logger.info(f"[MODULE_D] 📊 Result received")
            
        logger.info(f"[MODULE_D] ✅ {job_type} Processing completed successfully | Job: {job_id}")
        return True
    except Exception as e:
        logger.error(f"[MODULE_D] ❌ {job_type} Processing failed: {e}", exc_info=True)
        raise


def mark_job_completed(job_id: str, session_id: str) -> None:
    """Mark a job as COMPLETED in Mongo and Redis.

    Uses a conditional Mongo update (status not already terminal) so concurrent
    calls from the Node.js event consumer, the Python event consumer, and any
    direct caller are all idempotent — the first write wins, subsequent ones
    are no-ops at the DB level.
    """
    mongo_client = get_mongo_client()
    db = mongo_client[config.MONGO_DB_NAME]
    r = _get_redis()

    session_key = f"session:{session_id}"
    job_key = f"job:{job_id}"

    try:
        now = datetime.utcnow()
        # Only advance to COMPLETED if the document is not already in a
        # terminal state — prevents racing with Node.js consumer writes.
        db.jobs.update_one(
            {"id": job_id, "status": {"$nin": ["COMPLETED", "FAILED"]}},
            {"$set": {"status": "COMPLETED", "completedAt": now}},
        )
        db.sessions.update_one(
            {"id": session_id, "status": {"$nin": ["COMPLETED", "FAILED"]}},
            {"$set": {"status": "COMPLETED", "completedAt": now}},
        )

        r.hset(session_key, mapping={"status": "COMPLETED"})
        r.expire(session_key, 3600)
        r.hset(job_key, mapping={"status": "COMPLETED"})
        r.expire(job_key, 3600)

        logger.info(f"Marked job {job_id} as COMPLETED")
    except Exception as e:
        logger.error(f"Failed to mark job {job_id} as completed: {e}")
    finally:
        mongo_client.close()


def mark_job_failed(job_id: str, session_id: str, error_message: str) -> None:
    """Mark a job as FAILED in Mongo and Redis.

    Conditional update — will not overwrite a job that already reached
    COMPLETED (e.g., quick_start marked it completed before a cancel flag
    arrived from a slow session-delete request).
    """
    mongo_client = get_mongo_client()
    db = mongo_client[config.MONGO_DB_NAME]
    r = _get_redis()

    job_key = f"job:{job_id}"

    try:
        now = datetime.utcnow()
        db.jobs.update_one(
            {"id": job_id, "status": {"$nin": ["COMPLETED", "FAILED"]}},
            {"$set": {"status": "FAILED", "completedAt": now, "errorMessage": error_message}},
        )
        db.sessions.update_one(
            {"id": session_id, "status": {"$nin": ["COMPLETED", "FAILED"]}},
            {"$set": {"status": "FAILED", "completedAt": now, "errorMessage": error_message}},
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
    session_id = payload.get("sessionId", "unknown")
    
    if job_type_resolved == "CRAWL":
        logger.info(f"[DISPATCH] 📥 Routing to MODULE_A (Crawler) | Session: {session_id}")
        return execute_crawler_job(payload)
        
    if job_type_resolved.startswith("MODULE_C") or job_type_resolved == "AEO_ANALYSIS":
        logger.info(f"[DISPATCH] 📥 Routing to MODULE_C (AEO Analysis) | Session: {session_id}")
        return execute_module_c_job(payload)
        
    if job_type_resolved.startswith("MODULE_E"):
        logger.info(f"[DISPATCH] 📥 Routing to MODULE_E (Brand Intelligence) | Session: {session_id}")
        return execute_module_e_job(payload)

    if job_type_resolved.startswith("MODULE_F"):
        logger.info(f"[DISPATCH] 📥 Routing to MODULE_F (Competitor AI) | Session: {session_id}")
        return execute_module_f_job(payload)
        
    if job_type_resolved.startswith("MODULE_D") or job_type_resolved == "CONTENT_METRICS":
        logger.info(f"[DISPATCH] 📥 Routing to MODULE_D (Content Analysis) | Session: {session_id}")
        return execute_module_d_job(payload)
        
    if job_type_resolved == "SCHEMA":
        logger.info(f"[DISPATCH] 📥 Routing to MODULE_B (Schema) | Session: {session_id}")
        return execute_schema_job(payload)
        
    # Default fallback
    logger.warning(f"Unknown job type {job_type_resolved}, defaulting to Module D analysis")
    logger.info(f"[DISPATCH] 📥 Routing to MODULE_D (Content Analysis - Default) | Session: {session_id}")
    return execute_module_d_job(payload)


def execute_module_f_job(payload: dict) -> bool:
    """Execute Module F (Competitor AI Intelligence) job"""
    from modules.module_F.runner import run_module_f_competitor_ai_intelligence

    configure_logger()

    session_id = payload["sessionId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    job_type = payload.get("jobType", "MODULE_F_COMPETITOR_AI_INTELLIGENCE").upper()
    source_job_id = payload.get("sourceJobId") or payload.get("config", {}).get("sourceJobId")

    target_job_id = source_job_id if source_job_id else job_id

    logger.info(f"[MODULE_F] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}...")

    try:
        logger.info(f"[MODULE_F] ⚡ Executing Competitor AI Intelligence analysis...")
        if job_type == "MODULE_F_COMPETITOR_AI_INTELLIGENCE":
            result = asyncio.run(run_module_f_competitor_ai_intelligence(target_job_id, url))
        else:
            result = asyncio.run(run_module_f_competitor_ai_intelligence(target_job_id, url))

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
    
    # Use sourceJobId to load HTML if needed (points to crawl job)
    target_job_id = source_job_id if source_job_id else job_id
    
    logger.info(f"[MODULE_E] ▶️  {job_type} Processing started | Job: {job_id} | URL: {url[:50]}...")
    
    try:
        # Check cancellation before starting
        if is_job_cancelled(job_id):
            logger.info(f"[MODULE_E] 🛑 Job {job_id} cancelled before execution — skipping")
            return True

        # Execute specific sub-module based on job type
        if job_type == "MODULE_E_QUICK_START":
            logger.info(f"[MODULE_E] ⚡ Running Quick Start (Brand Analysis + Competitor + AI SOV + Crawl)...")
            # Runs Brand Analysis + Competitor Mentions + AI SOV + full crawl in parallel
            result = asyncio.run(run_quick_start(job_id, url, session_id=session_id, project_id=project_id))

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
        elif job_type == "MODULE_E_RANKING" or job_type == "MODULE_E_AI_CITATION_RANKING":
            logger.info(f"[MODULE_E] ⚡ Running Ranking Analysis...")
            # Assuming AI_CITATION_RANKING uses ranking runner or similar
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


def run_job_in_worker(payload: dict, job_type_override: str | None = None) -> None:
    job_type = (job_type_override or payload.get("jobType") or "CRAWL").upper()
    job_id = payload.get("jobId") or f"job_{payload.get('sessionId')}"
    session_id = payload.get("sessionId", "unknown")

    # Check if already cancelled before even starting
    if is_job_cancelled(job_id):
        logger.info(f"[WORKER] 🛑 Job {job_id} was cancelled before execution — skipping")
        mark_job_failed(job_id, session_id, "Cancelled: session deleted by user")
        return

    logger.info(f"[WORKER] 🔨 Processing job {job_id} (Type: {job_type})")
    execute_job(payload, job_type)


def start_queue_worker() -> None:
    executor = ThreadPoolExecutor(max_workers=POOL_SIZE_PER_CATEGORY * len(QUEUE_CONFIGS))

    # Shared Redis client for the pika dispatch loop.  pika callbacks are
    # invoked synchronously inside process_data_events (single-threaded), so
    # one pooled client is sufficient and avoids per-message connection teardown.
    dispatch_redis = _get_redis()

    # ------------------------------------------------------------------ #
    # Callbacks — defined once, outside the reconnect loop so they are    #
    # not redefined on every reconnection attempt.                        #
    # ------------------------------------------------------------------ #

    def on_event_message(ch, method, _properties, body) -> None:
        """Handle JOB_COMPLETED / JOB_FAILED events published by workers.
        Uses the shared Redis pool (no per-event connection).
        Mongo writes are idempotent via mark_job_completed / mark_job_failed.
        """
        try:
            message = json.loads(body)
            job_id = message.get("jobId")
            payload = message.get("payload", {})
            session_id = payload.get("sessionId")

            if not job_id:
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

            if not session_id:
                # Fall back to the Redis job hash written when the message was received.
                session_id = dispatch_redis.hget(f"job:{job_id}", "sessionId")

            if not session_id:
                logger.warning(
                    f"Event {method.routing_key} missing session_id even after Redis lookup — acking and skipping"
                )
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

        logger.info(f"\n{'='*80}")
        logger.info(f"[QUEUE] 📨 Message received from RabbitMQ")
        logger.info(f"[QUEUE] Session: {session_id} | Job: {job_id}")
        logger.info(f"[QUEUE] Type: {job_type or 'CRAWL'} | URL: {url[:60]}...")
        logger.info(f"[QUEUE] Routing key: {method.routing_key}")
        logger.info(f"{'='*80}")

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

        logger.info(f"[QUEUE] ⚙️  Status updated to RECEIVED in Redis")
        logger.info(f"[QUEUE] 🚀 Submitting job to thread pool...")
        future = executor.submit(run_job_in_worker, payload, job_type)

        def when_done(f) -> None:
            try:
                f.result()
                logger.info(f"[RESULT] ✅ Job {job_id} completed successfully!")
                logger.info(f"[RESULT] 📤 Acknowledging message to RabbitMQ")
                action = "ack"
            except RetryableJobError as e:
                logger.error(
                    f"[RESULT] ⚠️  Job {job_id} failed with retryable error; requeueing",
                    exc_info=e,
                )
                action = "nack_requeue"
            except Exception as e:
                logger.error(
                    f"[RESULT] ❌ Job {job_id} failed with non-retryable error; sending to DLQ",
                    exc_info=e,
                )
                action = "nack_drop"

            result_queue.put((ch, method.delivery_tag, action))

        future.add_done_callback(when_done)

    # ------------------------------------------------------------------ #
    # Reconnect loop                                                       #
    # ------------------------------------------------------------------ #
    while True:
        connection: BlockingConnection | None = None
        try:
            params = pika.URLParameters(config.RABBITMQ_URL)
            connection = BlockingConnection(params)

            # --- Infrastructure channel: declares all exchanges / queues / bindings ---
            # Closed immediately after setup so it does not hold a prefetch slot.
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
            infra_ch.exchange_declare(exchange="job.events", exchange_type="topic", durable=True)
            infra_ch.queue_declare(
                queue="job.events.queue", durable=True,
                arguments={"x-message-ttl": 86400000},
            )
            infra_ch.queue_bind(exchange="job.events", queue="job.events.queue", routing_key="job.#.JOB_COMPLETED")
            infra_ch.queue_bind(exchange="job.events", queue="job.events.queue", routing_key="job.#.JOB_FAILED")
            infra_ch.close()

            # --- One consumer channel per job category (isolated prefetch budgets) ---
            # global_qos=False (the pika default) means the limit is per-consumer,
            # so a saturated MODULE_E channel cannot starve CRAWLER or MODULE_C.
            consumer_channels = []
            for category, cfg in QUEUE_CONFIGS.items():
                ch = connection.channel()
                ch.basic_qos(prefetch_count=POOL_SIZE_PER_CATEGORY, global_qos=False)
                ch.basic_consume(queue=cfg.queue, on_message_callback=on_message, auto_ack=False)
                consumer_channels.append(ch)

            # --- Event channel (separate — does not compete with job prefetch) ---
            event_ch = connection.channel()
            event_ch.basic_qos(prefetch_count=20, global_qos=False)
            event_ch.basic_consume(queue="job.events.queue", on_message_callback=on_event_message)
            consumer_channels.append(event_ch)

            logger.info("🐇 RabbitMQ worker connected. Waiting for messages...")
            logger.info("📊 Queue Setup Summary:")
            for cat, cfg in QUEUE_CONFIGS.items():
                logger.info(f"   ├─ {cat.upper()}: queue={cfg.queue}, prefetch={POOL_SIZE_PER_CATEGORY}")
            logger.info("   └─ Event queue: job.events.queue (JOB_COMPLETED/JOB_FAILED)")
            logger.info("⏳ Ready to process jobs...\n")

            # process_data_events dispatches callbacks from ALL channels on the
            # connection in a single-threaded loop — no locking needed here.
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

import json
import os
import asyncio
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
import time
import logging
import queue as thread_queue

import pika
from pika.adapters.blocking_connection import BlockingConnection
from pika.exceptions import AMQPConnectionError
import redis
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, AutoReconnect, ConnectionFailure
from redis.exceptions import ConnectionError as RedisConnectionError, TimeoutError as RedisTimeoutError
from scrapy.crawler import CrawlerProcess

from utils.logger import configure_logger, logger
from utils.config import config
from utils.mongo import mongo_manager
from utils.storage import load_raw_html_sync
from workers.crawl_worker.spiders.website_spider import WebsiteSpider
from workers.crawl_worker.spiders.sitemap_discovery import SitemapDiscovery
from workers.crawl_worker.preflight import preflight_discover_all_urls
from modules.module_B.schema_generator import SchemaGenerator
from modules.module_C.knowledge_base import KnowledgeBaseModule
from modules.module_D.contentAnylsisMatrix import OpenAIService


POOL_SIZE = min(os.cpu_count() or 1, 4)
executor = ProcessPoolExecutor(max_workers=POOL_SIZE)
result_queue: "thread_queue.Queue[tuple[any, any, str]]" = thread_queue.Queue()


SCRAPY_SETTINGS = {
    "LOG_ENABLED": False,
    "ROBOTSTXT_OBEY": False,
    "CONCURRENT_REQUESTS": 4,
    "CONCURRENT_REQUESTS_PER_DOMAIN": 2,
    "DOWNLOAD_DELAY": 1.0,
    "RANDOMIZE_DOWNLOAD_DELAY": True,
    "AUTOTHROTTLE_ENABLED": True,
    "AUTOTHROTTLE_START_DELAY": 1.5,
    "AUTOTHROTTLE_MAX_DELAY": 10.0,
    "AUTOTHROTTLE_TARGET_CONCURRENCY": 1.0,
    "RETRY_ENABLED": True,
    "RETRY_TIMES": 5,
    "RETRY_HTTP_CODES": [429, 500, 502, 503, 504],
    "CLOSESPIDER_PAGECOUNT": 3000,
    "COOKIES_ENABLED": False,
    "DEFAULT_REQUEST_HEADERS": {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0 Safari/537.36"
        ),
    },
    "MONGO_URI": config.MONGO_URI,
    "MONGO_DATABASE": config.MONGO_DB_NAME,
    "MONGO_BATCH_SIZE": 10,
    "ITEM_PIPELINES": {
        "workers.crawl_worker.pipelines.mongo_pipeline.MongoPipeline": 300,
    },
}


class RetryableJobError(Exception):
    pass


class NonRetryableJobError(Exception):
    pass


def get_mongo_client() -> MongoClient:
    return MongoClient(config.MONGO_URI, serverSelectionTimeoutMS=5000)


def run_crawl_job(url: str, session_id: str, job_id: str, project_id: str) -> None:
    configure_logger()
    logger.info(f"Starting crawl job {job_id} for {url}")

    urls = preflight_discover_all_urls(url)
    total_urls = len(urls)
    logger.info(f"Preflight discovered {total_urls} unique URLs for {url}")

    process = CrawlerProcess(settings=SCRAPY_SETTINGS)

    process.crawl(
        WebsiteSpider,
        start_url=url,
        start_urls=list(urls),
        session_id=session_id,
        job_id=job_id,
        project_id=project_id,
        max_pages=3000,
        allow_discovery=False,
        planned_total=total_urls,
    )

    process.start()

    logger.info(f"Crawl finished for job {job_id} and url {url}")


def execute_job(payload: dict) -> bool:
    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"

    mongo_client = get_mongo_client()
    db = mongo_client[config.MONGO_DB_NAME]
    r = redis.from_url(config.REDIS_URL)

    try:
        jobs = db.jobs
        jobs.update_one(
            {"id": job_id},
            {
                "$set": {
                    "status": "RUNNING",
                    "startedAt": datetime.utcnow(),
                }
            },
        )

        session_key = f"session:{session_id}"
        r.hset(
            session_key,
            mapping={
                "status": "RUNNING",
                "url": url,
                "projectId": project_id,
            },
        )
        r.expire(session_key, 3600)

        job_key = f"job:{job_id}"
        r.hset(
            job_key,
            mapping={
                "status": "RUNNING",
                "sessionId": session_id,
                "projectId": project_id,
                "url": url,
            },
        )
        r.expire(job_key, 3600)

        # Pre-crawl planning: discover sitemap URLs to know how many links we plan to crawl
        try:
            async def _plan_crawl(start_url: str):
                discovery = SitemapDiscovery(timeout=30)
                return await discovery.discover_sitemaps(start_url)

            plan_result = asyncio.run(_plan_crawl(url))
            planned_urls = plan_result.get("discovered_urls", []) or []
            planned_count = len(planned_urls)

            logger.info(
                f"Planned crawl for job {job_id}: {planned_count} URLs discovered from sitemaps for {url}"
            )
            if planned_count > 0:
                r.hset(job_key, mapping={"plannedPages": planned_count})
        except Exception:
            # Planning is best-effort; continue even if sitemap discovery fails
            pass

        run_crawl_job(url=url, session_id=session_id, job_id=job_id, project_id=project_id)

        jobs.update_one(
            {"id": job_id},
            {
                "$set": {
                    "status": "COMPLETED",
                    "completedAt": datetime.utcnow(),
                }
            },
        )

        r.hset(session_key, mapping={"status": "COMPLETED"})
        r.expire(session_key, 3600)

        r.hset(job_key, mapping={"status": "COMPLETED"})
        r.expire(job_key, 3600)

        return True
    except (ServerSelectionTimeoutError, AutoReconnect, ConnectionFailure, RedisConnectionError, RedisTimeoutError) as e:
        raise RetryableJobError(str(e)) from e
    except Exception as e:
        jobs = db.jobs
        jobs.update_one(
            {"id": job_id},
            {
                "$set": {
                    "status": "FAILED",
                    "completedAt": datetime.utcnow(),
                }
            },
        )
        r.hset(job_key, mapping={"status": "FAILED"})
        r.expire(job_key, 3600)
        raise NonRetryableJobError(str(e)) from e
    finally:
        mongo_client.close()


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


def run_schema_job(url: str, session_id: str, job_id: str, project_id: str, schema_type: str | None = None) -> None:
    logger.info(f"Starting schema generation job {job_id} for {url}")

    try:
        html_content = load_raw_html_sync(job_id)
        if not html_content:
            logger.warning(f"No raw HTML found for job {job_id}, schema generation skipped")
            result = {
                "success": False,
                "error": "RAW_HTML_NOT_FOUND",
                "message": "No raw HTML found for this job. Run a crawl first.",
                "schema": None,
            }
        else:
            generator = SchemaGenerator()
            result = generator.generate_schema(html_content, url, schema_type or "auto")

        mongo_manager.connect()
        doc = {
            "jobId": job_id,
            "sessionId": session_id,
            "projectId": project_id,
            "url": url,
            "createdAt": datetime.utcnow(),
            **result,
        }
        mongo_manager.schemas.update_one(
            {"jobId": job_id, "url": url},
            {"$set": doc},
            upsert=True,
        )
        logger.info(f"Stored schema generation result for job {job_id}")
    except Exception as e:  # noqa: BLE001
        error_type = type(e).__name__
        logger.error(f"Schema generation failed for job {job_id} ({error_type})")


def run_content_metrics_job(url: str, session_id: str, job_id: str, project_id: str) -> None:
    logger.info(f"Starting content metrics job {job_id} for {url}")

    try:
        html_content = load_raw_html_sync(job_id)
        if not html_content:
            logger.warning(f"No raw HTML found for job {job_id}, content metrics analysis skipped")
            result = {
                "success": False,
                "error": "RAW_HTML_NOT_FOUND",
                "message": "No raw HTML found for this job. Run a crawl first.",
                "content_metrics": None,
                "entity_metrics": None,
            }
        else:
            kb_module = KnowledgeBaseModule()
            kb_result = asyncio.run(kb_module.run_analysis(html_content, url))
            entity_coverage = kb_result.get("entity_coverage") or {}

            found_entities = entity_coverage.get("found_entities") or []
            expected_entities = entity_coverage.get("expected_entities") or []

            ai_service = OpenAIService()
            content_metrics = ai_service.analyze_content_metrics(html_content, url)
            entity_relevance = ai_service.analyze_entity_relevance(
                html_content,
                url,
                found_entities,
                expected_entities,
            )

            entities_detected_count = len(found_entities)
            entity_coverage_score = entity_coverage.get("coverage_score", 0)

            entity_metrics = {
                "entities_detected_count": entities_detected_count,
                "entity_coverage_score": entity_coverage_score,
                "entity_relevance_score": entity_relevance.get("entity_relevance_score", 50),
                "entity_relevance_details": {
                    "relevant_entities": entity_relevance.get("relevant_entities", []),
                    "irrelevant_entities": entity_relevance.get("irrelevant_entities", []),
                },
            }

            result = {
                "success": True,
                "content_metrics": content_metrics,
                "entity_metrics": entity_metrics,
                "raw": {
                    "entity_coverage": entity_coverage,
                    "entity_relevance": entity_relevance,
                },
            }

        mongo_manager.connect()
        doc = {
            "jobId": job_id,
            "sessionId": session_id,
            "projectId": project_id,
            "url": url,
            "createdAt": datetime.utcnow(),
            **result,
        }
        mongo_manager.content_metrics.update_one(
            {"jobId": job_id, "url": url},
            {"$set": doc},
            upsert=True,
        )
        logger.info(f"Stored content metrics result for job {job_id}")
    except Exception as e:  # noqa: BLE001
        error_type = type(e).__name__
        logger.error(f"Content metrics analysis failed for job {job_id} ({error_type})")


def start_queue_worker() -> None:
    while True:
        connection: BlockingConnection | None = None
        try:
            params = pika.URLParameters(config.RABBITMQ_URL)
            connection = BlockingConnection(params)
            channel = connection.channel()
            runtime_redis = redis.from_url(config.REDIS_URL)

            channel.exchange_declare(exchange="crawl.exchange", exchange_type="direct", durable=True)
            channel.exchange_declare(exchange="crawl.dlx", exchange_type="direct", durable=True)
            channel.queue_declare(
                queue="crawl.queue",
                durable=True,
                arguments={"x-dead-letter-exchange": "crawl.dlx"},
            )
            channel.queue_declare(queue="crawl.dlq", durable=True)
            channel.queue_bind(
                exchange="crawl.exchange",
                queue="crawl.queue",
                routing_key="crawl.start",
            )
            channel.queue_bind(
                exchange="crawl.dlx",
                queue="crawl.dlq",
                routing_key="crawl.failed",
            )

            channel.basic_qos(prefetch_count=POOL_SIZE)

            logger.info("🐇 RabbitMQ worker connected. Waiting for crawl.start messages...")

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
                        f"Missing required fields in message: {missing_fields}; sending to DLQ"
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
                job_type = payload.get("jobType", "CRAWL").upper()
                schema_type = payload.get("schemaType")

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
                    },
                )

                def run_job() -> None:
                    if job_type == "SCHEMA":
                        run_schema_job(
                            url=url,
                            session_id=session_id,
                            job_id=job_id,
                            project_id=project_id,
                            schema_type=schema_type,
                        )
                    elif job_type == "CONTENT_METRICS":
                        run_content_metrics_job(
                            url=url,
                            session_id=session_id,
                            job_id=job_id,
                            project_id=project_id,
                        )
                    else:
                        execute_job(payload)

                future = executor.submit(run_job)

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

            channel.basic_consume(
                queue="crawl.queue",
                on_message_callback=on_message,
                auto_ack=False,
            )

            logger.info("🐇 RabbitMQ worker connected. Waiting for crawl.start messages...")

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

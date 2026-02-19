import json
from datetime import datetime
import time
import logging
import os
import asyncio

import pika
from pika.exceptions import AMQPConnectionError
import redis
from scrapy.crawler import CrawlerProcess
from scrapy.utils.log import configure_logging
from utils.logger import logger
from utils.config import config
from utils.mongo import mongo_manager
from utils.storage import load_raw_html_sync
from workers.crawl_worker.spiders.website_spider import WebsiteSpider
from modules.module_B.schema_generator import SchemaGenerator
from modules.module_C.knowledge_base import KnowledgeBaseModule
from modules.module_D.contentAnylsisMatrix import OpenAIService


def run_crawl_job(url: str, session_id: str, job_id: str, project_id: str) -> None:
    configure_logging()
    logging.getLogger("scrapy.core.scraper").disabled = True
    logging.getLogger("scrapy").disabled = True
    logger.info(f"Starting crawl job {job_id} for {url}")

    process = CrawlerProcess(
        settings={
            "LOG_ENABLED": False,
            "LOG_LEVEL": "ERROR",
            "LOG_FORMAT": "%(asctime)s [%(name)s] %(levelname)s: %(message)s",
            "MONGO_URI": config.MONGO_URI,
            "MONGO_DATABASE": config.MONGO_DB_NAME,
            "MONGO_BATCH_SIZE": 10,
        }
    )

    crawler = process.create_crawler(WebsiteSpider)
    process.crawl(
        crawler,
        start_url=url,
        session_id=session_id,
        job_id=job_id,
        project_id=project_id,
        max_concurrency=20,
        max_pages=0,
        timeout=0,
    )

    process.start()

    stats = crawler.stats.get_stats()
    pages_crawled = stats.get("pages_crawled", 0)
    start_time = stats.get("start_time", time.time())

    if isinstance(start_time, datetime):
        start_time = start_time.timestamp()

    duration = time.time() - start_time
    error_count = stats.get("log_count/ERROR", 0)

    logger.info(
        f"Crawl finished. Stats: pages={pages_crawled}, duration={duration}, errors={error_count}"
    )


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
    r = redis.from_url(config.REDIS_URL)

    params = pika.URLParameters(config.RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    # max_attempts = int(os.getenv("RABBITMQ_CONNECT_ATTEMPTS", "30"))
    # delay_seconds = float(os.getenv("RABBITMQ_CONNECT_DELAY", "2.0"))

    # attempt = 0
    # connection = None
    # while connection is None:
    #     attempt += 1
    #     try:
    #         logger.info(
    #             f"Connecting to RabbitMQ (attempt {attempt}/{max_attempts})..."
    #         )
    #         connection = pika.BlockingConnection(params)
    #     except AMQPConnectionError as e:
    #         if attempt >= max_attempts:
    #             logger.error(
    #                 f"Failed to connect to RabbitMQ after {attempt} attempts: {e}"
    #             )
    #             raise
    #         logger.warning(
    #             f"RabbitMQ not ready, retrying in {delay_seconds} seconds: {e}"
    #         )
    #         time.sleep(delay_seconds)
    #         continue
    channel = connection.channel()

    channel.exchange_declare(exchange="crawl.exchange", exchange_type="direct", durable=True)
    channel.queue_declare(queue="crawl.queue", durable=True)
    channel.queue_bind(
        exchange="crawl.exchange",
        queue="crawl.queue",
        routing_key="crawl.start",
    )

    channel.basic_qos(prefetch_count=1)

    logger.info("🐇 RabbitMQ worker connected. Waiting for crawl.start messages...")

    def handle(ch, method, _properties, body) -> None:
        try:
            msg = json.loads(body)
            session_id = msg["sessionId"]
            project_id = msg["projectId"]
            url = msg["url"]
            job_id = msg.get("jobId") or f"job_{session_id}"
            job_type = msg.get("jobType", "CRAWL").upper()
            schema_type = msg.get("schemaType")

            jobs = mongo_manager.db.jobs
            jobs.update_one(
                {"id": job_id},
                {
                    "$set": {
                        "status": "RUNNING",
                        "startedAt": datetime.utcnow(),
                    }
                },
            )

            key = f"session:{session_id}"
            r.hset(
                key,
                mapping={
                    "status": "RUNNING",
                    "url": url,
                    "projectId": project_id,
                },
            )
            r.expire(key, 3600)

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
                run_crawl_job(
                    url=url,
                    session_id=session_id,
                    job_id=job_id,
                    project_id=project_id,
                )

            jobs.update_one(
                {"id": job_id},
                {
                    "$set": {
                        "status": "COMPLETED",
                        "completedAt": datetime.utcnow(),
                    }
                },
            )

            r.hset(key, mapping={"status": "COMPLETED"})
            r.expire(key, 3600)

            r.hset(job_key, mapping={"status": "COMPLETED"})
            r.expire(job_key, 3600)

            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception as e:  # noqa: BLE001
            error_type = type(e).__name__
            logger.error(f"Error processing message ({error_type})")
            try:
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception:
                pass

    channel.basic_consume(queue="crawl.queue", on_message_callback=handle)
    channel.start_consuming()

import json
from datetime import datetime
import time
import logging

import pika
import redis
from scrapy.crawler import CrawlerProcess
from scrapy.utils.log import configure_logging

from utils.logger import logger
from utils.config import config
from utils.mongo import mongo_manager
from workers.crawl_worker.spiders.website_spider import WebsiteSpider


def run_crawl_job(url: str, session_id: str, job_id: str, project_id: str) -> None:
    configure_logging()
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


def start_queue_worker() -> None:
    r = redis.from_url(config.REDIS_URL)

    params = pika.URLParameters(config.RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
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

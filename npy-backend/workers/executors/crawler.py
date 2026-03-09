"""
Crawler executor (Module A).

Runs ScrapyBasedWebsiteSpider in an isolated subprocess via the spawn
multiprocessing context — necessary because Twisted's reactor cannot be
restarted after a fork.
"""

import multiprocessing
from utils.config import config
from utils.logger import configure_logger, logger
from workers.cancellation import is_job_cancelled
from workers.worker_config import SCRAPY_SETTINGS

# Spawn context avoids fork-related Twisted reactor and RabbitMQ issues.
spawn_ctx = multiprocessing.get_context('spawn')


def _run_spider_subprocess(state_dict, url, session_id, job_id, project_id,
                            max_pages, timeout, scrapy_settings,
                            suppress_completion_events=False):
    """
    Top-level (picklable) function that runs the Scrapy spider inside a
    spawned subprocess.  Must remain at module level for pickle to work.

    When suppress_completion_events=True the spider will NOT emit
    JOB_COMPLETED / JOB_FAILED / JOB_STARTED events via RabbitMQ.  Used by
    quick_start_runner's fire-and-forget crawl.
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

        try:
            state_dict["success"] = True
        except Exception:
            pass  # Manager may have been shut down (fire-and-forget caller)

        publisher.close()

    except Exception as e:
        try:
            state_dict["error"] = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
            state_dict["success"] = False
        except Exception:
            pass


def execute_crawler_job(payload: dict) -> bool:
    """Execute crawler job in a separate process (Twisted reactor isolation)."""
    configure_logger()

    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    max_pages = payload.get("maxPages") or config.MAX_CRAWL_PAGES
    timeout = payload.get("timeout", 0)

    logger.info(
        f"[CRAWLER] ▶️  Starting crawler job: {job_id} | "
        f"URL: {url[:60]}... | MaxPages: {max_pages}"
    )

    manager = spawn_ctx.Manager()
    state = manager.dict()
    state["success"] = False
    state["error"] = None

    job_scrapy_settings = {**SCRAPY_SETTINGS, "CLOSESPIDER_PAGECOUNT": max_pages}

    p = spawn_ctx.Process(
        target=_run_spider_subprocess,
        args=(state, url, session_id, job_id, project_id, max_pages, timeout, job_scrapy_settings),
    )
    p.start()

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

    if state.get("success"):
        logger.info(f"[CRAWLER] ✅ Completed successfully: {job_id}")
        return True

    error_msg = state.get("error") or f"Unknown error (exit code {p.exitcode})"
    logger.error(f"[CRAWLER] ❌ Subprocess error: {error_msg}")
    raise RuntimeError(f"Crawl process failed: {error_msg}")

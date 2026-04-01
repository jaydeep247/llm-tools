"""
Crawler executor (Module A).

Runs ScrapyBasedWebsiteSpider in an isolated subprocess via the spawn
multiprocessing context — necessary because Twisted's reactor cannot be
restarted after a fork.
"""

import multiprocessing
from utils.config import config
from utils.logger import configure_logger, logger
from workers.cancellation import is_job_cancelled, is_job_paused, clear_job_paused, get_pages_at_pause, mark_job_cancelled, JobCancelledError
from workers.worker_config import SCRAPY_SETTINGS

# Spawn context avoids fork-related Twisted reactor and RabbitMQ issues.
spawn_ctx = multiprocessing.get_context('spawn')


def _request_graceful_stop(proc, state_dict, timeout=10.0):
    """Ask the crawl subprocess to close the spider before forcing termination."""
    if proc is None:
        return False

    try:
        state_dict["stop_requested"] = True
        state_dict["cancelled"] = True
        state_dict["success"] = False
    except Exception:
        pass

    proc.join(timeout=timeout)
    return not proc.is_alive()


def _run_spider_subprocess(state_dict, url, session_id, job_id, project_id,
                            max_pages, timeout, scrapy_settings,
                            suppress_completion_events=False,
                            pause_on_limit=False,
                            is_resume=False,
                            pages_crawled_offset=0,
                            main_keyword="",
                            ga_property_id=""):
    """
    Top-level (picklable) function that runs the Scrapy spider inside a
    spawned subprocess.  Must remain at module level for pickle to work.

    When suppress_completion_events=True the spider will NOT emit
    JOB_COMPLETED / JOB_FAILED / JOB_STARTED events via RabbitMQ.  Used by
    quick_start_runner's fire-and-forget crawl.

    When pause_on_limit=True the spider emits CRAWL_PAUSED and sets the Redis
    paused flag instead of JOB_COMPLETED when the page-count limit is hit.

    When is_resume=True the spider skips fresh discovery and pulls remaining
    URLs from the persisted Redis scheduler queue.
    """
    import traceback
    from scrapy.crawler import CrawlerProcess
    from twisted.internet import task

    try:
        from workers.crawl_worker.spiders.website_spider import WebsiteSpider
        from utils.event_publisher import publisher
        from utils.logger import configure_logger

        configure_logger()

        try:
            state_dict["success"] = False
            state_dict["cancelled"] = bool(state_dict.get("cancelled"))
            state_dict["stop_requested"] = bool(state_dict.get("stop_requested"))
        except Exception:
            pass

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
            pause_on_limit=pause_on_limit,
            is_resume=is_resume,
            pages_crawled_offset=pages_crawled_offset,
            main_keyword=main_keyword,
            ga_property_id=ga_property_id,
        )
        close_requested = False

        def _poll_for_stop_request():
            nonlocal close_requested

            if close_requested:
                return

            try:
                if not bool(state_dict.get("stop_requested")):
                    return
            except Exception:
                return

            spider = getattr(crawler, "spider", None)
            engine = getattr(crawler, "engine", None)
            if spider is None or engine is None:
                return

            close_requested = True
            try:
                spider.suppress_completion_events = True
                spider._cancelled_by_user = True
            except Exception:
                pass

            logger.info(f"[CRAWLER] Graceful stop requested for {job_id} — closing spider")
            try:
                engine.close_spider(spider, reason='cancelled')
            except Exception as exc:
                logger.warning(f"[CRAWLER] Failed to close spider gracefully for {job_id}: {exc}")
                try:
                    process.stop()
                except Exception:
                    pass

        stop_loop = task.LoopingCall(_poll_for_stop_request)
        stop_loop.start(0.5, now=False)
        process.start()

        try:
            if stop_loop.running:
                stop_loop.stop()
        except Exception:
            pass

        try:
            was_cancelled = bool(state_dict.get("stop_requested")) or bool(state_dict.get("cancelled"))
            state_dict["cancelled"] = was_cancelled
            state_dict["success"] = not was_cancelled
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
    main_keyword = payload.get("mainKeyword") or ""
    ga_property_id = payload.get("gaPropertyId") or ""

    logger.info(f"[CRAWLER_RESUME] ▶️  Resuming crawler job: {job_id} | URL: {url[:60]}")

    logger.info(
        f"[CRAWLER] ▶️  Starting crawler job: {job_id} | "
        f"URL: {url[:60]}... | MaxPages: {max_pages}"
    )

    # Flush any stale Redis scheduler/dupefilter keys from a previous run of
    # this same job_id so the crawler always starts completely fresh.
    try:
        from workers.cancellation import _get_redis
        _r = _get_redis()
        spider_name = f"website_spider_{job_id}"
        _r.delete(f"{spider_name}:requests", f"{spider_name}:dupefilter")
        logger.info(f"[CRAWLER] Cleared stale Redis keys for {job_id}")
    except Exception as _redis_err:
        logger.warning(f"[CRAWLER] Could not clear Redis keys for {job_id}: {_redis_err}")

    manager = spawn_ctx.Manager()
    state = manager.dict()
    state["success"] = False
    state["error"] = None
    state["cancelled"] = False
    state["stop_requested"] = False

    job_scrapy_settings = {**SCRAPY_SETTINGS, "CLOSESPIDER_PAGECOUNT": max_pages}

    p = spawn_ctx.Process(
        target=_run_spider_subprocess,
        args=(state, url, session_id, job_id, project_id, max_pages, timeout, job_scrapy_settings),
        kwargs={"main_keyword": main_keyword, "ga_property_id": ga_property_id},
    )
    p.start()

    while p.is_alive():
        p.join(timeout=2.0)
        if p.is_alive() and is_job_cancelled(job_id):
            logger.info(f"[CRAWLER] 🛑 Job {job_id} cancelled — requesting graceful crawler shutdown")
            _request_graceful_stop(p, state)
            if p.is_alive():
                logger.warning(f"[CRAWLER] Graceful shutdown timed out for {job_id} — forcing termination")
                p.terminate()
                p.join(timeout=5)
            if p.is_alive():
                p.kill()
                p.join(timeout=3)
            try:
                manager.shutdown()
            except Exception:
                pass
            mark_job_cancelled(job_id)
            _emit_crawl_status_update(job_id, "cancelled", session_id, project_id, url)
            logger.info(f"[CRAWLER] 🛑 Crawler subprocess terminated for cancelled job {job_id}")
            raise JobCancelledError(f"Job {job_id} was stopped by user")

    if state.get("success"):
        logger.info(f"[CRAWLER] ✅ Completed successfully: {job_id}")
        return True

    error_msg = state.get("error") or f"Unknown error (exit code {p.exitcode})"
    logger.error(f"[CRAWLER] ❌ Subprocess error: {error_msg}")
    raise RuntimeError(f"Crawl process failed: {error_msg}")


def _emit_crawl_status_update(job_id: str, status: str, session_id: str = None,
                              project_id: str = None, url: str = None) -> None:
    """Write crawl_status to MongoDB and publish CRAWL_STATUS_UPDATED event.

    The job_summaries document is keyed by camelCase ``jobId`` (written by
    the Quick Start runner with upsert=True).  Using snake_case ``job_id``
    with upsert=False causes every resume status update to silently miss the
    document, leaving crawl_status stuck at 'paused' after a resume.
    """
    try:
        from datetime import datetime
        from utils.mongo import get_db
        from utils.event_publisher import publisher
        db = get_db()
        db["job_summaries"].update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "crawl_status": status,
                    "crawlUpdatedAt": datetime.utcnow(),
                },
            },
            upsert=True,
        )
        publisher.emit_event(job_id, "CRAWL_STATUS_UPDATED", {
            "crawl_status": status,
            "url": url or "",
            "projectId": project_id or "",
            "sessionId": session_id or "",
        }, retries=3)
    except Exception as exc:
        logger.warning(f"[CRAWLER_RESUME] Failed to emit status update for {job_id}: {exc}")


def execute_resume_crawler_job(payload: dict) -> bool:
    """
    Resume a previously paused crawl job.

    The Scrapy Redis scheduler persists the unvisited-URL queue under
    ``website_spider_{job_id}:start_urls`` when the spider closes, so
    relaunching with ``is_resume=True`` (and max_pages=0 for unlimited)
    picks up exactly where crawling stopped.
    """
    configure_logger()

    session_id = payload["sessionId"]
    project_id = payload["projectId"]
    url = payload["url"]
    job_id = payload.get("jobId") or f"job_{session_id}"
    timeout = payload.get("timeout", 0)
    main_keyword = payload.get("mainKeyword") or ""
    ga_property_id = payload.get("gaPropertyId") or ""

    logger.info(f"[CRAWLER_RESUME] ▶️  Resuming crawler job: {job_id} | URL: {url[:60]}")

    # Read how many pages were crawled before the pause so the resume spider
    # displays cumulative progress instead of resetting to 1.
    pages_offset = get_pages_at_pause(job_id)
    logger.info(f"[CRAWLER_RESUME] Resuming from page offset {pages_offset}")

    # Clear the paused flag and emit running status before starting.
    clear_job_paused(job_id)
    _emit_crawl_status_update(job_id, "running", session_id, project_id, url)

    manager = spawn_ctx.Manager()
    state = manager.dict()
    state["success"] = False
    state["error"] = None
    state["cancelled"] = False
    state["stop_requested"] = False

    # No CLOSESPIDER_PAGECOUNT for the resume — crawl until finished.
    # SCHEDULER_PERSIST=True so the spider reads from the persisted Redis
    # priority queue that was kept alive during the pause.
    job_scrapy_settings = {**SCRAPY_SETTINGS, "CLOSESPIDER_PAGECOUNT": 0, "SCHEDULER_PERSIST": True}

    p = spawn_ctx.Process(
        target=_run_spider_subprocess,
        args=(state, url, session_id, job_id, project_id, 0, timeout, job_scrapy_settings),
        kwargs={
            "suppress_completion_events": True,
            "pause_on_limit": False,
            "is_resume": True,
            "pages_crawled_offset": pages_offset,
            "main_keyword": main_keyword,
            "ga_property_id": ga_property_id,
        },
    )
    p.start()

    while p.is_alive():
        p.join(timeout=2.0)
        if p.is_alive() and is_job_cancelled(job_id):
            logger.info(f"[CRAWLER_RESUME] 🛑 Job {job_id} cancelled — requesting graceful crawler shutdown")
            _request_graceful_stop(p, state)
            if p.is_alive():
                logger.warning(f"[CRAWLER_RESUME] Graceful shutdown timed out for {job_id} — forcing termination")
                p.terminate()
                p.join(timeout=5)
            if p.is_alive():
                p.kill()
                p.join(timeout=3)
            try:
                manager.shutdown()
            except Exception:
                pass
            mark_job_cancelled(job_id)
            _emit_crawl_status_update(job_id, "cancelled", session_id, project_id, url)
            raise JobCancelledError(f"Job {job_id} was stopped by user")

    if state.get("success"):
        logger.info(f"[CRAWLER_RESUME] ✅ Completed successfully: {job_id}")
        _emit_crawl_status_update(job_id, "completed", session_id, project_id, url)
        return True

    error_msg = state.get("error") or f"Unknown error (exit code {p.exitcode})"
    logger.error(f"[CRAWLER_RESUME] ❌ Subprocess error: {error_msg}")
    _emit_crawl_status_update(job_id, "failed", session_id, project_id, url)
    raise RuntimeError(f"Crawl resume process failed: {error_msg}")

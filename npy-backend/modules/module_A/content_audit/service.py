import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Literal, Optional

import aiohttp
from pymongo import UpdateOne

from modules.module_A.ContentAudit.BacklinkMetrics import extract_backlink_metrics_batch
from modules.module_A.ContentAudit.ContentMetrics import extract_content_metrics
from modules.module_A.ContentAudit.KeywordMetrics import extract_keyword_metrics, extract_keyword_metrics_batch
from modules.module_A.ContentAudit.PerformanceMetrics import extract_performance_metrics_batch
from utils.mongo import mongo_manager

logger = logging.getLogger("content_audit_http")

MetricType = Literal[
    "keyword-metrics",
    "performance-metrics",
    "content-metrics",
    "backlink-metrics",
]


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _first_h1(page_doc: Dict[str, Any]) -> str:
    h1_tags = page_doc.get("h1_tags") or []
    if isinstance(h1_tags, list) and h1_tags:
        return str(h1_tags[0] or "")
    return ""


def _build_lookup(docs: Iterable[Dict[str, Any]], key: str = "url") -> Dict[str, Dict[str, Any]]:
    lookup: Dict[str, Dict[str, Any]] = {}
    for doc in docs:
        value = doc.get(key)
        if value:
            lookup[str(value)] = doc
    return lookup


def _resolve_target_urls(job_id: str, urls: Optional[List[str]]) -> List[str]:
    if urls:
        cleaned = []
        seen = set()
        for url in urls:
            if not isinstance(url, str):
                continue
            normalized = url.strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            cleaned.append(normalized)
        return cleaned

    docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id},
            {"_id": 0, "url": 1},
        )
    )
    return [str(doc["url"]) for doc in docs if doc.get("url")]


async def _fetch_html_documents(urls: List[str], concurrency: int = 5) -> Dict[str, Dict[str, Any]]:
    if not urls:
        return {}

    timeout = aiohttp.ClientTimeout(total=30)
    semaphore = asyncio.Semaphore(concurrency)

    async def _fetch_one(session: aiohttp.ClientSession, url: str) -> tuple[str, Dict[str, Any]]:
        async with semaphore:
            try:
                async with session.get(url, allow_redirects=True) as response:
                    html = await response.text(errors="ignore")
                    return url, {
                        "html_content": html,
                        "response_headers": dict(response.headers),
                        "final_url": str(response.url),
                        "status_code": response.status,
                    }
            except Exception as exc:
                logger.warning("Content audit HTML fetch failed for %s: %s", url, exc)
                return url, {
                    "html_content": "",
                    "response_headers": {},
                    "error": str(exc),
                }

    async with aiohttp.ClientSession(timeout=timeout) as session:
        results = await asyncio.gather(*[_fetch_one(session, url) for url in urls])
    return {url: payload for url, payload in results}


async def _resolve_main_keyword(field_doc: Dict[str, Any], page_doc: Dict[str, Any]) -> tuple[str, str]:
    existing_keyword = (field_doc.get("main_keyword") or "").strip()
    if existing_keyword:
        return existing_keyword, str(field_doc.get("keyword_source") or "provided")

    resolved = await extract_keyword_metrics(
        url=str(field_doc.get("url") or page_doc.get("url") or ""),
        html_content="",
        title=str(page_doc.get("title") or ""),
        h1=_first_h1(page_doc),
    )
    return (
        str(resolved.get("main_keyword") or "").strip(),
        str(resolved.get("keyword_source") or ""),
    )


async def _run_keyword_metrics(job_id: str, urls: List[str], run_at: str) -> int:
    page_docs = list(
        mongo_manager.pages.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "title": 1, "h1_tags": 1},
        )
    )
    field_docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "main_keyword": 1, "keyword_source": 1},
        )
    )

    pages_by_url = _build_lookup(page_docs)
    fields_by_url = _build_lookup(field_docs)

    batch_items: List[Dict[str, Any]] = []
    keyword_sources: Dict[str, str] = {}
    for url in urls:
        field_doc = fields_by_url.get(url, {"url": url})
        page_doc = pages_by_url.get(url, {"url": url})
        main_keyword, keyword_source = await _resolve_main_keyword(field_doc, page_doc)
        keyword_sources[url] = keyword_source
        batch_items.append(
            {
                "url": url,
                "main_keyword": main_keyword,
                "volume_global": None,
                "volume_us": None,
                "kd_us": None,
                "cpc_usd": None,
            }
        )

    results = await extract_keyword_metrics_batch(batch_items)
    operations = []
    for result in results:
        url = result.get("url")
        if not url:
            continue
        operations.append(
            UpdateOne(
                {"jobId": job_id, "url": url},
                {
                    "$set": {
                        "main_keyword": result.get("main_keyword"),
                        "keyword_source": keyword_sources.get(url) or None,
                        "volume_global": result.get("volume_global"),
                        "volume_us": result.get("volume_us"),
                        "kd_us": result.get("kd_us"),
                        "cpc_usd": result.get("cpc_usd"),
                        "keyword_metrics_audit_log": result.get("audit_log") or {},
                        "keyword_metrics_last_run_at": run_at,
                    }
                },
                upsert=False,
            )
        )

    if not operations:
        return 0

    write_result = mongo_manager.fields.bulk_write(operations, ordered=False)
    return int(write_result.modified_count)


async def _run_performance_metrics(job_id: str, urls: List[str], run_at: str) -> int:
    page_docs = list(
        mongo_manager.pages.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "title": 1, "h1_tags": 1},
        )
    )
    field_docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "main_keyword": 1, "performance_metrics": 1},
        )
    )

    pages_by_url = _build_lookup(page_docs)
    fields_by_url = _build_lookup(field_docs)

    batch_items: List[Dict[str, Any]] = []
    for url in urls:
        field_doc = fields_by_url.get(url, {"url": url})
        page_doc = pages_by_url.get(url, {"url": url})
        performance_metrics = field_doc.get("performance_metrics") or {}
        main_keyword, _ = await _resolve_main_keyword(field_doc, page_doc)
        batch_items.append(
            {
                "url": url,
                "main_keyword": main_keyword,
                "currentRanking": performance_metrics.get("currentRanking"),
                "ga30DaysTraffic": performance_metrics.get("ga30DaysTraffic"),
                "overallKeywords": performance_metrics.get("overallKeywords"),
                "firstPageKeywords": performance_metrics.get("firstPageKeywords"),
            }
        )

    results = await extract_performance_metrics_batch(batch_items, force_refresh=True)
    operations = []
    for result in results:
        url = result.get("url")
        if not url:
            continue
        operations.append(
            UpdateOne(
                {"jobId": job_id, "url": url},
                {
                    "$set": {
                        "performance_metrics.currentRanking": result.get("currentRanking"),
                        "performance_metrics.ga30DaysTraffic": result.get("ga30DaysTraffic"),
                        "performance_metrics.overallKeywords": result.get("overallKeywords"),
                        "performance_metrics.firstPageKeywords": result.get("firstPageKeywords"),
                        "performance_metrics_audit_log": result.get("audit_log") or {},
                        "performance_metrics_last_run_at": run_at,
                    }
                },
                upsert=False,
            )
        )

    if not operations:
        return 0

    write_result = mongo_manager.fields.bulk_write(operations, ordered=False)
    return int(write_result.modified_count)


async def _run_backlink_metrics(job_id: str, urls: List[str], run_at: str) -> int:
    field_docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id},
            {
                "_id": 0,
                "url": 1,
                "main_keyword": 1,
                "internal_outlinks": 1,
                "external_outlinks": 1,
                "outlink_url_list": 1,
                "inlinks": 1,
                "pr_score": 1,
                "current_referring_domains": 1,
                "min_required_rds": 1,
                "backlink_metrics": 1,
            },
        )
    )

    selected = set(urls)
    batch_items: List[Dict[str, Any]] = []
    for doc in field_docs:
        backlink_metrics = doc.get("backlink_metrics") or {}
        url = doc.get("url")
        force_refresh = url in selected
        batch_items.append(
            {
                "url": url,
                "main_keyword": doc.get("main_keyword") or "",
                "inlinks": doc.get("inlinks"),
                "internal_outlinks": doc.get("internal_outlinks", backlink_metrics.get("internal_outlinks")),
                "external_outlinks": doc.get("external_outlinks", backlink_metrics.get("external_outlinks")),
                "outlink_url_list": doc.get("outlink_url_list") or backlink_metrics.get("outlink_url_list") or [],
                "pr_score": None if force_refresh else doc.get("pr_score", backlink_metrics.get("pr_score")),
                "current_referring_domains": None if force_refresh else doc.get("current_referring_domains", backlink_metrics.get("current_referring_domains")),
                "min_required_rds": None if force_refresh else doc.get("min_required_rds", backlink_metrics.get("min_required_rds")),
            }
        )

    results = await extract_backlink_metrics_batch(batch_items)
    operations = []
    for result in results:
        url = result.get("url")
        if not url or url not in selected:
            continue
        operations.append(
            UpdateOne(
                {"jobId": job_id, "url": url},
                {
                    "$set": {
                        "backlink_metrics": result,
                        "inlinks": result.get("inlinks"),
                        "internal_outlinks": result.get("internal_outlinks"),
                        "external_outlinks": result.get("external_outlinks"),
                        "link_ratio": result.get("link_ratio"),
                        "link_ratio_pass": result.get("link_ratio_pass"),
                        "pr_score": result.get("pr_score"),
                        "current_referring_domains": result.get("current_referring_domains"),
                        "min_required_rds": result.get("min_required_rds"),
                        "rds_to_acquire": result.get("rds_to_acquire"),
                        "backlink_audit_log": result.get("audit_log") or {},
                        "backlink_metrics_last_run_at": run_at,
                    }
                },
                upsert=False,
            )
        )

    if not operations:
        return 0

    write_result = mongo_manager.fields.bulk_write(operations, ordered=False)
    return int(write_result.modified_count)


def _build_content_audit_log(result: Dict[str, Any], fetch_payload: Dict[str, Any]) -> Dict[str, str]:
    if not fetch_payload.get("html_content"):
        error = fetch_payload.get("error")
        return {
            "currentWordCount": "ERROR-NO-HTML",
            "serpIntentWordCount": "ERROR-NO-HTML",
            "needToAddWordCount": "ERROR-NO-HTML",
            "publishedDate": f"ERROR-{error}" if error else "ERROR-NO-HTML",
            "upgradeDate": f"ERROR-{error}" if error else "ERROR-NO-HTML",
        }

    return {
        "currentWordCount": "FETCHED" if result.get("currentWordCount") is not None else "NULL",
        "serpIntentWordCount": "FETCHED" if result.get("serpIntentWordCount") is not None else "NULL",
        "needToAddWordCount": "COMPUTED" if result.get("needToAddWordCount") is not None else "NULL",
        "publishedDate": "FETCHED" if result.get("publishedDate") else "NULL",
        "upgradeDate": "FETCHED" if result.get("upgradeDate") else "NULL",
    }


async def _run_content_metrics(job_id: str, urls: List[str], run_at: str) -> int:
    page_docs = list(
        mongo_manager.pages.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "title": 1, "h1_tags": 1, "word_count": 1},
        )
    )
    field_docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "main_keyword": 1, "content_matrix": 1},
        )
    )

    pages_by_url = _build_lookup(page_docs)
    fields_by_url = _build_lookup(field_docs)
    html_by_url = await _fetch_html_documents(urls)

    operations = []
    for url in urls:
        page_doc = pages_by_url.get(url, {"url": url})
        field_doc = fields_by_url.get(url, {"url": url})
        fetch_payload = html_by_url.get(url, {})
        result = await extract_content_metrics(
            url=url,
            html_content=str(fetch_payload.get("html_content") or ""),
            main_keyword=str(field_doc.get("main_keyword") or ""),
            response_headers=fetch_payload.get("response_headers") or {},
            existing_item={},
            h1=_first_h1(page_doc),
            title=str(page_doc.get("title") or ""),
            word_count=page_doc.get("word_count") or 0,
        )

        content_matrix = {
            "currentWordCount": result.get("currentWordCount"),
            "serpIntentWordCount": result.get("serpIntentWordCount"),
            "needToAddWordCount": result.get("needToAddWordCount"),
            "publishedDate": result.get("publishedDate"),
            "upgradeDate": result.get("upgradeDate"),
        }
        audit_log = _build_content_audit_log(result, fetch_payload)

        operations.append(
            UpdateOne(
                {"jobId": job_id, "url": url},
                {
                    "$set": {
                        "content_matrix": content_matrix,
                        "content_metrics_audit_log": audit_log,
                        "content_metrics_last_run_at": run_at,
                    }
                },
                upsert=False,
            )
        )

    if not operations:
        return 0

    write_result = mongo_manager.fields.bulk_write(operations, ordered=False)
    return int(write_result.modified_count)


async def run_content_audit_metric(job_id: str, metric: MetricType, urls: Optional[List[str]] = None) -> Dict[str, Any]:
    target_urls = _resolve_target_urls(job_id, urls)
    run_at = _utc_now_iso()

    if not target_urls:
        return {
            "job_id": job_id,
            "metric": metric,
            "run_at": run_at,
            "urls_processed": 0,
            "updated_count": 0,
        }

    if metric == "keyword-metrics":
        updated_count = await _run_keyword_metrics(job_id, target_urls, run_at)
    elif metric == "performance-metrics":
        updated_count = await _run_performance_metrics(job_id, target_urls, run_at)
    elif metric == "content-metrics":
        updated_count = await _run_content_metrics(job_id, target_urls, run_at)
    elif metric == "backlink-metrics":
        updated_count = await _run_backlink_metrics(job_id, target_urls, run_at)
    else:
        raise ValueError(f"Unsupported content audit metric: {metric}")

    return {
        "job_id": job_id,
        "metric": metric,
        "run_at": run_at,
        "urls_processed": len(target_urls),
        "updated_count": updated_count,
    }


async def schedule_content_audit_metric(job_id: str, metric: MetricType, urls: Optional[List[str]] = None) -> None:
    try:
        result = await run_content_audit_metric(job_id=job_id, metric=metric, urls=urls)
        logger.info(
            "Content audit metric run completed | job=%s metric=%s urls=%d updated=%d",
            job_id,
            metric,
            result["urls_processed"],
            result["updated_count"],
        )
    except Exception:
        logger.exception("Content audit metric run failed | job=%s metric=%s", job_id, metric)
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Literal, Optional
from urllib.parse import urlparse

from pymongo import UpdateOne

from modules.module_A.ContentAudit.BacklinkMetrics import extract_backlink_metrics_batch
from modules.module_A.ContentAudit.ContentMetrics import extract_content_metrics
from modules.module_A.ContentAudit.KeywordFinder import KeywordBundle
from modules.module_A.ContentAudit.KeywordMetrics import extract_keyword_metrics, extract_keyword_metrics_batch
from modules.module_A.ContentAudit.PageMetrics import extract_page_metrics
from modules.module_A.ContentAudit.PerformanceMetrics import extract_performance_metrics_batch
from utils.event_publisher import publisher
from utils.mongo import mongo_manager
from utils.storage import load_raw_html

logger = logging.getLogger("content_audit_http")

MetricType = Literal[
    "page-metrics",
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


def _url_depth(url: str) -> int:
    path = urlparse(url).path
    return len([segment for segment in path.split("/") if segment])


def _keyword_bundle_from_doc(field_doc: Dict[str, Any]) -> KeywordBundle:
    payload = field_doc.get("keyword_bundle") or {}
    if not isinstance(payload, dict):
        payload = {}

    return KeywordBundle(
        primary_keyword=str(payload.get("primary_keyword") or field_doc.get("main_keyword") or ""),
        keyword_source=str(payload.get("keyword_source") or field_doc.get("keyword_source") or ""),
        all_keywords=list(payload.get("all_keywords") or []),
        ranked_keywords=list(payload.get("ranked_keywords") or []),
        related_keywords=list(payload.get("related_keywords") or []),
        on_page_keywords=list(payload.get("on_page_keywords") or []),
        question_keywords=list(payload.get("question_keywords") or []),
        long_tail_keywords=list(payload.get("long_tail_keywords") or []),
        entity_keywords=list(payload.get("entity_keywords") or []),
        intent=str(payload.get("intent") or "I"),
        post_category_type=str(payload.get("post_category_type") or "other"),
    )


async def _load_stored_html_documents(
    job_id: str,
    page_docs: List[Dict[str, Any]],
    concurrency: int = 10,
) -> Dict[str, Dict[str, Any]]:
    if not page_docs:
        return {}

    semaphore = asyncio.Semaphore(concurrency)

    async def _load_one(page_doc: Dict[str, Any]) -> tuple[str, Dict[str, Any]]:
        url = str(page_doc.get("url") or "")
        raw_html_filename = str(page_doc.get("raw_html_filename") or "").strip()

        async with semaphore:
            try:
                if not raw_html_filename:
                    return url, {
                        "html_content": "",
                        "error": "missing-raw-html-filename",
                    }

                html_content = await load_raw_html(job_id, raw_html_filename)
                return url, {
                    "html_content": html_content or "",
                    "error": None if html_content else "missing-raw-html",
                }
            except Exception as exc:
                logger.warning("Content audit HTML load failed for %s: %s", url, exc)
                return url, {
                    "html_content": "",
                    "error": str(exc),
                }

    results = await asyncio.gather(*[_load_one(page_doc) for page_doc in page_docs])
    return {url: payload for url, payload in results if url}


def _build_crawl_graph_lookup(field_docs: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    urls = [str(doc.get("url") or "") for doc in field_docs if doc.get("url")]
    url_set = set(urls)
    incoming_links: Dict[str, List[str]] = {url: [] for url in urls}
    outlink_counts: Dict[str, int] = {url: 0 for url in urls}

    for doc in field_docs:
        source_url = str(doc.get("url") or "")
        if not source_url:
            continue

        raw_targets = doc.get("outlink_url_list") or []
        unique_targets: List[str] = []
        seen_targets = set()
        for raw_target in raw_targets:
            target_url = str(raw_target or "").strip()
            if not target_url or target_url == source_url or target_url not in url_set:
                continue
            if target_url in seen_targets:
                continue
            seen_targets.add(target_url)
            unique_targets.append(target_url)

        outlink_counts[source_url] = len(unique_targets)
        for target_url in unique_targets:
            incoming_links.setdefault(target_url, []).append(source_url)

    hub_urls = {
        url
        for url in urls
        if len(incoming_links.get(url, [])) >= 30 and _url_depth(url) <= 2
    }

    graph_lookup: Dict[str, Dict[str, Any]] = {}
    for url in urls:
        incoming = incoming_links.get(url, [])
        graph_lookup[url] = {
            "inlink_count": len(incoming),
            "outlink_count": outlink_counts.get(url, 0),
            "internal_outlinks": outlink_counts.get(url, 0),
            "incoming_links": incoming,
            "pointed_by_hub": any(source in hub_urls for source in incoming),
            "pointed_only_by_spoke": bool(incoming) and all(source not in hub_urls for source in incoming),
        }

    return graph_lookup


async def _resolve_main_keyword(field_doc: Dict[str, Any], page_doc: Dict[str, Any]) -> tuple[str, str]:
    existing_keyword = (field_doc.get("main_keyword") or "").strip()
    if existing_keyword:
        return existing_keyword, str(field_doc.get("keyword_source") or "provided")

    keyword_bundle = field_doc.get("keyword_bundle") or {}
    bundle_keyword = str(keyword_bundle.get("primary_keyword") or "").strip()
    if bundle_keyword:
        return bundle_keyword, str(keyword_bundle.get("keyword_source") or field_doc.get("keyword_source") or "")

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


async def _run_page_metrics(job_id: str, urls: List[str], run_at: str) -> int:
    page_docs = list(
        mongo_manager.pages.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {
                "_id": 0,
                "url": 1,
                "title": 1,
                "h1_tags": 1,
                "status_code": 1,
                "response_time": 1,
                "page_size_bytes": 1,
                "raw_html_filename": 1,
            },
        )
    )
    field_docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {
                "_id": 0,
                "url": 1,
                "main_keyword": 1,
                "keyword_source": 1,
                "keyword_bundle": 1,
            },
        )
    )
    graph_docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id},
            {"_id": 0, "url": 1, "outlink_url_list": 1},
        )
    )

    pages_by_url = _build_lookup(page_docs)
    fields_by_url = _build_lookup(field_docs)
    html_by_url = await _load_stored_html_documents(job_id, page_docs)
    crawl_graph_by_url = _build_crawl_graph_lookup(graph_docs)

    operations = []
    for url in urls:
        page_doc = pages_by_url.get(url, {"url": url})
        field_doc = fields_by_url.get(url, {"url": url})
        keyword_bundle = _keyword_bundle_from_doc(field_doc)
        html_payload = html_by_url.get(url, {})
        html_content = str(html_payload.get("html_content") or "")
        main_keyword = keyword_bundle.primary_keyword or str(field_doc.get("main_keyword") or "")

        result = extract_page_metrics(
            url=url,
            html_content=html_content,
            response_status=int(page_doc.get("status_code") or 0),
            response_headers={},
            response_time_ms=float(page_doc.get("response_time") or 0),
            final_url=url,
            raw_body_size=int(page_doc.get("page_size_bytes") or 0),
            redirect_urls=[],
            main_keyword=main_keyword,
            keyword_bundle=keyword_bundle,
            title=str(page_doc.get("title") or ""),
            h1=_first_h1(page_doc),
            crawl_graph=crawl_graph_by_url.get(url) or {},
        )

        operations.append(
            UpdateOne(
                {"jobId": job_id, "url": url},
                {
                    "$set": {
                        "main_keyword": main_keyword or None,
                        "keyword_source": keyword_bundle.keyword_source or None,
                        "page_matrix": result,
                        "page_metrics_last_run_at": run_at,
                    },
                    "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
                },
                upsert=True,
            )
        )

    if not operations:
        return 0

    write_result = mongo_manager.fields.bulk_write(operations, ordered=False)
    return int(write_result.modified_count)


async def _run_keyword_metrics(job_id: str, urls: List[str], run_at: str) -> int:
    page_docs = list(
        mongo_manager.pages.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "title": 1, "h1_tags": 1, "status_code": 1},
        )
    )
    field_docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "main_keyword": 1, "keyword_source": 1, "keyword_bundle": 1},
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
                "status_code": page_doc.get("status_code"),
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
                        "status_code": result.get("status_code"),
                        "volume_global": result.get("volume_global"),
                        "volume_us": result.get("volume_us"),
                        "kd_us": result.get("kd_us"),
                        "cpc_usd": result.get("cpc_usd"),
                        "keyword_metrics_audit_log": result.get("audit_log") or {},
                        "keyword_metrics_last_run_at": run_at,
                    },
                    "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
                },
                upsert=True,
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
            {"_id": 0, "url": 1, "main_keyword": 1, "keyword_bundle": 1, "performance_metrics": 1},
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
                    },
                    "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
                },
                upsert=True,
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
                "current_ref_domains": 1,
                "min_required_ref_domains": 1,
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
                "current_ref_domains": None if force_refresh else doc.get("current_ref_domains", backlink_metrics.get("current_ref_domains")),
                "min_required_ref_domains": None if force_refresh else doc.get("min_required_ref_domains", backlink_metrics.get("min_required_ref_domains")),
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
                        "internal_external_ratio": result.get("internal_external_ratio"),
                        "pr_score": result.get("pr_score"),
                        "current_ref_domains": result.get("current_ref_domains"),
                        "min_required_ref_domains": result.get("min_required_ref_domains"),
                        "need_to_acquire_ref_domains": result.get("need_to_acquire_ref_domains"),
                        "backlink_audit_log": result.get("audit_log") or {},
                        "backlink_metrics_last_run_at": run_at,
                    },
                    "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
                },
                upsert=True,
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
            "currentWordCount": "CRAWL" if result.get("currentWordCount") is not None else (f"ERROR-{error}" if error else "NULL"),
            "serpIntentWordCount": "FETCHED" if result.get("serpIntentWordCount") is not None else "NULL",
            "needToAddWordCount": "COMPUTED" if result.get("needToAddWordCount") is not None else "NULL",
            "publishedDate": "FETCHED" if result.get("publishedDate") else (f"ERROR-{error}" if error else "NULL"),
            "upgradeDate": "FETCHED" if result.get("upgradeDate") else (f"ERROR-{error}" if error else "NULL"),
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
            {"_id": 0, "url": 1, "title": 1, "h1_tags": 1, "word_count": 1, "raw_html_filename": 1},
        )
    )
    field_docs = list(
        mongo_manager.fields.find(
            {"jobId": job_id, "url": {"$in": urls}},
            {"_id": 0, "url": 1, "main_keyword": 1, "keyword_bundle": 1, "content_matrix": 1},
        )
    )

    pages_by_url = _build_lookup(page_docs)
    fields_by_url = _build_lookup(field_docs)
    html_by_url = await _load_stored_html_documents(job_id, page_docs)

    operations = []
    for url in urls:
        page_doc = pages_by_url.get(url, {"url": url})
        field_doc = fields_by_url.get(url, {"url": url})
        fetch_payload = html_by_url.get(url, {})
        keyword_bundle = _keyword_bundle_from_doc(field_doc)
        result = await extract_content_metrics(
            url=url,
            html_content=str(fetch_payload.get("html_content") or ""),
            main_keyword=str(field_doc.get("main_keyword") or ""),
            response_headers={},
            existing_item=field_doc.get("content_matrix") or {},
            keyword_bundle=keyword_bundle,
            h1=_first_h1(page_doc),
            title=str(page_doc.get("title") or ""),
            word_count=page_doc.get("word_count"),
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
                    },
                    "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
                },
                upsert=True,
            )
        )

    if not operations:
        return 0

    write_result = mongo_manager.fields.bulk_write(operations, ordered=False)
    return int(write_result.modified_count)


async def run_content_audit_metric(job_id: str, metric: MetricType, urls: Optional[List[str]] = None, run_at: Optional[str] = None) -> Dict[str, Any]:
    target_urls = _resolve_target_urls(job_id, urls)
    if run_at is None:
        run_at = _utc_now_iso()

    if not target_urls:
        return {
            "job_id": job_id,
            "metric": metric,
            "run_at": run_at,
            "urls_processed": 0,
            "updated_count": 0,
        }

    if metric == "page-metrics":
        updated_count = await _run_page_metrics(job_id, target_urls, run_at)
    elif metric == "keyword-metrics":
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


async def schedule_content_audit_metric(job_id: str, metric: MetricType, urls: Optional[List[str]] = None, run_at: Optional[str] = None) -> None:
    try:
        result = await run_content_audit_metric(job_id=job_id, metric=metric, urls=urls, run_at=run_at)
        logger.info(
            "Content audit metric run completed | job=%s metric=%s urls=%d updated=%d",
            job_id,
            metric,
            result["urls_processed"],
            result["updated_count"],
        )
        publisher.emit_event(
            job_id=job_id,
            event_type="CONTENT_AUDIT_COMPLETED",
            payload={
                "metric": metric,
                "urls_processed": result["urls_processed"],
                "updated_count": result["updated_count"],
                "run_at": result.get("run_at"),
            },
        )
    except Exception as exc:
        logger.exception("Content audit metric run failed | job=%s metric=%s", job_id, metric)
        publisher.emit_event(
            job_id=job_id,
            event_type="CONTENT_AUDIT_FAILED",
            payload={"metric": metric, "error": str(exc)},
        )
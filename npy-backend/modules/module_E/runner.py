import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, List
import aiohttp
from bs4 import BeautifulSoup
from utils.mongo import mongo_manager
from utils.storage import load_raw_html
from .unified_analyzer import UnifiedModuleEAnalyzer

logger = logging.getLogger("module_e")


def _extract_text(html: str) -> str:
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    return " ".join(text.split())


async def _fetch_text(session: aiohttp.ClientSession, url: str, timeout_s: int = 15) -> str:
    try:
        if not url:
            return ""
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout_s)) as resp:
            if resp.status != 200:
                return ""
            html = await resp.text(errors="ignore")
            return _extract_text(html)[:5000]
    except Exception:
        return ""


async def _fetch_top_pages_texts(urls: List[str]) -> List[str]:
    if not urls:
        return []
    async with aiohttp.ClientSession() as session:
        tasks = [_fetch_text(session, url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    texts = []
    for res in results:
        if isinstance(res, str) and res.strip():
            texts.append(res)
    return texts


async def run_module_e(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """
    Run Module E analysis: content consistency and entity coverage.
    """
    logger.info("Module E started", extra={"job_id": job_id, "url": url})

    mongo_manager.connect()

    # Pull top pages by word count
    pages = list(
        mongo_manager.pages.find({"jobId": job_id}).sort("word_count", -1).limit(5)
    )

    logger.info(
        "Module E pages loaded",
        extra={"job_id": job_id, "pages_count": len(pages)}
    )

    top_urls = [p.get("url") for p in pages if p.get("url")]
    logger.info(
        "Module E top urls",
        extra={"job_id": job_id, "top_urls": top_urls}
    )

    # Homepage HTML from disk (saved at crawl depth 0)
    homepage_html = html_content or await load_raw_html(job_id)
    homepage_text = _extract_text(homepage_html) if homepage_html else ""
    logger.info(
        "Module E homepage text",
        extra={"job_id": job_id, "homepage_text_len": len(homepage_text)}
    )

    # Fetch top pages text (live)
    top_texts = await _fetch_top_pages_texts(top_urls)
    logger.info(
        "Module E top pages text",
        extra={"job_id": job_id, "top_texts_count": len(top_texts)}
    )

    # Aggregate context
    aggregated_text = "\n\n".join([t for t in [homepage_text] + top_texts if t])[:12000]
    logger.info(
        "Module E aggregated text",
        extra={"job_id": job_id, "aggregated_text_len": len(aggregated_text)}
    )

    # Unified Module E analysis (1 LLM call for everything)
    analyzer = UnifiedModuleEAnalyzer()
    unified_result = await analyzer.analyze(aggregated_text, url=url)
    consistency_result = unified_result.get("content_consistency", {})
    entity_coverage_result = unified_result.get("entity_coverage", {})
    
    logger.info(
        "Module E unified analysis complete",
        extra={
            "job_id": job_id,
            "consistency_score": consistency_result.get("score", 0),
            "entity_score": entity_coverage_result.get("score", 0),
        }
    )

    result = {
        "job_id": job_id,
        "url": url,
        "content_consistency": consistency_result,
        "entity_coverage": entity_coverage_result,
        "created_at": datetime.utcnow().isoformat(),
    }

    # Persist to Mongo for API retrieval
    try:
        mongo_manager.job_summaries.update_one(
            {"jobId": job_id, "type": "module_e"},
            {
                "$set": {
                    "jobId": job_id,
                    "type": "module_e",
                    "url": url,
                    "createdAt": datetime.utcnow(),
                    "content_consistency": consistency_result,
                    "entity_coverage": entity_coverage_result,
                }
            },
            upsert=True,
        )
        logger.info(
            "Module E persisted",
            extra={"job_id": job_id, "url": url}
        )
    except Exception as exc:
        logger.warning("Failed to persist module E result: %s", exc)

    return result

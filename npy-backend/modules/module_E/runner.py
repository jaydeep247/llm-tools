import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, List
import aiohttp
from bs4 import BeautifulSoup
from utils.mongo import mongo_manager
from utils.storage import load_raw_html
from .unified_analyzer import UnifiedModuleEAnalyzer
from .brand_analyzer import BrandAnalyzer
from .sentiment_tracker import SentimentVisibilityTracker

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


async def _prepare_context(job_id: str, url: str, html_content: str = None, source_job_id: str = None) -> str:
    """Helper to load and aggregate text context for analysis."""
    # Use source_job_id for data retrieval if available, otherwise fallback to current job_id
    data_job_id = source_job_id if source_job_id else job_id

    # Pull top pages by word count
    pages = list(
        mongo_manager.pages.find({"jobId": data_job_id}).sort("word_count", -1).limit(5)
    )

    top_urls = [p.get("url") for p in pages if p.get("url")]
    
    # Homepage HTML from disk (saved at crawl depth 0)
    homepage_html = html_content or await load_raw_html(data_job_id)
    homepage_text = _extract_text(homepage_html) if homepage_html else ""
    
    # Fetch top pages text (live)
    top_texts = await _fetch_top_pages_texts(top_urls)
    
    # Aggregate context
    aggregated_text = "\n\n".join([t for t in [homepage_text] + top_texts if t])[:12000]
    return aggregated_text


async def run_consistency_only(job_id: str, url: str, html_content: str = None, source_job_id: str = None) -> Dict[str, Any]:
    """
    Run ONLY Content Consistency and Entity Coverage analysis.
    """
    mongo_manager.connect()

    aggregated_text = await _prepare_context(job_id, url, html_content, source_job_id)

    # Unified Module E analysis
    analyzer = UnifiedModuleEAnalyzer()
    unified_result = await analyzer.analyze(aggregated_text, url=url)
    consistency_result = unified_result.get("content_consistency", {})
    entity_coverage_result = unified_result.get("entity_coverage", {})
    
    # Optional: Master multi-model analysis for consistency-only job as well
    master_analysis = None
    try:
        prompt = (
            f"Generate an AI summary of this website's mandate and offerings.\n\n"
            f"URL: {url}\n\n"
            f"CONTENT SNIPPET:\n{aggregated_text[:4000]}"
        )
        model_responses = await analyzer._generate_from_models(prompt)

        if model_responses:
            master_analysis = await analyzer.analyze_models(
                website_content=aggregated_text,
                model_responses=model_responses,
                url=url,
            )
    except Exception as e:
        logger.error(f"Master multi-model analysis (consistency-only) failed: {e}", exc_info=True)
        master_analysis = None

    # Persist consistency, coverage, and master_analysis
    try:
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    "content_consistency": consistency_result,
                    "entity_coverage": entity_coverage_result,
                    "master_analysis": master_analysis,
                    "updatedAt": datetime.utcnow(),
                },
                "$setOnInsert": {
                    "createdAt": datetime.utcnow(),
                },
            },
            upsert=True,
        )
    except Exception as exc:
        logger.warning("Failed to persist module E consistency result: %s", exc)

    return {
        "job_id": job_id,
        "content_consistency": consistency_result,
        "entity_coverage": entity_coverage_result,
        "master_analysis": master_analysis,
    }


async def run_module_e(job_id: str, url: str, html_content: str = None, source_job_id: str = None) -> Dict[str, Any]:
    """
    Run Module E analysis: content consistency and entity coverage.
    """
    mongo_manager.connect()

    aggregated_text = await _prepare_context(job_id, url, html_content, source_job_id)

    # Unified Module E analysis (1 LLM call for everything)
    analyzer = UnifiedModuleEAnalyzer()
    unified_result = await analyzer.analyze(aggregated_text, url=url)
    consistency_result = unified_result.get("content_consistency", {})
    entity_coverage_result = unified_result.get("entity_coverage", {})
    
    # Brand Analysis (if brand name available)
    brand_analysis = None
    sentiment_tracking = None
    brand_name = consistency_result.get("mandate", {}).get("brand_name")
    
    if brand_name:
        brand_analysis = await BrandAnalyzer.analyze_brand(brand_name)
        
        # Sentiment & Visibility Tracking
        try:
            sentiment_tracking = await SentimentVisibilityTracker.analyze_sentiment_and_visibility(
                brand_name=brand_name
            )
        except Exception as e:
            logger.error(f"Sentiment tracking failed: {e}", exc_info=True)
            sentiment_tracking = None

    # Optional: Master multi-model analysis of generated responses
    master_analysis = None
    try:
        prompt = (
            f"Generate an AI summary of this website's mandate and offerings.\n\n"
            f"URL: {url}\n\n"
            f"CONTENT SNIPPET:\n{aggregated_text[:4000]}"
        )
        model_responses = await analyzer._generate_from_models(prompt)

        if model_responses:
            master_analysis = await analyzer.analyze_models(
                website_content=aggregated_text,
                model_responses=model_responses,
                url=url,
            )
    except Exception as e:
        logger.error(f"Master multi-model analysis failed: {e}", exc_info=True)
        master_analysis = None

    result = {
        "job_id": job_id,
        "url": url,
        "content_consistency": consistency_result,
        "entity_coverage": entity_coverage_result,
        "brand_analysis": brand_analysis,
        "sentiment_tracking": sentiment_tracking,
        "master_analysis": master_analysis,
        "created_at": datetime.utcnow().isoformat(),
    }

    # Persist to Mongo module_e collection for API retrieval
    try:
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    "content_consistency": consistency_result,
                    "entity_coverage": entity_coverage_result,
                    "brand_analysis": brand_analysis,
                    "sentiment_tracking": sentiment_tracking,
                    "master_analysis": master_analysis,
                    "updatedAt": datetime.utcnow(),
                },
                "$setOnInsert": {
                    "createdAt": datetime.utcnow(),
                },
            },
            upsert=True,
        )
    except Exception as exc:
        logger.warning("Failed to persist module E result: %s", exc)

    return result

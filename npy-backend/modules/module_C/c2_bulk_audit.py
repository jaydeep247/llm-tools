"""
C2 — Bulk LLM-Friendliness Audit

Runs the exact C1 formula on every crawled URL.
Produces per-page scores stored in DB + aggregated summary:
  - Avg friendliness score (overall + by page type)
  - % pages with missing entities or weak content
  - Average readability and structure score
"""

import asyncio
import logging
from statistics import mean
from typing import Any, Dict, List

import aiohttp

from .c5_entity_extractor import run_c5
from .c1_aeo_checker import run_c1
from utils.storage import load_raw_html

logger = logging.getLogger("module_c.c2")


# ═════════════════════════════════════════════════════════════════════════════
#  Field 2 — Entity-deficient & weak content detection
# ═════════════════════════════════════════════════════════════════════════════

def _is_entity_deficient(page: Dict[str, Any]) -> bool:
    """Entity density < 3.0 per 500 words OR entity coverage < 50%."""
    density = page.get("entity_density", 0)
    coverage = page.get("entity_ratio", {}).get("entity_ratio_pct", 0)
    return density < 3.0 or coverage < 50


def _is_weak_content(page: Dict[str, Any]) -> bool:
    """Word count < 300 OR factual density < 2.0 OR structure signals < 2."""
    wc = page.get("word_count", 0)
    fact_density = page.get("sub_scores", {}).get("content", {}).get("factual_density_per_500w", 0)
    sig_count = page.get("sub_scores", {}).get("structure", {}).get("signal_count", 0)
    return wc < 300 or fact_density < 2.0 or sig_count < 2


# ═════════════════════════════════════════════════════════════════════════════
#  Single-page analysis
# ═════════════════════════════════════════════════════════════════════════════

async def _analyze_page(
    html: str,
    url: str,
    robots_txt: str = "",
    industry: str = "",
) -> Dict[str, Any]:
    """Run C5 → C1 on a single page and return combined result."""
    c5 = run_c5(html)
    c1 = await run_c1(html, url, c5, robots_txt=robots_txt, industry=industry)

    return {
        "url": url,
        "llm_friendliness_score": c1["llm_friendliness_score"],
        "page_type": c1["page_type"],
        "word_count": c1["word_count"],
        "entity_density": c5["entity_density"],
        "entity_ratio": c1["entity_ratio"],
        "readability": c1["readability"],
        "sub_scores": c1["sub_scores"],
        "structured_data": c1["structured_data"],
        "js_rendered_warning": c5["js_rendered_warning"],
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Aggregation
# ═════════════════════════════════════════════════════════════════════════════

def _aggregate(page_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute bulk summary metrics across all analysed pages."""
    if not page_results:
        return {"total_pages": 0, "successful_scans": 0}

    scores = [p["llm_friendliness_score"] for p in page_results]
    read_scores = [p.get("readability", {}).get("readability_score", 0) for p in page_results]
    struct_scores = [p.get("sub_scores", {}).get("structure", {}).get("signal_count", 0) for p in page_results]

    entity_deficient = [p for p in page_results if _is_entity_deficient(p)]
    weak_content = [p for p in page_results if _is_weak_content(p)]
    both = [p for p in page_results if _is_entity_deficient(p) and _is_weak_content(p)]

    total = len(page_results)

    # By page type
    by_type: Dict[str, List[float]] = {}
    read_by_type: Dict[str, List[float]] = {}
    for p in page_results:
        pt = p["page_type"]
        by_type.setdefault(pt, []).append(p["llm_friendliness_score"])
        read_by_type.setdefault(pt, []).append(p.get("readability", {}).get("readability_score", 0))

    return {
        "total_pages": total,
        "successful_scans": total,
        "average_llm_friendliness": round(mean(scores), 1),
        "average_readability": round(mean(read_scores), 1),
        "average_structure_signals": round(mean(struct_scores), 2),
        "entity_deficient_pct": round(len(entity_deficient) / total * 100, 1),
        "weak_content_pct": round(len(weak_content) / total * 100, 1),
        "both_deficient_pct": round(len(both) / total * 100, 1),
        "by_page_type": {
            k: round(mean(v), 1) for k, v in by_type.items()
        },
        "readability_by_page_type": {
            k: round(mean(v), 1) for k, v in read_by_type.items()
        },
    }


# ═════════════════════════════════════════════════════════════════════════════
#  Run C2 (Bulk)
# ═════════════════════════════════════════════════════════════════════════════

async def run_c2_from_crawl(
    job_id: str,
    robots_txt: str = "",
    industry: str = "",
) -> Dict[str, Any]:
    """
    Run C2 bulk audit on all pages stored from a prior crawl job.

    Loads crawled pages from MongoDB, runs C5 → C1 on each.
    """
    from utils.mongo import mongo_manager

    pages = list(
        mongo_manager.db.crawled_pages.find(
            {"jobId": job_id},
            {"url": 1, "jobId": 1, "_id": 0},
        ).limit(200)
    )

    if not pages:
        logger.warning(f"[C2] No crawled pages found for job {job_id}")
        return {"error": "No crawled pages found", "total_pages": 0}

    results: List[Dict[str, Any]] = []
    for page_doc in pages:
        url = page_doc.get("url", "")
        page_job_id = page_doc.get("jobId", job_id)
        try:
            html = await load_raw_html(page_job_id)
            if not html:
                continue
            result = await _analyze_page(html, url, robots_txt, industry)
            results.append(result)
        except Exception as e:
            logger.error(f"[C2] Failed on {url}: {e}")

    summary = _aggregate(results)

    return {
        "summary": summary,
        "pages": results,
    }


async def run_c2_from_urls(
    urls: List[str],
    robots_txt: str = "",
    industry: str = "",
) -> Dict[str, Any]:
    """
    Run C2 bulk audit on a list of URLs (fetches HTML live).
    """
    results: List[Dict[str, Any]] = []

    async with aiohttp.ClientSession(
        timeout=aiohttp.ClientTimeout(total=15),
        headers={"User-Agent": "Mozilla/5.0 YogreetBot/1.0"},
    ) as session:
        for url in urls[:200]:  # cap at 200
            try:
                async with session.get(url) as resp:
                    if resp.status != 200:
                        continue
                    html = await resp.text()
                result = await _analyze_page(html, url, robots_txt, industry)
                results.append(result)
            except Exception as e:
                logger.error(f"[C2] Failed to fetch {url}: {e}")

    summary = _aggregate(results)

    return {
        "summary": summary,
        "pages": results,
    }

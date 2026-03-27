"""
Post-Crawl Analysis: Near-Duplicate Detection & Semantic Similarity

Runs after all pages for a job are crawled. Reads every fields document,
computes pairwise:
  - SimHash Hamming distance  → closest_near_duplicate_url,
                                 closest_near_duplicate_similarity,
                                 no_near_duplicates
  - TF-IDF cosine similarity  → closest_semantically_similar_address,
                                 semantic_similarity_score,
                                 no_semantically_similar,
                                 semantic_relevance_score

Results are written back to the `fields` collection under each page's
`website_crawler` sub-document.
"""

import asyncio
import math
from typing import List, Dict, Any, Optional

from pymongo import UpdateOne

from utils.mongo import mongo_manager
from utils.logger import logger
from modules.module_A.WebsiteCrawler.metrics.similarity import (
    hamming_distance,
    calculate_similarity_score,
)
from modules.module_A.ContentAudit.KeywordMetrics import extract_keyword_metrics_batch

# Hamming distance threshold (out of 64 bits):
# ≤ 3 bits difference ≈ 95.3% identical content → near-duplicate
NEAR_DUPLICATE_BIT_THRESHOLD = 3

# Cosine similarity threshold for "semantically similar"
SEMANTIC_SIMILAR_THRESHOLD = 0.5


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_tf_from_keywords(keyword_analysis: Optional[Dict]) -> Dict[str, float]:
    """Build a normalised TF dict from the Keyword_analysis subdoc."""
    if not keyword_analysis:
        return {}
    keywords = keyword_analysis.get("keywords") or []
    if not keywords:
        return {}

    raw: Dict[str, float] = {}
    for kw in keywords:
        if isinstance(kw, dict):
            text = kw.get("text", "")
            freq = float(kw.get("freq", 1))
        else:
            text = str(kw)
            freq = 1.0
        if text:
            raw[text.lower()] = raw.get(text.lower(), 0.0) + freq

    total = sum(raw.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in raw.items()}


def _cosine_similarity(tf1: Dict[str, float], tf2: Dict[str, float]) -> float:
    """Cosine similarity between two TF dicts. Returns 0.0-1.0."""
    shared = set(tf1.keys()) & set(tf2.keys())
    if not shared:
        return 0.0
    dot = sum(tf1[t] * tf2[t] for t in shared)
    mag1 = math.sqrt(sum(v * v for v in tf1.values()))
    mag2 = math.sqrt(sum(v * v for v in tf2.values()))
    if mag1 == 0.0 or mag2 == 0.0:
        return 0.0
    return dot / (mag1 * mag2)


# ---------------------------------------------------------------------------
# Main entry point (called from MongoPipeline in a deferred thread)
# ---------------------------------------------------------------------------

def run_post_crawl_analysis(job_id: str) -> None:
    """
    For all pages of *job_id*, compute near-duplicate and semantic similarity
    across pages and persist the results back to the fields collection.

    This function is designed to be called via Twisted's deferToThread so it
    does NOT touch the event loop.
    """
    if not job_id:
        return

    try:
        # ------------------------------------------------------------------
        # 1. Fetch all fields documents (only the sub-docs we need)
        # ------------------------------------------------------------------
        cursor = mongo_manager.fields.find(
            {"jobId": job_id},
            {
                "url": 1,
                "main_keyword": 1,
                "backlink_metrics.internal_outlinks": 1,
                "backlink_metrics.external_outlinks": 1,
                "backlink_metrics.outlink_url_list": 1,
                "website_crawler.simhash": 1,
                "Keyword_analysis": 1,
                "volume_global": 1,
                "volume_us": 1,
                "kd_us": 1,
                "cpc_usd": 1,
                "performance_metrics": 1,
            },
        )
        docs = list(cursor)

        if len(docs) < 2:
            logger.info(
                f"[POST-CRAWL] Skipping analysis for job {job_id}: "
                f"only {len(docs)} page(s); near-duplicate step skipped."
            )
        # Near-duplicate analysis is optional; backlink metrics should still run
        # even for very small crawls.

        # ------------------------------------------------------------------
        # 2. Build an in-memory list of page descriptors
        # ------------------------------------------------------------------
        pages: List[Dict[str, Any]] = []
        for doc in docs:
            url = doc.get("url")
            if not url:
                continue
            wc = doc.get("website_crawler") or {}
            simhash = wc.get("simhash") or ""
            # Skip the all-zero simhash (empty page / extraction failure)
            if simhash and all(c == "0" for c in simhash):
                simhash = ""
            kw_analysis = doc.get("Keyword_analysis") or {}
            tf = _build_tf_from_keywords(kw_analysis)
            pages.append({"url": url, "simhash": simhash, "tf": tf})

        n = len(pages)
        logger.info(f"[POST-CRAWL] Running analysis for job {job_id}: {n} pages")

        # ------------------------------------------------------------------
        # 3. Pairwise computation (isolated so backlinks still run)
        # ------------------------------------------------------------------
        try:
            updates: List[tuple] = []

            if n >= 2:
                for i in range(n):
                    pi = pages[i]
                    url_i = pi["url"]
                    hash_i = pi["simhash"]
                    tf_i = pi["tf"]

                    near_dup_candidates = []
                    semantic_candidates = []
                    all_cosines: List[float] = []

                    for j in range(n):
                        if i == j:
                            continue
                        pj = pages[j]

                        # --- Near-duplicate (SimHash Hamming distance) ---
                        if hash_i and pj["simhash"]:
                            dist = hamming_distance(hash_i, pj["simhash"])
                            if dist <= NEAR_DUPLICATE_BIT_THRESHOLD:
                                score = calculate_similarity_score(hash_i, pj["simhash"])
                                near_dup_candidates.append(
                                    {"url": pj["url"], "score": score, "dist": dist}
                                )

                        # --- Semantic similarity (TF cosine) ---
                        if tf_i and pj["tf"]:
                            cos = _cosine_similarity(tf_i, pj["tf"])
                            all_cosines.append(cos)
                            if cos >= SEMANTIC_SIMILAR_THRESHOLD:
                                semantic_candidates.append({"url": pj["url"], "score": cos})

                    # Sort descending by score
                    near_dup_candidates.sort(key=lambda x: -x["score"])
                    semantic_candidates.sort(key=lambda x: -x["score"])

                    # Semantic relevance = average cosine to ALL other pages
                    semantic_relevance = (
                        round(sum(all_cosines) / len(all_cosines), 4)
                        if all_cosines
                        else 0.0
                    )

                    update_set = {
                        "website_crawler.closest_near_duplicate_url": (
                            near_dup_candidates[0]["url"] if near_dup_candidates else None
                        ),
                        "website_crawler.closest_near_duplicate_similarity": (
                            round(near_dup_candidates[0]["score"], 4)
                            if near_dup_candidates
                            else 0.0
                        ),
                        "website_crawler.no_near_duplicates": len(near_dup_candidates),
                        "website_crawler.closest_semantically_similar_address": (
                            semantic_candidates[0]["url"] if semantic_candidates else None
                        ),
                        "website_crawler.semantic_similarity_score": (
                            round(semantic_candidates[0]["score"], 4)
                            if semantic_candidates
                            else 0.0
                        ),
                        "website_crawler.no_semantically_similar": len(semantic_candidates),
                        "website_crawler.semantic_relevance_score": semantic_relevance,
                    }
                    updates.append((url_i, update_set))

            # ------------------------------------------------------------------
            # 4. Bulk-write results back to the fields collection
            # ------------------------------------------------------------------
            if updates:
                operations = [
                    UpdateOne(
                        {"jobId": job_id, "url": url},
                        {"$set": fields},
                    )
                    for url, fields in updates
                ]
                result = mongo_manager.fields.bulk_write(operations, ordered=False)
                logger.info(
                    f"[POST-CRAWL] Updated {result.modified_count}/{n} pages "
                    f"for job {job_id}"
                )
        except Exception as exc:
            logger.error(
                "[POST-CRAWL] Near-duplicate/semantic step failed for job %s: %s",
                job_id,
                exc,
                exc_info=True,
            )

        # ------------------------------------------------------------------
        # 5. Keyword Metrics batch (volume_global, volume_us, kd_us, cpc_usd)
        # NOTE: Backlink Metrics are intentionally excluded here — they are
        # only computed on-demand via the manual "Run" action in the frontend.
        # ------------------------------------------------------------------
        keyword_items: List[Dict[str, Any]] = []
        for doc in docs:
            url = doc.get("url")
            if not url:
                continue
            keyword_items.append(
                {
                    "url": url,
                    "main_keyword": doc.get("main_keyword", "") or "",
                    "volume_global": doc.get("volume_global"),
                    "volume_us": doc.get("volume_us"),
                    "kd_us": doc.get("kd_us"),
                    "cpc_usd": doc.get("cpc_usd"),
                }
            )

        if keyword_items:
            loop = asyncio.new_event_loop()
            try:
                asyncio.set_event_loop(loop)
                km_results = loop.run_until_complete(
                    extract_keyword_metrics_batch(keyword_items)
                )
            finally:
                loop.close()
                asyncio.set_event_loop(None)

            km_results_by_url = {
                r.get("url"): r for r in (km_results or []) if r.get("url")
            }

            km_ops = []
            for item in keyword_items:
                url = item["url"]
                km_res = km_results_by_url.get(url)
                if not km_res:
                    continue

                km_ops.append(
                    UpdateOne(
                        {"jobId": job_id, "url": url},
                        {
                            "$set": {
                                "volume_global": km_res.get("volume_global"),
                                "volume_us": km_res.get("volume_us"),
                                "kd_us": km_res.get("kd_us"),
                                "cpc_usd": km_res.get("cpc_usd"),
                                "keyword_metrics_audit_log": km_res.get("audit_log") or {},
                            }
                        },
                    )
                )

            if km_ops:
                mongo_manager.fields.bulk_write(km_ops, ordered=False)
                logger.info(
                    "[POST-CRAWL] Keyword metrics: wrote %d updates for job %s",
                    len(km_ops),
                    job_id,
                )

        # NOTE: Performance Metrics are intentionally excluded here — they are
        # only computed on-demand via the manual "Run" action in the frontend.

    except Exception:
        import traceback
        logger.error(
            f"[POST-CRAWL] Analysis failed for job {job_id}:\n"
            f"{traceback.format_exc()}"
        )

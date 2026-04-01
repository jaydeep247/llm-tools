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

import math
from typing import List, Dict, Any, Optional

from pymongo import UpdateOne

from utils.mongo import mongo_manager
from utils.logger import logger
from modules.module_A.WebsiteCrawler.metrics.similarity import (
    hamming_distance,
    calculate_similarity_score,
)

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
                "canonical_url": 1,
                "main_keyword": 1,
                "internal_outlinks": 1,
                "external_outlinks": 1,
                "outlink_url_list": 1,
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
        # 5. Compute inlink counts from the outlink graph
        # ------------------------------------------------------------------
        try:
            from modules.module_A.ContentAudit.BacklinkMetrics import (
                compute_inlinks_for_batch,
                _normalize_for_inlinks,
            )

            # Read redirect_map stored by MongoPipeline from spider (Fix 4)
            try:
                job_doc = mongo_manager.db.jobs.find_one(
                    {"id": job_id},
                    {"redirect_map": 1},
                )
                redirect_map = (job_doc or {}).get("redirect_map") or {}
            except Exception:
                redirect_map = {}

            # Read sitemap URLs for orphan pre-seeding (Fix 6)
            try:
                sitemap_docs = list(mongo_manager.db.sitemaps.find(
                    {"jobId": job_id},
                    {"url": 1},
                ))
                sitemap_urls = [d["url"] for d in sitemap_docs if d.get("url")]
            except Exception:
                sitemap_urls = []

            logger.info(
                "[INLINK-DEBUG] redirect_map_size=%d sitemap_urls=%d",
                len(redirect_map), len(sitemap_urls),
            )

            inlink_items = []
            total_outlinks_stored = 0
            pages_with_outlinks = 0
            for doc in docs:
                url = doc.get("url")
                if not url:
                    continue
                oul = doc.get("outlink_url_list") or []
                total_outlinks_stored += len(oul)
                if oul:
                    pages_with_outlinks += 1
                inlink_items.append({
                    "url": url,
                    "canonical_url": doc.get("canonical_url") or "",
                    "outlink_url_list": oul,
                })

            logger.info(
                "[INLINK-DEBUG] STEP 1 — Data from DB | "
                "total_pages=%d | pages_with_outlinks=%d | "
                "total_outlink_entries=%d",
                len(inlink_items),
                pages_with_outlinks,
                total_outlinks_stored,
            )

            if total_outlinks_stored == 0:
                logger.warning(
                    "[INLINK-DEBUG] PROBLEM: outlink_url_list is empty for ALL "
                    "pages. This means either the crawl didn't store outlinks, "
                    "or the field name is different in MongoDB. "
                    "Sample doc keys: %s",
                    list(docs[0].keys()) if docs else "no docs",
                )

            if inlink_items:
                inlink_map = compute_inlinks_for_batch(
                    inlink_items,
                    redirect_map=redirect_map,
                    sitemap_urls=sitemap_urls,
                )

                nonzero_in_map = sum(1 for c in inlink_map.values() if c > 0)
                total_inlinks = sum(inlink_map.values())
                logger.info(
                    "[INLINK-DEBUG] STEP 2 — Graph built | "
                    "map_size=%d | pages_with_inlinks>0=%d | "
                    "total_inlink_edges=%d",
                    len(inlink_map),
                    nonzero_in_map,
                    total_inlinks,
                )

                # Sample: show 3 map keys and 3 outlink URLs for key mismatch detection
                sample_map_keys = list(inlink_map.keys())[:3]
                sample_outlinks = []
                for it in inlink_items:
                    if it["outlink_url_list"]:
                        sample_outlinks = it["outlink_url_list"][:3]
                        break
                logger.info(
                    "[INLINK-DEBUG] STEP 3 — Key comparison | "
                    "sample_map_keys=%s | sample_outlink_urls=%s",
                    sample_map_keys,
                    sample_outlinks,
                )

                if nonzero_in_map == 0 and total_outlinks_stored > 0:
                    logger.warning(
                        "[INLINK-DEBUG] PROBLEM: outlinks exist but no inlinks "
                        "matched. Likely a URL normalisation mismatch between "
                        "map keys (from item URLs) and outlink targets. "
                        "Compare the sample keys vs outlinks above."
                    )

                # Derive base_domain for consistent normalisation
                base_domain = ""
                for it in inlink_items:
                    if it["url"]:
                        from urllib.parse import urlparse as _urlparse
                        _p = _urlparse(it["url"])
                        base_domain = f"https://{(_p.netloc or '').lower()}"
                        break

                logger.info(
                    "[INLINK-DEBUG] STEP 4 — base_domain='%s'",
                    base_domain,
                )

                # Write inlink counts back — look up each original URL
                # in the normalized inlink_map
                inlink_ops = []
                nonzero = 0
                miss_count = 0
                for doc in docs:
                    url = doc.get("url")
                    if not url:
                        continue
                    norm = _normalize_for_inlinks(url, base_domain=base_domain)
                    count = inlink_map.get(norm, 0) if norm else 0
                    if norm and norm not in inlink_map:
                        miss_count += 1
                    if count > 0:
                        nonzero += 1
                    inlink_ops.append(
                        UpdateOne(
                            {"jobId": job_id, "url": url},
                            {"$set": {"inlinks": count}},
                        )
                    )

                if miss_count > 0:
                    logger.warning(
                        "[INLINK-DEBUG] STEP 5 — %d URLs normalized but NOT "
                        "found in inlink_map. Possible key mismatch.",
                        miss_count,
                    )

                if inlink_ops:
                    inlink_result = mongo_manager.fields.bulk_write(
                        inlink_ops, ordered=False,
                    )
                    logger.info(
                        "[INLINK-DEBUG] STEP 6 — DB write | "
                        "%d pages, %d with inlinks > 0, "
                        "%d modified in DB",
                        len(inlink_ops),
                        nonzero,
                        inlink_result.modified_count,
                    )
        except Exception as exc:
            logger.error(
                "[POST-CRAWL] Inlink computation failed for job %s: %s",
                job_id,
                exc,
                exc_info=True,
            )

        # Content audit metrics now run only via explicit manual triggers.

    except Exception:
        import traceback
        logger.error(
            f"[POST-CRAWL] Analysis failed for job {job_id}:\n"
            f"{traceback.format_exc()}"
        )

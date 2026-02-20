import asyncio
import logging
import json
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import aiohttp
from bs4 import BeautifulSoup
# Import orchestrator executor for DataForSEO
from orchestrator.checkpoint.executor import execute_task

from .content_consistency import ContentConsistencyModule
from .entity_coverage import EntityCoverageModule

logger = logging.getLogger("module_e_ranking_runner")

# Platform -> default model name (DataForSEO resolves to latest version)
DEFAULT_MODELS = {
    "chat_gpt": "gpt-4.1-mini",
    "gemini": "gemini-2.0-flash",
}

SUPPORTED_PLATFORMS = ["chat_gpt", "gemini"]

class RankingRunner:
    """
    Runner for Module E Ranking Analysis.
    Orchestrates:
    1. Prompt Generation (via ContentConsistencyModule)
    2. Ranking Analysis (via DataForSEO)
    3. Entity Coverage (via EntityCoverageModule)
    """

    def __init__(self):
        self.consistency_module = ContentConsistencyModule()
        self.entity_coverage_module = EntityCoverageModule()

    def _normalize_url(self, url: str) -> str:
        """Normalize URL for matching: lowercase, strip trailing slash, remove common query params."""
        if not url:
            return ""
        url = url.strip().lower()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        try:
            parsed = urlparse(url)
            # Rebuild without fragment and without utm_* params
            path = parsed.path.rstrip("/") or "/"
            return f"{parsed.netloc}{path}"
        except Exception:
            return url.strip().lower()

    def _url_matches(self, target_normalized: str, citation_url: str) -> bool:
        """Check if citation URL matches target (domain + path)."""
        if not citation_url:
            return False
        citation_normalized = self._normalize_url(citation_url)
        # Direct match or target is prefix of citation (e.g. target=example.com, citation=example.com/page)
        return target_normalized in citation_normalized or citation_normalized in target_normalized

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL for diversity/credibility."""
        if not url:
            return ""
        try:
            parsed = urlparse(url.strip().lower())
            netloc = parsed.netloc or ""
            return netloc[4:] if netloc.startswith("www.") else netloc
        except Exception:
            return ""

    def _find_position_and_percentile(self, annotations: List[Dict[str, Any]], target_normalized: str) -> (Optional[int], Optional[int]):
        """
        Find 1-based position and percentile rank.
        Percentile = (N - rank) / N * 100
        """
        if not annotations:
            return None, None
        
        # Valid citations only (must have ID or URL)
        valid_citations = [a for a in annotations if a.get("url")]
        total_citations = len(valid_citations)
        if total_citations == 0:
            return None, None

        position = None
        for i, ann in enumerate(valid_citations):
            if self._url_matches(target_normalized, ann.get("url", "")):
                position = i + 1
                break
        
        if position:
            # (N - rank) / N isn't quite right for small N.
            # Standard percentile rank = (count below + 0.5) / total * 100?
            # Or simplified: if top 1 of 10 -> 90th percentile?
            # Let's use: (total - position) / total * 100 ( 1st of 5 -> 4/5=80%)
            # If 1st of 1 -> 0/1=0%? No.
            # Let's stick to simple inverted rank: (1 - (rank-1)/total) * 100
            # 1st of 5 -> (1 - 0/5) * 100 = 100%
            # 5th of 5 -> (1 - 4/5) * 100 = 20%
            percentile = int((1 - (position - 1) / total_citations) * 100)
            return position, percentile
        
        return None, None # Not found

    def _compute_source_diversity(self, annotations: List[Dict[str, Any]]) -> int:
        """ 0-100 score based on unique domains cited. """
        domains = set()
        for a in annotations:
            u = a.get("url", "")
            if u:
                try:
                    domains.add(urlparse(u).netloc)
                except: pass
        
        count = len(domains)
        # Logarithmic scale? Or simple linear?
        # 5+ unique domains = 100
        score = min(count * 20, 100)
        return score

    def _domain_credibility_score(self, domain: str) -> int:
        """Score 0-100 per domain (heuristic)."""
        CREDIBLE_TLDS = {"gov", "edu", "mil"}
        KNOWN_NEWS = {"nytimes.com", "bbc.com", "reuters.com", "apnews.com", "washingtonpost.com"}
        
        if not domain:
            return 30
        d = domain.lower()
        tld = d.split(".")[-1] if "." in d else ""
        if tld in CREDIBLE_TLDS:
            return 95
        if d in KNOWN_NEWS or any(d.endswith(f".{n}") for n in KNOWN_NEWS):
            return 80
        if tld in ("org", "com", "net"):
            return 50
        return 35

    def _compute_credibility_score(self, annotations: List[Dict[str, Any]]) -> int:
        """ Mock implementation - would require DA API. for now return 75 if cited. """
        if not annotations:
            return 0
        return 75 # Placeholder

    def _extract_citation_contexts(self, task_response: Dict[str, Any], target_normalized: str) -> List[str]:
        """ Extract text surrounding the citation of target URL. """
        contexts = []
        try:
            tasks = task_response.get("tasks", [])
            if not tasks: return []
            
            result_list = tasks[0].get("result", [])
            for res_item in result_list:
                    items = res_item.get("items", [])
                    for item in items:
                        sections = item.get("sections", [])
                        for section in sections:
                            text = section.get("text", "")
                            anns = section.get("annotations", [])
                            # Check if target is in annotations
                            match = False
                            for a in anns:
                                if self._url_matches(target_normalized, a.get("url", "")):
                                    match = True
                                    break
                            
                            if match:
                                contexts.append(text)
        except Exception:
            pass
        return contexts

    def _compute_content_quality_score(self, contexts: List[str], prompt: str) -> float:
        """ Evaluate how detailed/positive the mention is. Max 100. """
        if not contexts:
            return 0.0
        
        scores = []
        prompt_lower = prompt.lower()
        prompt_keywords = set(re.findall(r'\b\w{4,}\b', prompt_lower))
        
        for context in contexts:
            if not context or len(context.strip()) < 10:
                scores.append(0.0)
                continue

            context_lower = context.lower()
            context_len = len(context.strip())
            
            # 1. Context Length Score (Max 30 points)
            # < 100 chars: 0-10 pts
            # 100-300 chars: 10-20 pts
            # > 300 chars: 20-30 pts
            if context_len < 100:
                length_score = (context_len / 100) * 10
            elif context_len < 300:
                length_score = 10 + ((context_len - 100) / 200) * 10
            else:
                length_score = 20 + min(((context_len - 300) / 500) * 10, 10)
            
            # 2. Completeness Score (Max 40 points)
            has_sentences = bool(re.search(r'[.!?]\s+', context))
            has_words = len(re.findall(r'\b\w+\b', context)) > 5
            
            completeness_score = 0.0
            if has_words: completeness_score += 20.0
            if has_sentences: completeness_score += 20.0
            
            # 3. Relevance Score (Max 30 points)
            context_keywords = set(re.findall(r'\b\w{4,}\b', context_lower))
            overlap = len(prompt_keywords & context_keywords)
            max_overlap = max(len(prompt_keywords), 1)
            relevance_score = min(1, (overlap / max_overlap)) * 30.0
            
            total_score = length_score + completeness_score + relevance_score
            scores.append(min(100.0, total_score))
        
        return round(sum(scores) / len(scores), 1) if scores else 0.0

    # ... (existing methods)

    async def analyze_ranking(
        self,
        url: str,
        aggregated_text: str,
        prompts: Optional[List[str]] = None,
        location: Optional[str] = None,
        topic_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyze ranking position, percentile, model-wise comparison,
        content quality, and entity coverage.
        """
        logger.info(f"Starting Ranking Analysis for URL: {url}")
        
        target_normalized = self._normalize_url(url)
        logger.info(f"Normalized Target URL: '{target_normalized}'") 
        
        platforms = list(SUPPORTED_PLATFORMS)
        
        # 1. Generate Prompts if not provided
        if not prompts:
            logger.info("No prompts provided. Generating from content...")
            
            if not aggregated_text or len(aggregated_text) < 100:
                 # Fetch if empty
                 # Note: in runner.py main flow, aggregated_text is usually passed. 
                 # If we need to fetch specifically only here, we generally assume it's passed.
                 # For safety, if empty, we might need to rely on minimal defaults or fail.
                 logger.warning("Aggregated text is empty, trying to usage minimal topic info")
                 mandate = {
                     "topic": topic_override or "Unknown",
                     "audience": "General",
                     "brand_name": "",
                     "location": location or ""
                 }
            else:
                 # Generate mandate first for context
                 mandate = await self.consistency_module.generate_canonical_topic(aggregated_text, url=url)
            
            topic = topic_override or mandate.get("topic", "Unknown")
            audience = mandate.get("audience", "General")
            brand = mandate.get("brand_name", "")
            loc = location or mandate.get("location", "")
            
            prompts = await self.consistency_module.generate_ranking_prompts(
                topic=topic,
                audience=audience,
                brand_name=brand,
                location=loc
            )
        
        if not prompts:
             logger.error("Failed to generate prompts.")
             return {"error": "Could not generate prompts"}

        logger.info(f"Using prompts: {prompts}")
        
        ranking_position_per_prompt = []
        percentile_by_prompt = {}
        model_wise_rows = []
        content_quality_by_prompt_model = {}
        all_citation_contexts = []
        errors = []
        batch_accuracy_items = []
        
        # Ensure brand is set for consistency check
        # If we entered the block above, brand is set. If prompts were passed, it might not be.
        # Also handle empty brand case.
        if 'brand' not in locals() or not brand:
             # Try to recover brand from mandate if available
             brand = locals().get('mandate', {}).get('brand_name', "")
        
        if not brand and url:
             # Fallback: extract brand from domain
             try:
                 domain = self._extract_domain(url)
                 if domain:
                     brand = domain.split('.')[0].capitalize()
             except:
                 pass
        
        logger.info(f"Using Brand Name for analysis: '{brand}'")

        # Initialize structures
        for prompt in prompts:
            percentile_by_prompt[prompt] = {}
            content_quality_by_prompt_model[prompt] = {}
            model_wise_rows.append({"prompt": prompt})

        # 2. Query DataForSEO for each platform
        # 2. Query DataForSEO for each platform
        async def fetch_binding(p_platform, p_prompt):
             # Helper to run single prompt request
             model_name = DEFAULT_MODELS.get(p_platform, p_platform)
             # Single object payload (list of 1)
             payload_item = {
                "user_prompt": p_prompt[:500],
                "model_name": model_name,
                "max_output_tokens": 2048,
             }
             
             # 'force_web_search' is rejected by Gemini endpoint in DataForSEO
             if p_platform != "gemini":
                 payload_item["web_search"] = True
                 payload_item["force_web_search"] = True
             else:
                 # Gemini usually has built-in knowledge or different search params, 
                 # but for now we omit the flag to avoid 405 error.
                 # We can try just "web_search": True if supported, but error said Invalid Field 'force_web_search'.
                 payload_item["web_search"] = True

             single_payload = [payload_item]
             
             # Endpoint format: /v3/ai_optimization/{platform}/llm_responses/live
             endpoint = f"/ai_optimization/{p_platform}/llm_responses/live"
             
             try:
                 logger.info(f"[{p_platform}] Request Payload (Single): {json.dumps(single_payload, indent=2)}")
             except:
                 pass

             resp = await execute_task(
                 task_name=f"module_e_ranking_{p_platform}",
                 input_data={
                     "endpoint": endpoint,
                     "payload": single_payload
                 },
                 provider="dataforseo"
             )
             return p_platform, p_prompt, resp

        # Create all coroutines for (platform * prompts)
        tasks = []
        for platform in platforms:
             for prompt in prompts:
                 tasks.append(fetch_binding(platform, prompt))
        
        logger.info(f"Dispatching {len(tasks)} ranking queries in parallel...")
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        for res in results:
             if isinstance(res, Exception):
                 logger.error(f"Parallel fetch failed: {res}")
                 continue
             
             platform, prompt, resp = res
             
             if not resp.success:
                 err_msg = f"{platform}: {resp.error}"
                 errors.append(err_msg)
                 logger.error(err_msg)
                 # Mark valid row null
                 row = next((r for r in model_wise_rows if r["prompt"] == prompt), None)
                 if row: row[platform] = None
                 continue
             
             data = resp.data
             try:
                 logger.info(f"[{platform}] Response for '{prompt[:20]}...': {json.dumps(data, indent=2)[:2000]}") 
             except:
                 pass

             tasks_list = data.get("tasks", [])
             
             # Should strictly be 1 task since we sent 1
             if not tasks_list:
                 logger.warning(f"[{platform}] No tasks returned for prompt '{prompt[:10]}...'")
                 continue

             task = tasks_list[0]
             
             # Extract annotations and text
             annotations = []
             ai_response_text = ""
             
             res_results = task.get("result")
             if not res_results:
                 status_code = task.get("status_code")
                 status_msg = task.get("status_message")
                 err_msg = f"API Error [{platform}]: {status_code} - {status_msg}"
                 logger.warning(err_msg)
                 errors.append(err_msg)
                 continue
             
             for res_item in res_results:
                 for item in res_item.get("items", []):
                     # Extract full text for accuracy check
                    if not ai_response_text:
                        ai_response_text = item.get("text") or item.get("description") or ""
                        # Fallback: try to construct from sections if main text is empty
                        if not ai_response_text and item.get("sections"):
                            ai_response_text = "\n".join([s.get("text", "") for s in item.get("sections") if s.get("text")])

                    for section in item.get("sections", []):
                         anns = section.get("annotations", [])
                         if anns:
                             annotations.extend(anns)
             
             logger.info(f"[{platform}] Found {len(annotations)} annotations total for prompt '{prompt[:20]}...'")
             if annotations:
                  matches = [a for a in annotations if a.get("url") and self._url_matches(target_normalized, a.get("url"))]
                  logger.info(f"[{platform}] Matched {len(matches)} citations for '{target_normalized}'")

             position, percentile = self._find_position_and_percentile(annotations, target_normalized)
             
             citations_count = len(annotations)
             diversity = self._compute_source_diversity(annotations)
             credibility = self._compute_credibility_score(annotations)
             
             # Prepare for Batch Accuracy Score
             # We use the current index as the ID
             current_idx = len(ranking_position_per_prompt)
             if ai_response_text:
                 batch_accuracy_items.append({
                     "id": current_idx,
                     "text": ai_response_text
                 })
             
             # Contexts
             task_wrapper = {"tasks": [task]}
             contexts = self._extract_citation_contexts(task_wrapper, target_normalized)
             all_citation_contexts.extend(contexts)
             
             quality_score = self._compute_content_quality_score(contexts, prompt)
             content_quality_by_prompt_model[prompt][platform] = quality_score
             
             # Update aggregated structures
             ranking_position_per_prompt.append({
                "prompt": prompt,
                "model": platform,
                "position": position,
                "total_cited": citations_count,
                "source_diversity": diversity,
                "credibility_score": credibility,
                "percentile": percentile,
                "content_quality_score": quality_score,
                "accuracy_score": 0.0, # Will be updated via batch
                "sentiment_score": 0.0 # Will be updated via batch
             })
             
             percentile_by_prompt[prompt][platform] = percentile
             
             row = next((r for r in model_wise_rows if r["prompt"] == prompt), None)
             if row:
                 row[platform] = position

        # 3. Batch Accuracy & Sentiment Calculation
        if batch_accuracy_items:
            logger.info(f"Calculating accuracy & sentiment scores for {len(batch_accuracy_items)} responses in batch...")
            batch_scores = await self.consistency_module.calculate_batch_accuracy_scores(
                aggregated_text,
                batch_accuracy_items,
                brand
            )
            
            # Update scores in the main list
            for item_id_str, scores in batch_scores.items():
                try:
                    idx = int(item_id_str)
                    if 0 <= idx < len(ranking_position_per_prompt):
                        ranking_position_per_prompt[idx]["accuracy_score"] = scores.get("accuracy", 0.0)
                        ranking_position_per_prompt[idx]["sentiment_score"] = scores.get("sentiment", 0.0)
                except ValueError:
                    pass

        # 4. Entity Coverage Analysis (using aggregated contexts)
        logger.info(f"Analyzing Entity Coverage on {len(all_citation_contexts)} contexts...")
        
        # Get expected entities from original content
        expected_entities = await self.entity_coverage_module.generate_expected_entities(aggregated_text)
        
        # Get observed entities from citation contexts
        joined_contexts = " ".join(all_citation_contexts)
        observed_entities = []
        if joined_contexts:
             observed_entities = await self.entity_coverage_module.extract_observed_entities(joined_contexts)
        
        coverage_result = self.entity_coverage_module.compare(expected_entities, observed_entities)
        
        # 4. Final Aggregation
        
        # Avg quality score (only for found citations)
        quality_scores = []
        for p_scores in content_quality_by_prompt_model.values():
            for s in p_scores.values():
                if s > 0: quality_scores.append(s)
        avg_quality = round(sum(quality_scores)/len(quality_scores), 1) if quality_scores else 0.0

        # Avg Accuracy & Sentiment (across ALL prompts)
        total_acc = 0.0
        total_sent = 0.0
        count_items = len(ranking_position_per_prompt)
        
        for row in ranking_position_per_prompt:
            total_acc += row.get("accuracy_score", 0.0)
            total_sent += row.get("sentiment_score", 0.0)
            
        avg_accuracy = round(total_acc / count_items, 1) if count_items > 0 else 0.0
        avg_sentiment = round(total_sent / count_items, 2) if count_items > 0 else 0.0
        
        result_payload = {
            "ranking_position_per_prompt": ranking_position_per_prompt,
            "percentile_by_prompt": percentile_by_prompt,
            "model_wise_comparison": model_wise_rows,
            "content_quality": {
                "overall_score": avg_quality,
                "by_prompt_model": content_quality_by_prompt_model
            },
            "metrics_summary": {
                "average_accuracy": avg_accuracy,
                "average_sentiment": avg_sentiment
            },
            "entity_coverage": {
                "score": coverage_result["score"],
                "found_entities": coverage_result["found"],
                "missing_entities": coverage_result["missing"],
                "total_expected": coverage_result["total_expected"]
            },
            "generated_prompts": prompts,
            "errors": errors if errors else None
        }
        
        logger.info("Ranking Analysis Completed")
        return result_payload


# Import helpers for data fetching
from utils.mongo import mongo_manager
from utils.storage import load_raw_html
from datetime import datetime

def _extract_text(html: str) -> str:
    if not html:
        return ""
    try:
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator=" ", strip=True)
        return " ".join(text.split())
    except Exception:
        return ""

async def _fetch_text_simple(url: str) -> str:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=10) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    return _extract_text(html)
    except:
        pass
    return ""

async def run_ranking_analysis(job_id: str, url: str, html_content: str = None) -> Dict[str, Any]:
    """
    Entry point for Job Runner.
    Aggregates text from homepage + top pages (from Mongo), then runs Ranking Analysis.
    Persists result to Module E collection.
    """
    logger.info(f"Preparing Rank Analysis for {job_id} / {url}")
    mongo_manager.connect()

    # 1. Get Homepage Text
    if not html_content:
        html_content = await load_raw_html(job_id)
    
    # Fallback: Fetch live if missing from storage
    if not html_content and url:
        logger.info(f"Homepage content missing for {job_id}, fetching live from {url}...")
        html_content = await _fetch_text_simple(url)

    homepage_text = _extract_text(html_content)
    
    # 2. Get Top Pages Text (if available from previous crawl)
    top_texts = []
    try:
        pages = list(
            mongo_manager.pages.find({"jobId": job_id}).sort("word_count", -1).limit(5)
        )
        if pages:
            # We don't have text cached in mongo pages usually, so we might need to fetch live
            # mirroring module_E/runner.py logic
            urls = [p.get("url") for p in pages if p.get("url")]
            logger.info(f"Fetching top pages for context: {urls}")
            tasks = [_fetch_text_simple(u) for u in urls]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for res in results:
                if isinstance(res, str) and res:
                    top_texts.append(res)
    except Exception as e:
        logger.warning(f"Failed to fetch top pages: {e}")

    aggregated_text = "\n\n".join([t for t in [homepage_text] + top_texts if t])[:12000]
    
    if not aggregated_text:
        logger.warning("No content could be aggregated!")

    # 3. Run Analysis
    runner = RankingRunner()
    result_data = await runner.analyze_ranking(url, aggregated_text)

    # 4. Persist
    if result_data and "error" not in result_data:
        try:
             mongo_manager.module_e.update_one(
                {"jobId": job_id},
                {
                    "$set": {
                        "jobId": job_id,
                        "ranking_analysis": result_data,
                        "updatedAt": datetime.utcnow(),
                    },
                    "$setOnInsert": {
                        "createdAt": datetime.utcnow(),
                    },
                },
                upsert=True,
            )
             logger.info(f"Ranking Analysis persisted for {job_id}")
        except Exception as e:
            logger.error(f"Failed to persist ranking analysis: {e}")
            
    return {
        "job_id": job_id,
        "ranking_analysis": result_data
    }

"""
AI Citation Ranking Service (Module E)
Uses DataForSEO LLM Responses API to get ranking position, percentile rank,
and model-wise comparison across ChatGPT, Claude, Gemini (no Perplexity).
"""

import asyncio
import logging
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Platform -> default model name (DataForSEO resolves to latest version)
DEFAULT_MODELS = {
    "chat_gpt": "gpt-4.1-mini",
    "claude": "claude-opus-4-0",
    "gemini": "gemini-2.0-flash",
}

SUPPORTED_PLATFORMS = ["chat_gpt", "claude", "gemini"]


def _normalize_url(url: str) -> str:
    """Normalize URL for matching: lowercase, strip trailing slash, remove common query params."""
    if not url:
        return ""
    url = url.strip().lower()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    parsed = urlparse(url)
    # Rebuild without fragment and without utm_* params
    path = parsed.path.rstrip("/") or "/"
    return f"{parsed.netloc}{path}"


def _url_matches(target_normalized: str, citation_url: str) -> bool:
    """Check if citation URL matches target (domain + path)."""
    if not citation_url:
        return False
    citation_normalized = _normalize_url(citation_url)
    # Direct match or target is prefix of citation (e.g. target=example.com, citation=example.com/page)
    return target_normalized in citation_normalized or citation_normalized in target_normalized


def _extract_annotations_in_order(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extract all annotations from DataForSEO LLM response in citation order.
    Annotations can appear in multiple sections; we preserve order.
    """
    annotations = []
    tasks = result.get("tasks") or []
    if not tasks:
        return annotations
    task = tasks[0]
    for res in task.get("result") or []:
        for item in res.get("items") or []:
            for section in item.get("sections") or []:
                section_ann = section.get("annotations")
                if section_ann:
                    annotations.extend(section_ann)
    return annotations


def _find_position_and_percentile(
    annotations: List[Dict[str, Any]], target_normalized: str
) -> tuple[Optional[int], Optional[int]]:
    """
    Find 1-based position of target URL and percentile rank.
    Percentile: (1 - (position-1)/total) * 100, higher = better.
    """
    total = len(annotations)
    if total == 0:
        return None, None
    for i, ann in enumerate(annotations):
        url = ann.get("url")
        if url and _url_matches(target_normalized, url):
            position = i + 1
            percentile = round((1 - (position - 1) / total) * 100)
            return position, percentile
    return None, None


def _extract_domain(url: str) -> str:
    """Extract domain from URL for diversity/credibility."""
    if not url:
        return ""
    try:
        parsed = urlparse(url.strip().lower())
        netloc = parsed.netloc or ""
        return netloc[4:] if netloc.startswith("www.") else netloc
    except Exception:
        return ""


def _compute_source_diversity(annotations: List[Dict[str, Any]]) -> float:
    """Source diversity = unique domains / total citations (0-100)."""
    if not annotations:
        return 0.0
    domains = {_extract_domain(a.get("url") or "") for a in annotations if a.get("url")}
    domains.discard("")
    total = len(annotations)
    return round((len(domains) / total) * 100, 1) if total else 0.0


CREDIBLE_TLDS = {"gov", "edu", "mil"}
KNOWN_NEWS = {"nytimes.com", "bbc.com", "reuters.com", "apnews.com", "washingtonpost.com"}


def _domain_credibility_score(domain: str) -> int:
    """Score 0-100 per domain (heuristic)."""
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


def _compute_credibility_score(annotations: List[Dict[str, Any]]) -> float:
    """Average credibility of cited domains (0-100)."""
    if not annotations:
        return 0.0
    scores = []
    for a in annotations:
        url = a.get("url")
        if url:
            d = _extract_domain(url)
            if d:
                scores.append(_domain_credibility_score(d))
    return round(sum(scores) / len(scores), 1) if scores else 0.0


def _extract_citation_contexts(result: Dict[str, Any], target_normalized: str) -> List[str]:
    """
    Extract text contexts around citations from DataForSEO LLM response.
    Returns list of text snippets where target URL is cited.
    """
    contexts = []
    tasks = result.get("tasks") or []
    if not tasks:
        return contexts
    
    task = tasks[0]
    for res in task.get("result") or []:
        for item in res.get("items") or []:
            for section in item.get("sections") or []:
                section_text = section.get("text") or ""
                section_ann = section.get("annotations") or []
                
                # Check if target URL appears in this section's annotations
                for ann in section_ann:
                    ann_url = ann.get("url")
                    if ann_url and _url_matches(target_normalized, ann_url):
                        # Extract context around citation (up to 500 chars)
                        contexts.append(section_text[:500])
                        break
    
    return contexts


def _compute_content_quality_score(
    citation_contexts: List[str], 
    prompt: str
) -> float:
    """
    Compute content quality/completeness score (0-100) based on citation contexts.
    
    Factors:
    - Context length (30%): Longer descriptive text = better
    - Completeness (40%): Descriptive vs bare URL
    - Relevance (30%): Simple keyword overlap with prompt
    """
    if not citation_contexts:
        return 0.0
    
    scores = []
    prompt_lower = prompt.lower()
    prompt_keywords = set(re.findall(r'\b\w{4,}\b', prompt_lower))
    
    for context in citation_contexts:
        if not context or len(context.strip()) < 10:
            scores.append(0.0)
            continue
        
        context_lower = context.lower()
        context_len = len(context.strip())
        
        # 1. Context Length Score (30% weight)
        # Normalize: 0-100 chars = 0-30, 100-300 = 30-60, 300+ = 60-100
        if context_len < 100:
            length_score = (context_len / 100) * 30
        elif context_len < 300:
            length_score = 30 + ((context_len - 100) / 200) * 30
        else:
            length_score = min(100, 60 + ((context_len - 300) / 200) * 40)
        
        # 2. Completeness Score (40% weight)
        # Check if context is descriptive (has sentences, not just URL)
        has_sentences = bool(re.search(r'[.!?]\s+', context))
        has_words = len(re.findall(r'\b\w+\b', context)) > 5
        completeness_score = 40.0 if (has_sentences and has_words) else 20.0
        
        # 3. Relevance Score (30% weight)
        # Simple keyword overlap with prompt
        context_keywords = set(re.findall(r'\b\w{4,}\b', context_lower))
        overlap = len(prompt_keywords & context_keywords)
        max_overlap = max(len(prompt_keywords), 1)
        relevance_score = min(100, (overlap / max_overlap) * 100) * 0.3
        
        total_score = length_score + completeness_score + relevance_score
        scores.append(min(100.0, total_score))
    
    return round(sum(scores) / len(scores), 1) if scores else 0.0


class AIRankingService:
    """Service for analyzing AI citation rankings across LLM models."""

    def __init__(self):
        print("🎯 [AI RANKING] Initializing AI Ranking Service...")
        try:
            from ..module_A.dataforseo_client import DataForSEOClient
            self.client = DataForSEOClient()
            print("✅ [AI RANKING] DataForSEO client initialized successfully")
        except Exception as e:
            print(f"⚠️ [AI RANKING] DataForSEO client not available: {str(e)}")
            logger.warning("DataForSEO client not available: %s", e)
            self.client = None

    def _fetch_page_text(self, url: str, max_chars: int = 5000, timeout: int = 12) -> str:
        """Fetch URL and return plain text excerpt for context."""
        try:
            if not url or not isinstance(url, str):
                return ""
            url = url.strip()
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            resp = requests.get(url, headers=headers, timeout=timeout, verify=False)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
            text = re.sub(r"\s+", " ", text).strip()
            return text[:max_chars] if text else ""
        except Exception as e:
            logger.warning("[ranking] Failed to fetch page for prompt generation: %s", e)
            return ""

    async def generate_prompts_from_url(
        self,
        url: str,
        location_override: Optional[str] = None,
        topic_override: Optional[str] = None,
        custom_prompts: Optional[List[str]] = None,
    ) -> List[str]:
        """
        Auto-generate ranking prompts from page content (topic, audience, location).
        Supports user overrides for location, topic, and custom prompts.
        """
        from .content_consistency_service import ContentConsistencyService

        if custom_prompts and len(custom_prompts) >= 2:
            prompts = [p.strip()[:200] for p in custom_prompts if p.strip()][:5]
            logger.info("[ranking] Using %d custom prompts: %s", len(prompts), prompts)
            return prompts

        context = await asyncio.to_thread(self._fetch_page_text, url)
        if not context.strip():
            logger.warning("[ranking] No page content for prompt generation; using fallbacks")

        mandate = await ContentConsistencyService.generate_canonical_topic(
            context, url, use_gemini=True
        )
        topic = topic_override or mandate.get("topic", "Unknown")
        audience = mandate.get("audience", "General")
        brand_name = mandate.get("brand_name", "")
        location = location_override or mandate.get("location", "")

        logger.info(
            "[ranking] Mandate (Gemini): topic=%s, audience=%s, brand=%s, location=%s",
            topic, audience, brand_name, location,
        )

        prompts = await ContentConsistencyService.generate_ranking_prompts(
            topic=topic,
            audience=audience,
            brand_name=brand_name,
            location=location,
            use_gemini=True,
        )
        logger.info("[ranking] Auto-generated %d prompts: %s", len(prompts), prompts)
        return prompts

    async def _analyze_entity_coverage_in_citations(
        self,
        url: str,
        citation_contexts: List[str],
    ) -> Dict[str, Any]:
        """
        Analyze entity coverage: compare expected entities from website 
        vs observed entities in AI citation contexts.
        """
        try:
            from ..module_B.entity_coverage_service import EntityCoverageService
            
            # 1. Get expected entities from website
            website_content = await asyncio.to_thread(self._fetch_page_text, url, max_chars=10000)
            if not website_content:
                return {
                    "score": 0,
                    "found_entities": [],
                    "missing_entities": [],
                    "total_expected": 0,
                }
            
            expected_entities = await EntityCoverageService.generate_expected_entities(
                website_content
            )
            
            if not expected_entities:
                return {
                    "score": 0,
                    "found_entities": [],
                    "missing_entities": [],
                    "total_expected": 0,
                }
            
            # 2. Extract observed entities from citation contexts
            all_citation_text = " ".join(citation_contexts)
            if not all_citation_text:
                return {
                    "score": 0,
                    "found_entities": [],
                    "missing_entities": expected_entities,
                    "total_expected": len(expected_entities),
                }
            
            # Batch process citation text (max 12000 chars per batch)
            observed_entities_list = []
            batch_size = 12000
            for i in range(0, len(all_citation_text), batch_size):
                batch = all_citation_text[i:i + batch_size]
                observed = await EntityCoverageService.extract_observed_entities(batch)
                observed_entities_list.extend(observed)
            
            # Remove duplicates
            observed_entities = list(set(observed_entities_list))
            
            # 3. Compare coverage
            coverage_result = EntityCoverageService.compare_entity_coverage(
                expected_entities, observed_entities
            )
            
            logger.info(
                "[ranking] Entity coverage: score=%d, found=%d, missing=%d",
                coverage_result.get("score", 0),
                len(coverage_result.get("found_entities", [])),
                len(coverage_result.get("missing_entities", [])),
            )
            
            return {
                "score": coverage_result.get("score", 0),
                "found_entities": coverage_result.get("found_entities", []),
                "missing_entities": coverage_result.get("missing_entities", []),
                "total_expected": len(expected_entities),
            }
        except Exception as e:
            logger.warning("[ranking] Entity coverage analysis failed: %s", e)
            return {
                "score": 0,
                "found_entities": [],
                "missing_entities": [],
                "total_expected": 0,
            }

    async def analyze_ranking(
        self,
        url: str,
        prompts: List[str],
        models: Optional[List[str]] = None,
        generated_prompts: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Analyze ranking position, percentile, model-wise comparison,
        content quality, and entity coverage.
        """
        if not self.client:
            print("❌ [AI RANKING] DataForSEO API not configured - client is None")
            return {
                "success": False,
                "error": "DataForSEO API not configured",
                "url": url,
                "ranking_position_per_prompt": [],
                "percentile_by_prompt": {},
                "model_wise_comparison": [],
                "content_quality": {},
                "entity_coverage": {},
            }

        if not url or not prompts:
            return {
                "success": False,
                "error": "url and prompts are required",
                "url": url or "",
                "ranking_position_per_prompt": [],
                "percentile_by_prompt": {},
                "model_wise_comparison": [],
                "content_quality": {},
                "entity_coverage": {},
            }

        prompts = [p.strip() for p in prompts if p.strip()][:5]  # Max 5 prompts
        platforms = models or list(SUPPORTED_PLATFORMS)
        target_normalized = _normalize_url(url)

        ranking_position_per_prompt: List[Dict[str, Any]] = []
        percentile_by_prompt: Dict[str, Dict[str, Any]] = {}
        model_wise_rows: List[Dict[str, Any]] = []
        errors: List[str] = []
        
        # Aggregate citation contexts for entity coverage (across all prompts/models)
        all_citation_contexts: List[str] = []
        content_quality_by_prompt_model: Dict[str, Dict[str, float]] = {}

        logger.info("[ranking] analyze_ranking: url=%s, prompts=%s, platforms=%s", url, prompts, platforms)
        print(f"🔍 [AI RANKING] Starting analysis for URL: {url}")
        print(f"📝 [AI RANKING] Analyzing {len(prompts)} prompts across {len(platforms)} platforms")
        for prompt in prompts:
            percentile_by_prompt[prompt] = {}
            content_quality_by_prompt_model[prompt] = {}
            row: Dict[str, Any] = {"prompt": prompt}
            model_wise_rows.append(row)

            for platform in platforms:
                if platform not in SUPPORTED_PLATFORMS:
                    continue
                model_name = DEFAULT_MODELS.get(platform, platform)
                payload = [
                    {
                        "user_prompt": prompt[:500],
                        "model_name": model_name,
                        "web_search": True,
                        "force_web_search": True,
                        "max_output_tokens": 2048,
                    }
                ]

                print(f"🚀 [AI RANKING] Querying {platform} for prompt: '{prompt[:60]}...'")
                try:
                    response = self.client.post_llm_responses(platform, payload)
                    print(f"📥 [AI RANKING] Received response from {platform}")
                except Exception as e:
                    err_msg = f"{platform}: {str(e)}"
                    errors.append(err_msg)
                    logger.warning("LLM response failed for %s: %s", platform, e)
                    row[platform] = None
                    continue

                if response.get("status_code") != 20000:
                    err_msg = f"{platform}: {response.get('status_message', 'API error')}"
                    errors.append(err_msg)
                    row[platform] = None
                    continue

                annotations = _extract_annotations_in_order(response)
                position, percentile = _find_position_and_percentile(
                    annotations, target_normalized
                )
                
                print(f"📊 [AI RANKING] {platform} results: position={position}, percentile={percentile}, citations={len(annotations)}")

                citations_count = len(annotations)
                source_diversity = _compute_source_diversity(annotations)
                credibility_score = _compute_credibility_score(annotations)
                
                # Extract citation contexts for content quality
                citation_contexts = _extract_citation_contexts(response, target_normalized)
                content_quality_score = _compute_content_quality_score(citation_contexts, prompt)
                
                # Aggregate contexts for entity coverage
                all_citation_contexts.extend(citation_contexts)
                content_quality_by_prompt_model[prompt][platform] = content_quality_score

                logger.debug(
                    "[ranking] prompt=%r platform=%s citations=%d diversity=%.1f credibility=%.1f quality=%.1f",
                    prompt[:50], platform, citations_count, source_diversity, credibility_score, content_quality_score,
                )

                ranking_position_per_prompt.append({
                    "prompt": prompt,
                    "model": platform,
                    "position": position,
                    "total_cited": citations_count,
                    "percentile": percentile,
                    "source_diversity": source_diversity,
                    "credibility_score": credibility_score,
                    "content_quality_score": content_quality_score,
                })
                percentile_by_prompt[prompt][platform] = percentile
                row[platform] = position

                time.sleep(0.5)  # Rate limit cushion

        # Analyze entity coverage across all citations
        entity_coverage_result = await self._analyze_entity_coverage_in_citations(
            url, all_citation_contexts
        )
        
        # Calculate average content quality scores
        quality_scores = []
        for prompt_scores in content_quality_by_prompt_model.values():
            for score in prompt_scores.values():
                if score > 0:
                    quality_scores.append(score)
        
        avg_content_quality = round(sum(quality_scores) / len(quality_scores), 1) if quality_scores else 0.0

        return {
            "success": True,
            "url": url,
            "ranking_position_per_prompt": ranking_position_per_prompt,
            "percentile_by_prompt": percentile_by_prompt,
            "model_wise_comparison": model_wise_rows,
            "content_quality": {
                "overall_score": avg_content_quality,
                "by_prompt_model": content_quality_by_prompt_model,
            },
            "entity_coverage": entity_coverage_result,
            "errors": errors if errors else None,
            "generated_prompts": generated_prompts,
        }

"""
AI Citation Ranking Service (Module E)
Uses DataForSEO LLM Responses API to get ranking position, percentile rank,
and model-wise comparison across ChatGPT, Claude, Gemini, Perplexity.
"""

import asyncio
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Platform -> default model name (DataForSEO resolves to latest version)
DEFAULT_MODELS = {
    "chat_gpt": "gpt-4.1-mini",
    "claude": "claude-opus-4-0",
    "gemini": "gemini-2.0-flash",
    "perplexity": "sonar",
}

SUPPORTED_PLATFORMS = ["chat_gpt", "claude", "gemini", "perplexity"]


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


class AIRankingService:
    """Service for analyzing AI citation rankings across LLM models."""

    def __init__(self):
        try:
            from ..module_A.dataforseo_client import DataForSEOClient
            self.client = DataForSEOClient()
        except Exception as e:
            logger.warning(f"DataForSEO client not available: {e}")
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
            logger.warning(f"[ranking] Failed to fetch page for prompt generation: {e}")
            return ""

    async def generate_prompts_from_url(self, url: str) -> List[str]:
        """
        Auto-generate ranking prompts from page content using topic/brand/audience.
        Fetches page, extracts canonical topic, then generates 5 natural search prompts.
        """
        from .content_consistency_service import ContentConsistencyService

        context = await asyncio.to_thread(self._fetch_page_text, url)
        if not context.strip():
            logger.warning("[ranking] No page content for prompt generation; using fallback")
            return ["best companies", "top services", "recommended providers"]

        mandate = await ContentConsistencyService.generate_canonical_topic(context)
        topic = mandate.get("topic", "Unknown")
        audience = mandate.get("audience", "General")
        brand_name = mandate.get("brand_name", "")

        prompts = await ContentConsistencyService.generate_ranking_prompts(
            topic=topic, audience=audience, brand_name=brand_name
        )
        logger.info(f"[ranking] Auto-generated prompts: {prompts}")
        return prompts

    def analyze_ranking(
        self,
        url: str,
        prompts: List[str],
        models: Optional[List[str]] = None,
        generated_prompts: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Analyze ranking position, percentile, and model-wise comparison.
        """
        if not self.client:
            return {
                "success": False,
                "error": "DataForSEO API not configured",
                "url": url,
                "ranking_position_per_prompt": [],
                "percentile_by_prompt": {},
                "model_wise_comparison": [],
            }

        if not url or not prompts:
            return {
                "success": False,
                "error": "url and prompts are required",
                "url": url or "",
                "ranking_position_per_prompt": [],
                "percentile_by_prompt": {},
                "model_wise_comparison": [],
            }

        prompts = [p.strip() for p in prompts if p.strip()][:5]  # Max 5 prompts
        platforms = models or list(SUPPORTED_PLATFORMS)
        target_normalized = _normalize_url(url)

        ranking_position_per_prompt: List[Dict[str, Any]] = []
        percentile_by_prompt: Dict[str, Dict[str, Any]] = {}
        model_wise_rows: List[Dict[str, Any]] = []
        errors: List[str] = []

        for prompt in prompts:
            percentile_by_prompt[prompt] = {}
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

                try:
                    response = self.client.post_llm_responses(platform, payload)
                except Exception as e:
                    err_msg = f"{platform}: {str(e)}"
                    errors.append(err_msg)
                    logger.warning(f"LLM response failed for {platform}: {e}")
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

                ranking_position_per_prompt.append({
                    "prompt": prompt,
                    "model": platform,
                    "position": position,
                    "total_cited": len(annotations),
                    "percentile": percentile,
                })
                percentile_by_prompt[prompt][platform] = percentile
                row[platform] = position

                time.sleep(0.5)  # Rate limit cushion

        return {
            "success": True,
            "url": url,
            "ranking_position_per_prompt": ranking_position_per_prompt,
            "percentile_by_prompt": percentile_by_prompt,
            "model_wise_comparison": model_wise_rows,
            "errors": errors if errors else None,
            "generated_prompts": generated_prompts,
        }

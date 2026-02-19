import json
import logging
from typing import Dict, Any, List
from bs4 import BeautifulSoup
from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_content_consistency")


def _safe_parse_json(raw: str) -> Dict[str, Any]:
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except Exception:
                return {}
        return {}


class ContentConsistencyModule:
    """
    Computes a content consistency score by first generating a canonical topic
    and then scoring batches of content against it.
    """

    async def generate_canonical_topic(self, context: str, url: str = "") -> Dict[str, str]:
        if not context or len(context.strip()) < 100:
            return {
                "topic": "Unknown",
                "audience": "General",
                "tone": "Neutral",
                "brand_name": "",
                "location": "",
            }

        prompt = f"""
Analyze the content below and define a strict Content Mandate.
Return JSON only with these fields:
{{
  "topic": "specific field",
  "audience": "target audience",
  "tone": "brand voice",
  "brand_name": "official brand name",
  "location": "city/region/country or empty"
}}

URL: {url}

CONTENT:
{context[:5000]}
"""

        logger.info(
            "Content mandate request",
            extra={"url": url, "context_len": len(context)}
        )

        resp = await execute_task(
            task_name="module_e_content_mandate",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("Content mandate LLM failed: %s", resp.error)
            return {
                "topic": "Unknown",
                "audience": "General",
                "tone": "Neutral",
                "brand_name": "",
                "location": "",
            }

        try:
            data = _safe_parse_json(resp.data)
            result = {
                "topic": (data.get("topic") or "Unknown").strip(),
                "audience": (data.get("audience") or "General").strip(),
                "tone": (data.get("tone") or "Neutral").strip(),
                "brand_name": (data.get("brand_name") or "").strip(),
                "location": (data.get("location") or "").strip(),
            }
            logger.info("Content mandate response", extra={"result": result})
            return result
        except Exception as exc:
            logger.warning("Failed to parse content mandate: %s", exc)
            return {
                "topic": "Unknown",
                "audience": "General",
                "tone": "Neutral",
                "brand_name": "",
                "location": "",
            }

    async def generate_ranking_prompts(
        self,
        topic: str,
        audience: str,
        brand_name: str,
        location: str,
        use_gemini: bool = False,
    ) -> List[str]:
        """
        Generate 5 distinct search prompts a user might use to find this content.
        """
        prompt = f"""
        You are an SEO Strategist. Generate 5 distinct Google search prompts a user would strictly use to find a website with this mandate.
        Target High Intent keywords.
        
        MANDATE:
        - Topic: {topic}
        - Audience: {audience}
        - Brand: {brand_name}
        - Location: {location}
        
        Return JSON only: {{"prompts": ["prompt1", "prompt2", "prompt3", "prompt4", "prompt5"]}}
        """

        logger.info(
            "Ranking prompts generation request",
            extra={
                "topic": topic,
                "audience": audience,
                "brand": brand_name,
                "location": location,
            },
        )

        resp = await execute_task(
            task_name="module_e_ranking_prompts",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.4,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("Ranking prompts LLM failed: %s", resp.error)
            return []

        try:
            data = _safe_parse_json(resp.data)
            prompts = data.get("prompts", [])
            if isinstance(prompts, list):
                # Clean prompts
                cleaned = [p.strip() for p in prompts if isinstance(p, str) and len(p.strip()) > 5]
                logger.info("Ranking prompts generated", extra={"count": len(cleaned), "prompts": cleaned})
                return cleaned
            return []
        except Exception as exc:
            logger.warning("Failed to parse ranking prompts: %s", exc)
            return []

    async def score_batch(self, topic: str, audience: str, tone: str, batch_content: str) -> int:
        if not batch_content or len(batch_content.strip()) < 100:
            return 0

        prompt = f"""
You are a strict Content Auditor. Score how well the content matches the mandate.
Return JSON only: {{"score": 0-100}}.

MANDATE:
- Topic: {topic}
- Audience: {audience}
- Tone: {tone}

CONTENT:
{batch_content[:4000]}
"""

        logger.info(
            "Consistency scoring request",
            extra={
                "topic": topic,
                "audience": audience,
                "tone": tone,
                "content_len": len(batch_content),
            }
        )

        resp = await execute_task(
            task_name="module_e_consistency_score",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("Consistency scoring failed: %s", resp.error)
            return 0

        try:
            data = _safe_parse_json(resp.data)
            score = int(data.get("score", 0))
            score = max(0, min(100, score))
            logger.info("Consistency scoring response", extra={"score": score})
            return score
        except Exception as exc:
            logger.warning("Failed to parse consistency score: %s", exc)
            return 0

    @staticmethod
    def strip_html(html: str) -> str:
        if not html:
            return ""
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator=" ", strip=True)
        return " ".join(text.split())

    async def analyze(self, aggregated_text: str, url: str) -> Dict[str, Any]:
        mandate = await self.generate_canonical_topic(aggregated_text, url=url)

        topic = mandate.get("topic", "Unknown")
        audience = mandate.get("audience", "General")
        tone = mandate.get("tone", "Neutral")

        if topic.lower() == "unknown":
            return {
                "score": 0,
                "mandate": mandate,
                "batch_scores": [],
            }

        batch_score = await self.score_batch(topic, audience, tone, aggregated_text)

        return {
            "score": batch_score,
            "mandate": mandate,
            "batch_scores": [batch_score],
        }

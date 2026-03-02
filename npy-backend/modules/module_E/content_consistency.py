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

    async def calculate_batch_accuracy_scores(self, reference_content: str, items: List[Dict[str, Any]], brand_name: str) -> Dict[str, Dict[str, float]]:
        """
        Calculates accuracy AND sentiment scores for multiple AI responses in a single LLM call.
        items: [{"id": int_index, "text": "generated response"}, ...]
        Returns: {"str(index)": {"accuracy": score, "sentiment": score}, ...}
        """
        if not reference_content or not items:
            logger.warning("[ACCURACY] Skipping batch accuracy: reference_content=%s items=%d",
                           bool(reference_content), len(items))
            return {}

        # Use string versions of the numeric IDs so the LLM key format is unambiguous
        id_map = {str(i["id"]): i for i in items}
        items_payload = [{"id": str(i["id"]), "response": i["text"][:1000]} for i in items]
        items_text = json.dumps(items_payload, indent=2)

        # Build sample keys from actual IDs so the LLM copies the format exactly
        sample_keys = [str(i["id"]) for i in items[:2]]
        example_json = "{\n" + ",\n".join(
            f'  "{k}": {{ "accuracy": 85, "sentiment": 0.8 }}' for k in sample_keys
        ) + "\n}"

        prompt = f"""
You are a Fact-Checking & Sentiment Analysis AI.
Task: Rate the ACCURACY (0-100) and SENTIMENT (-1.0 to 1.0) of AI-generated responses based on the Official Reference Content.

BRAND: {brand_name}

OFFICIAL REFERENCE CONTENT:
{reference_content[:4000]}

ITEMS TO SCORE:
{items_text}

INSTRUCTIONS:
1. For EACH item, verify claims against the Reference Content.
2. Rate ACCURACY (0-100):
   - 100: Fully accurate/supported.
   - 50: Mixed/partial support.
   - 0: False/Hallucinated.
3. Rate SENTIMENT (-1.0 to 1.0):
   - 1.0: Extremely Positive.
   - 0.0: Neutral.
   - -1.0: Extremely Negative.

Return ONLY a JSON object where keys are exactly the "id" values from ITEMS TO SCORE:
{example_json}
"""
        logger.info("[ACCURACY] Calling batch accuracy for %d items (brand=%s)", len(items), brand_name)
        try:
            resp = await execute_task(
                task_name="module_e_accuracy_batch",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="openai",
                options={
                    "model": "gpt-4o-mini",
                    "temperature": 0.0,
                    "response_format": {"type": "json_object"},
                },
            )

            if not resp.success:
                logger.error("[ACCURACY] OpenAI call failed: %s", resp.error)
                return {}

            if not resp.data:
                logger.error("[ACCURACY] OpenAI returned no data")
                return {}

            raw = _safe_parse_json(resp.data)

            # If the LLM wrapped results under a single key (e.g. {"scores": {...}}),
            # unwrap it so we get the flat id->scores mapping.
            if raw and len(raw) == 1:
                only_val = next(iter(raw.values()))
                if isinstance(only_val, dict):
                    first_inner = next(iter(only_val.values()), None)
                    if isinstance(first_inner, dict):
                        raw = only_val  # unwrap one level

            result = {}
            for k, v in raw.items():
                if not isinstance(v, dict):
                    continue
                try:
                    acc = float(v.get("accuracy", 0.0))
                    sent = float(v.get("sentiment", 0.0))
                    result[str(k)] = {"accuracy": acc, "sentiment": sent}
                except (TypeError, ValueError):
                    continue

            logger.info("[ACCURACY] Batch accuracy result keys: %s", list(result.keys()))
            return result

        except Exception as e:
            logger.error("[ACCURACY] Batch accuracy/sentiment calculation failed: %s", e)
            return {}

    async def calculate_accuracy_score(self, reference_content: str, generated_response: str, brand_name: str) -> float:
        """
        Calculates the accuracy score (0-100) of a generated response against the reference content.
        Uses an LLM to verify facts and check for hallucinations.
        """
        if not reference_content or not generated_response:
            return 0.0

        prompt = f"""
You are a Fact-Checking AI. Your task is to rate the ACCURACY of an AI-generated response about a brand, based STRICTLY on the provided Official Reference Content.

BRAND: {brand_name}

OFFICIAL REFERENCE CONTENT:
{reference_content[:4000]}

AI-GENERATED RESPONSE:
{generated_response[:2000]}

INSTRUCTIONS:
1. Verify if the claims in the AI response are supported by the Reference Content.
2. Penalize for hallucinations (claims not found in or contradicted by reference).
3. Penalize for factual errors.
4. Rate the accuracy on a scale of 0 to 100.
   - 100: Fully accurate, supported by reference.
   - 50: Mixed accuracy, some unsupported claims.
   - 0: Completely false or unrelated.

Return ONLY a JSON object:
{{
  "score": <number 0-100>,
  "reasoning": "<short explanation>"
}}
"""
        try:
            resp = await execute_task(
                task_name="module_e_accuracy_check",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="openai",
                options={
                    "model": "gpt-4o-mini",
                    "temperature": 0.0,
                    "response_format": {"type": "json_object"},
                },
            )

            if resp.success and resp.data:
                data = _safe_parse_json(resp.data)
                return float(data.get("score", 0.0))
            
            return 0.0
        except Exception as e:
            logger.error(f"Accuracy calculation failed: {e}")
            return 0.0

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

    async def calculate_batch_accuracy_scores(self, reference_content: str, items: List[Dict[str, Any]], brand_name: str) -> Dict[str, Dict[str, float]]:
        """
        Calculates accuracy AND sentiment scores for multiple AI responses in a single LLM call.
        items: [{"id": int_index, "text": "generated response"}, ...]
        Returns: {"str(index)": {"accuracy": score, "sentiment": score}, ...}
        """
        if not items:
            logger.warning("[ACCURACY] No items to score")
            return {}

        # Check if reference content is available
        has_ref = bool(reference_content and len(reference_content.strip()) > 50)
        ref_text = reference_content[:4000] if has_ref else "REFERENCE CONTENT NOT AVAILABLE"

        # Use string IDs so the LLM key format is unambiguous
        items_payload = [{"id": str(i["id"]), "response": (i.get("text") or "")[:1000]} for i in items]
        items_text = json.dumps(items_payload, indent=2)

        # Build example keys from actual IDs so the LLM mirrors exact format
        sample_keys = [str(i["id"]) for i in items[:2]]
        example_json = "{\n" + ",\n".join(
            f'  "{k}": {{ "accuracy": 85, "sentiment": 0.8 }}' for k in sample_keys
        ) + "\n}"

        prompt = f"""
You are a Fact-Checking & Sentiment Analysis AI.
Task: Rate the ACCURACY (0-100) and SENTIMENT (-1.0 to 1.0) of AI-generated responses.

OFFICIAL REFERENCE CONTENT:
{ref_text}

BRAND NAME: {brand_name or "Unknown Brand"}

INSTRUCTIONS:
1. ACCURACY (0-100):
   {'- Compare the AI Response against the Reference Content.' if has_ref else '- Reference content is MISSING. Return 0 for accuracy.'}
   {'- 100 = Fully accurate, supported by reference.' if has_ref else ''}
   {'- 50 = Partially accurate or generic.' if has_ref else ''}
   {'- 0 = Hallucinated, false, or contradicts reference.' if has_ref else ''}

2. SENTIMENT (-1.0 to 1.0):
   - Analyze the sentiment towards the brand "{brand_name}".
   - 1.0 = Very Positive / Strong Endorsement.
   - 0.5 = Positive / Listed in Top Tools.
   - 0.0 = Neutral / Factual.
   - -1.0 = Negative / Critical.

ITEMS TO RATE:
{items_text}

Return ONLY a JSON object where keys are exactly the "id" values from ITEMS TO RATE:
{example_json}
"""
        logger.info("[ACCURACY] Calling batch accuracy for %d items (has_ref=%s brand=%s)",
                    len(items), has_ref, brand_name)

        resp = await execute_task(
            task_name="module_e_accuracy_batch",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("[ACCURACY] Batch accuracy call failed: %s", resp.error)
            return {}

        try:
            data = _safe_parse_json(resp.data)
            if not isinstance(data, dict):
                logger.warning("[ACCURACY] Response was not a dict: type=%s", type(data).__name__)
                return {}

            # Unwrap if LLM wrapped results under a single key (e.g. {"scores": {...}})
            if len(data) == 1:
                only_val = next(iter(data.values()))
                if isinstance(only_val, dict):
                    first_inner = next(iter(only_val.values()), None)
                    if isinstance(first_inner, dict):
                        data = only_val

            result = {}
            for k, v in data.items():
                if not isinstance(v, dict):
                    logger.warning("[ACCURACY] Skipping non-dict entry key=%s type=%s", k, type(v).__name__)
                    continue
                acc_raw = v.get("accuracy", 0.0)
                sent_raw = v.get("sentiment", 0.0)
                try:
                    result[str(k)] = {
                        "accuracy": float(acc_raw) if acc_raw is not None else 0.0,
                        "sentiment": float(sent_raw) if sent_raw is not None else 0.0,
                    }
                except (TypeError, ValueError) as e:
                    logger.warning("[ACCURACY] Could not parse scores for key=%s: %s", k, e)
                    continue

            logger.info("[ACCURACY] Batch accuracy complete: %d scored out of %d items, keys=%s",
                        len(result), len(items), list(result.keys()))
            return result

        except Exception as exc:
            logger.warning("[ACCURACY] Failed to parse batch accuracy results: %s", exc)
            return {}

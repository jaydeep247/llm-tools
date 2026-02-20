import json
import logging
import re
from typing import Dict, Any, List
from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_unified")


def _safe_parse_json(raw: str) -> Dict[str, Any]:
    """Safely extract and parse JSON from LLM response."""
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        # Extract JSON object from text
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except Exception:
                return {}
        return {}


def _normalize_entities(entities: List[str]) -> List[str]:
    """Normalize and dedupe entities."""
    cleaned: List[str] = []
    for ent in entities or []:
        if not isinstance(ent, str):
            continue
        val = ent.strip()
        if not val or len(val) < 2:
            continue
        if re.search(r"\b(website|company|service|services|business)\b", val, re.I):
            continue
        cleaned.append(val)
    
    # De-dupe while preserving order
    seen = set()
    result = []
    for item in cleaned:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


class UnifiedModuleEAnalyzer:
    """
    Single LLM call to generate all Module E metrics:
    - Content Mandate (topic, audience, tone, brand, location)
    - Consistency Score
    - Expected Entities
    - Observed Entities
    - Entity Coverage Score
    """

    async def analyze(self, aggregated_text: str, url: str = "") -> Dict[str, Any]:
        """
        Make ONE LLM call to get everything at once.
        """
        if not aggregated_text or len(aggregated_text.strip()) < 100:
            logger.warning("Insufficient content for Module E analysis")
            return self._default_result()

        prompt = f"""Analyze the website content and provide a comprehensive Module E assessment.
Return ONLY valid JSON (no markdown, no extra text):

{{
  "mandate": {{
    "topic": "specific primary topic/field",
    "audience": "target audience description",
    "tone": "brand voice/tone",
    "brand_name": "official brand name or empty",
    "location": "city/region/country or empty"
  }},
  "consistency_score": {{
    "score": 0-100,
    "reasoning": "brief explanation"
  }},
  "expected_entities": ["entity1", "entity2", "..."],
  "observed_entities": ["entity1", "entity2", "..."]
}}

RULES:
- Mandate: Extract the core content mandate from the site
- Consistency Score: How well does content align with the mandate (0-100)
- Expected Entities: Key products/services/brands a user expects this site to cover (8-20 items)
- Observed Entities: Notable entities actually found in the content (check all pages)
- Remove generic words: "website", "company", "service", "business"
- ALL arrays must be valid JSON arrays
- Score must be 0-100 integer

URL: {url}

CONTENT:
{aggregated_text[:15000]}"""

        logger.info(
            "Module E unified analysis request",
            extra={"url": url, "content_len": len(aggregated_text)}
        )

        resp = await execute_task(
            task_name="module_e_unified_analysis",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("Unified Module E LLM failed: %s", resp.error)
            return self._default_result()

        try:
            data = _safe_parse_json(resp.data)
            
            # Extract mandate
            mandate_raw = data.get("mandate", {})
            mandate = {
                "topic": (mandate_raw.get("topic") or "Unknown").strip(),
                "audience": (mandate_raw.get("audience") or "General").strip(),
                "tone": (mandate_raw.get("tone") or "Neutral").strip(),
                "brand_name": (mandate_raw.get("brand_name") or "").strip(),
                "location": (mandate_raw.get("location") or "").strip(),
            }

            # Extract consistency score
            consistency_score_raw = data.get("consistency_score", {})
            consistency_score = int(consistency_score_raw.get("score", 0))
            consistency_score = max(0, min(100, consistency_score))

            # Extract entities
            expected_entities_raw = data.get("expected_entities", [])
            observed_entities_raw = data.get("observed_entities", [])
            
            expected_entities = _normalize_entities(expected_entities_raw)
            observed_entities = _normalize_entities(observed_entities_raw)

            # Compute entity coverage score
            expected_set = {e.lower() for e in expected_entities if e}
            observed_set = {o.lower() for o in observed_entities if o}
            found = [e for e in expected_entities if e.lower() in observed_set]
            missing = [e for e in expected_entities if e.lower() not in observed_set]
            entity_score = int(round((len(found) / len(expected_set)) * 100)) if expected_set else 0

            logger.info(
                "Module E unified analysis response",
                extra={
                    "consistency_score": consistency_score,
                    "entity_score": entity_score,
                    "expected_count": len(expected_entities),
                    "observed_count": len(observed_entities),
                    "missing_count": len(missing),
                }
            )

            return {
                "content_consistency": {
                    "score": consistency_score,
                    "mandate": mandate,
                    "batch_scores": [consistency_score],
                },
                "entity_coverage": {
                    "score": entity_score,
                    "expected": expected_entities,
                    "observed": observed_entities,
                    "missing": missing,
                    "found": found,
                    "total_expected": len(expected_set),
                },
            }

        except Exception as exc:
            logger.warning("Failed to parse unified Module E response: %s", exc)
            return self._default_result()

    def _default_result(self) -> Dict[str, Any]:
        """Return 0-score defaults when analysis fails."""
        return {
            "content_consistency": {
                "score": 0,
                "mandate": {
                    "topic": "Unknown",
                    "audience": "General",
                    "tone": "Neutral",
                    "brand_name": "",
                    "location": "",
                },
                "batch_scores": [0],
            },
            "entity_coverage": {
                "score": 0,
                "expected": [],
                "observed": [],
                "missing": [],
                "found": [],
                "total_expected": 0,
            },
        }

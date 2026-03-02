import json
import logging
import re
from typing import Dict, Any, List
from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_entity_coverage")


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


class EntityCoverageModule:
    """
    Extracts expected entities from core content and compares with observed
    entities in broader content to compute coverage.
    """

    async def generate_expected_entities(self, context: str) -> List[str]:
        if not context or len(context.strip()) < 100:
            return []

        prompt = f"""
Extract the key entities a user expects this website to cover.
Return JSON only: {{"entities": ["..."]}}
Rules:
- Focus on products, services, brands, and core topics.
- No generic words (e.g. "website", "service", "company").

CONTENT:
{context[:5000]}
"""

        resp = await execute_task(
            task_name="module_e_expected_entities",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("Expected entities LLM failed: %s", resp.error)
            return []

        try:
            data = _safe_parse_json(resp.data)
            entities = data.get("entities", []) if isinstance(data, dict) else []
            normalized = self._normalize_entities(entities)
            return normalized
        except Exception as exc:
            logger.warning("Failed to parse expected entities: %s", exc)
            return []

    async def extract_observed_entities(self, content: str) -> List[str]:
        if not content or len(content.strip()) < 100:
            return []

        prompt = f"""
From the content below, extract notable entities (products, services, brands, topics).
Return JSON only: {{"entities": ["..."]}}

CONTENT:
{content[:8000]}
"""

        resp = await execute_task(
            task_name="module_e_observed_entities",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("Observed entities LLM failed: %s", resp.error)
            return []

        try:
            data = _safe_parse_json(resp.data)
            entities = data.get("entities", []) if isinstance(data, dict) else []
            normalized = self._normalize_entities(entities)
            return normalized
        except Exception as exc:
            logger.warning("Failed to parse observed entities: %s", exc)
            return []

    def compare(self, expected: List[str], observed: List[str]) -> Dict[str, Any]:
        expected_lower = [e.lower() for e in expected if e]
        observed_lower = [o.lower() for o in observed if o]

        def _entity_found(exp_l: str) -> bool:
            # 1. Exact set membership
            if exp_l in observed_lower:
                return True
            # 2. Substring match: expected inside any observed, or any observed inside expected
            for obs_l in observed_lower:
                if exp_l in obs_l or obs_l in exp_l:
                    return True
            # 3. Significant-word overlap (words ≥ 4 chars)
            exp_words = {w for w in re.findall(r'\b\w{4,}\b', exp_l)}
            if exp_words:
                for obs_l in observed_lower:
                    obs_words = set(re.findall(r'\b\w{4,}\b', obs_l))
                    if exp_words & obs_words:
                        return True
            return False

        found = [e for e, el in zip(expected, expected_lower) if _entity_found(el)]
        missing = [e for e, el in zip(expected, expected_lower) if not _entity_found(el)]

        total = len(expected_lower)
        score = int(round((len(found) / total) * 100)) if total else 0

        result = {
            "score": score,
            "expected": expected,
            "observed": observed,
            "missing": missing,
            "found": found,
            "total_expected": total,
        }
        return result

    def _normalize_entities(self, entities: List[str]) -> List[str]:
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

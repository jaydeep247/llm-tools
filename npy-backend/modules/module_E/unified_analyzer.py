import json
import logging
import re
from collections import Counter
from typing import Dict, Any, List, Tuple

from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_master")
logger.setLevel(logging.DEBUG)


# ============================================================
# Utility
# ============================================================

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
                return json.loads(raw[start:end + 1])
            except Exception:
                return {}
        return {}


def _normalize_entities(entities: List[str]) -> List[str]:
    cleaned = []
    for ent in entities or []:
        if not isinstance(ent, str):
            continue
        val = ent.strip()
        if len(val) < 2:
            continue
        if re.search(r"\b(website|company|service|services|business)\b", val, re.I):
            continue
        cleaned.append(val)

    seen = set()
    result = []
    for e in cleaned:
        key = e.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(e)
    return result


# ============================================================
# MASTER ANALYZER
# ============================================================

class UnifiedModuleEMasterAnalyzer:

    # ============================================================
    # ENTRY POINT (MULTI-MODEL SUPPORT)
    # ============================================================

    async def analyze_models(
        self,
        website_content: str,
        model_responses: List[Dict[str, str]],
        url: str = ""
    ) -> Dict[str, Any]:

        """
        model_responses format:
        [
            {"model": "gpt-4o", "response": "..."},
            {"model": "gemini-pro", "response": "..."}
        ]
        """

        if not website_content or len(website_content.strip()) < 300:
            logger.warning("Insufficient website content for mandate extraction", extra={
                "url": url,
                "content_length": len(website_content) if website_content else 0,
                "models_count": len(model_responses),
            })
            return {"models": []}

        if not model_responses:
            logger.warning("No model responses provided to analyze_models", extra={
                "url": url,
            })
            return {
                "mandate": self._default_mandate(),
                "expected_entities": [],
                "models": [],
            }

        logger.info("Starting Master Multi-Model Analysis", extra={
            "url": url,
            "models_count": len(model_responses)
        })

        # ============================================================
        # STEP 1 — Extract Mandate ONCE
        # ============================================================

        mandate, expected_entities = await self._extract_mandate_and_expected(
            website_content,
            url
        )

        logger.debug("Mandate extracted successfully", extra={
            "topic": mandate.get("topic"),
            "expected_entities_count": len(expected_entities)
        })

        results = []

        # ============================================================
        # STEP 2 — Evaluate Each Model Separately
        # ============================================================

        for idx, model_data in enumerate(model_responses):

            model_name = model_data.get("model")
            response_text = model_data.get("response")

            logger.info("Evaluating model response", extra={
                "index": idx,
                "model": model_name,
                "response_length": len(response_text or ""),
            })

            if not response_text or not response_text.strip():
                logger.warning("Model response empty — skipping", extra={
                    "model": model_name,
                    "response_length": len(response_text or ""),
                })
                continue

            try:

                observed_entities = self._extract_observed_entities(response_text)

                logger.debug("Observed entities extracted for model response", extra={
                    "model": model_name,
                    "observed_count": len(observed_entities),
                })

                entity_coverage = self._calculate_entity_coverage(
                    expected_entities,
                    observed_entities
                )

                content_consistency = self._calculate_content_consistency(
                    response_text,
                    mandate
                )

                evaluation = await self._evaluate_generated_response(
                    response_text,
                    mandate
                )

                accuracy_score = evaluation.get("accuracy", 0)
                completeness_score = evaluation.get("completeness", 0)

                # ============================================================
                # PERFORMANCE SCORE CALCULATION
                # ============================================================

                performance_score = int(
                    (accuracy_score * 0.4) +
                    (content_consistency["score"] * 0.2) +
                    (entity_coverage["score"] * 0.2) +
                    (completeness_score * 0.2)
                )

                logger.debug("Model scoring breakdown", extra={
                    "model": model_name,
                    "accuracy": accuracy_score,
                    "consistency": content_consistency["score"],
                    "entity_coverage": entity_coverage["score"],
                    "completeness": completeness_score,
                    "performance_score": performance_score
                })

                results.append({
                    "model": model_name,
                    "accuracy_of_generated_response": accuracy_score,
                    "content_consistency": content_consistency,
                    "entity_coverage": entity_coverage,
                    "completeness_score": completeness_score,
                    "model_wise_performance_score": performance_score
                })

            except Exception as e:
                logger.exception(f"Error evaluating model {model_name}: {str(e)}")
                results.append({
                    "model": model_name,
                    "accuracy_of_generated_response": 0,
                    "content_consistency": {
                        "score": 0,
                        "mandate": mandate,
                    },
                    "entity_coverage": {
                        "score": 0,
                        "expected": expected_entities,
                        "observed": [],
                        "found": [],
                        "missing": [],
                        "total_expected": len(expected_entities),
                    },
                    "completeness_score": 0,
                    "model_wise_performance_score": 0,
                })
                continue

        logger.info("Master analysis completed successfully")

        return {
            "mandate": mandate,
            "expected_entities": expected_entities,
            "models": results
        }


# ============================================================
# UNIFIED ANALYZER (WEBSITE CONSISTENCY + COVERAGE)
# ============================================================

class UnifiedModuleEAnalyzer(UnifiedModuleEMasterAnalyzer):

    async def analyze(self, aggregated_text: str, url: str = "") -> Dict[str, Any]:

        if not aggregated_text or len(aggregated_text.strip()) < 300:
            logger.warning("Module E advanced analysis skipped due to insufficient content", extra={
                "url": url,
                "content_length": len(aggregated_text) if aggregated_text else 0,
            })
            return {
                "content_consistency": {
                    "score": 0,
                    "mandate": self._default_mandate(),
                },
                "entity_coverage": {
                    "score": 0,
                    "expected": [],
                    "observed": [],
                    "found": [],
                    "missing": [],
                    "total_expected": 0,
                },
            }

        logger.info("Module E advanced analysis started", extra={
            "url": url,
            "content_length": len(aggregated_text),
        })

        mandate, expected_entities = await self._extract_mandate_and_expected(
            aggregated_text,
            url,
        )

        logger.debug("Mandate extracted for website analysis", extra={
            "topic": mandate.get("topic"),
            "expected_entities_count": len(expected_entities),
        })

        observed_entities = self._extract_observed_entities(aggregated_text)

        logger.debug("Observed entities extracted for website analysis", extra={
            "observed_count": len(observed_entities),
        })

        entity_coverage = self._calculate_entity_coverage(
            expected_entities,
            observed_entities,
        )

        content_consistency = self._calculate_content_consistency(
            aggregated_text,
            mandate,
        )

        logger.info("Module E advanced analysis completed", extra={
            "url": url,
            "consistency_score": content_consistency.get("score"),
            "entity_score": entity_coverage.get("score"),
            "expected_count": len(entity_coverage.get("expected", [])),
            "observed_count": len(entity_coverage.get("observed", [])),
            "found_count": len(entity_coverage.get("found", [])),
            "missing_count": len(entity_coverage.get("missing", [])),
            "mandate_topic": mandate.get("topic"),
            "has_brand_name": bool(mandate.get("brand_name")),
        })

        return {
            "content_consistency": content_consistency,
            "entity_coverage": entity_coverage,
        }


     # ============================================================
    # NEW: GENERATE FROM CHATGPT + GEMINI
    # ============================================================

    async def _generate_from_models(self, prompt: str) -> List[Dict[str, str]]:

        logger.info("Starting multi-model generation", extra={
            "prompt_length": len(prompt or "")
        })

        responses = []

        gpt_resp = await execute_task(
            task_name="module_e_generate_gpt",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.3,
            },
        )

        if gpt_resp.success:
            responses.append({
                "model": "gpt-4o-mini",
                "response": gpt_resp.data
            })
            logger.info("GPT generation succeeded", extra={
                "model": "gpt-4o-mini"
            })
        else:
            logger.warning("GPT generation failed", extra={
                "error": getattr(gpt_resp, "error", None)
            })

        gemini_resp = await execute_task(
            task_name="module_e_generate_gemini",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="gemini",
            options={
                "model": "gemini-2.0-flash",
                "temperature": 0.3,
            },
        )

        if gemini_resp.success:
            responses.append({
                "model": "gemini-2.0-flash",
                "response": gemini_resp.data
            })
            logger.info("Gemini generation succeeded", extra={
                "model": "gemini-2.0-flash",
                "response_length": len(gemini_resp.data or "")
            })
        else:
            logger.warning(
                "Gemini generation failed: %s",
                getattr(gemini_resp, "error", None),
                extra={"error": getattr(gemini_resp, "error", None)}
            )

        logger.info("Multi-model generation completed", extra={
            "total_responses": len(responses)
        })

        return responses

    # ============================================================
    # LLM EXTRACTION
    # ============================================================

    async def _extract_mandate_and_expected(
        self,
        text: str,
        url: str
    ) -> Tuple[Dict[str, str], List[str]]:

        prompt = f"""
Extract website mandate and expected entities.

Return JSON:
{{
  "mandate": {{
    "topic": "...",
    "audience": "...",
    "tone": "...",
    "brand_name": "...",
    "location": "..."
  }},
  "expected_entities": ["entity1","entity2"]
}}

CONTENT:
{text[:12000]}
"""

        resp = await execute_task(
            task_name="module_e_master_extraction",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0.1,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("Mandate extraction failed")
            return self._default_mandate(), []

        data = _safe_parse_json(resp.data)

        mandate_raw = data.get("mandate", {})

        mandate = {
            "topic": (mandate_raw.get("topic") or "Unknown").strip(),
            "audience": (mandate_raw.get("audience") or "General").strip(),
            "tone": (mandate_raw.get("tone") or "Neutral").strip(),
            "brand_name": (mandate_raw.get("brand_name") or "").strip(),
            "location": (mandate_raw.get("location") or "").strip(),
        }

        expected = _normalize_entities(data.get("expected_entities", []))

        return mandate, expected

    # ============================================================
    # LLM AS JUDGE
    # ============================================================

    async def _evaluate_generated_response(
        self,
        text: str,
        mandate: Dict[str, str]
    ) -> Dict[str, int]:

        prompt = f"""
Evaluate this AI-generated response strictly.

MANDATE:
Topic: {mandate.get("topic")}
Audience: {mandate.get("audience")}

CONTENT:
{text[:6000]}

Return JSON:
{{
  "accuracy": 0-100,
  "completeness": 0-100,
  "relevance": 0-100,
  "clarity": 0-100
}}
Be strict.
"""

        resp = await execute_task(
            task_name="module_e_master_evaluation",
            input_data={"messages": [{"role": "user", "content": prompt}]},
            provider="openai",
            options={
                "model": "gpt-4o-mini",
                "temperature": 0,
                "response_format": {"type": "json_object"},
            },
        )

        if not resp.success:
            logger.warning("Evaluation LLM failed")
            return {"accuracy": 0, "completeness": 0}

        data = _safe_parse_json(resp.data)

        return {
            "accuracy": int(data.get("accuracy", 0)),
            "completeness": int(data.get("completeness", 0)),
        }

    # ============================================================
    # YOUR EXISTING LOGIC BELOW (UNCHANGED)
    # ============================================================

    def _extract_observed_entities(self, text: str) -> List[str]:
        words = re.findall(r'\b[a-zA-Z][a-zA-Z\-]+\b', text)
        bigrams = zip(words, words[1:])
        trigrams = zip(words, words[1:], words[2:])

        phrases = []

        for w1, w2 in bigrams:
            if w1[0].isupper() or w2[0].isupper():
                phrases.append(f"{w1} {w2}")

        for w1, w2, w3 in trigrams:
            if w1[0].isupper() or w2[0].isupper():
                phrases.append(f"{w1} {w2} {w3}")

        freq = Counter(phrases)
        candidates = [k for k, v in freq.items() if v >= 2]

        return _normalize_entities(candidates)

    def _calculate_entity_coverage(self, expected, observed):
        found = []
        missing = []

        observed_lower = [o.lower() for o in observed]

        for exp in expected:
            exp_lower = exp.lower()
            match = any(exp_lower in obs or obs in exp_lower for obs in observed_lower)
            if match:
                found.append(exp)
            else:
                missing.append(exp)

        score = int(round((len(found) / len(expected)) * 100)) if expected else 0

        return {
            "score": score,
            "expected": expected,
            "observed": observed,
            "found": found,
            "missing": missing,
            "total_expected": len(expected)
        }

    def _calculate_content_consistency(self, text, mandate):
        text_lower = text.lower()
        words = text_lower.split()
        total_words = len(words)

        topic_keywords = mandate["topic"].lower().split()
        audience_keywords = mandate["audience"].lower().split()
        brand = mandate["brand_name"].lower()

        topic_hits = sum(words.count(k) for k in topic_keywords if len(k) > 3)
        audience_hits = sum(words.count(k) for k in audience_keywords if len(k) > 3)
        brand_hits = words.count(brand) if brand else 0

        topic_density = topic_hits / max(total_words, 1)
        audience_density = audience_hits / max(total_words, 1)
        brand_density = brand_hits / max(total_words, 1)

        score = (
            min(topic_density * 4000, 50) +
            min(audience_density * 3000, 30) +
            min(brand_density * 5000, 20)
        )

        return {
            "score": int(min(score, 100)),
            "topic_density": round(topic_density, 4),
            "audience_density": round(audience_density, 4),
            "brand_density": round(brand_density, 4),
            "mandate": mandate
        }

    def _default_mandate(self):
        return {
            "topic": "Unknown",
            "audience": "General",
            "tone": "Neutral",
            "brand_name": "",
            "location": ""
        }

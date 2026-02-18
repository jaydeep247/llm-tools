"""
AI Sentiment & Visibility Tracking for Module E
Tracks brand sentiment using 5 probe questions + visibility via 6 discovery questions
Queries OpenAI, Gemini, Claude — BATCHED (1 API call per model per phase = 7 total calls)
"""
import logging
import json
import re
from typing import Dict, List, Any, Optional
from datetime import datetime
from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_sentiment")


class SentimentVisibilityTracker:
    """
    Tracks AI sentiment and visibility for brands.

    Sentiment: 5 probe questions explicitly mentioning the brand (batched per model)
    Visibility: 6 discovery questions WITHOUT mentioning brand (batched per model)

    Total API calls: 1 (industry) + 3 (sentiment) + 3 (visibility) = 7
    """

    # 5 Sentiment Probes (brand mentioned explicitly)
    SENTIMENT_PROBES = [
        "What is the general reputation of {brand_name} in its industry?",
        "What are the main strengths and weaknesses of {brand_name}?",
        "Is {brand_name} considered trustworthy and reliable? Why or why not?",
        "How do customers or users generally feel about {brand_name}?",
        "Would you recommend {brand_name} to others? Explain briefly.",
    ]

    # 6 Generic Industry Discovery Questions (brand NOT mentioned)
    VISIBILITY_DISCOVERY_QUESTIONS = [
        "What are the leading companies in {industry}?",
        "Which {industry} companies would you recommend for {service_type}?",
        "Who are the top innovators in the {industry} sector?",
        "What companies come to mind when you think of {industry}?",
        "Which {industry} providers have the best reputation?",
        "If someone asked for {industry} recommendations, who would you suggest?",
    ]

    @staticmethod
    def _build_sentiment_batch_prompt(brand_name: str) -> str:
        """
        Build a single batched prompt that asks all 5 sentiment questions at once.
        Returns a JSON array with one entry per question.
        """
        questions_block = "\n".join(
            f"{i}. {q.format(brand_name=brand_name)}"
            for i, q in enumerate(SentimentVisibilityTracker.SENTIMENT_PROBES, 1)
        )
        return f"""You are an objective AI analyst evaluating brand perception.

Analyze the brand "{brand_name}" by answering each of the following 5 questions thoughtfully and honestly.

QUESTIONS:
{questions_block}

SCORING GUIDE (apply to each answer):
- 0–30 = Negative (critical, unfavorable, concerning)
- 31–69 = Neutral (balanced, factual, mixed or unknown)
- 70–100 = Positive (favorable, praising, recommending)

Return ONLY a valid JSON array with exactly 5 objects, one per question, in order:
[
  {{
    "question_index": 1,
    "response_text": "your detailed answer",
    "sentiment_score": 75,
    "sentiment_label": "Positive"
  }},
  ...
]

No extra text, no markdown, just the JSON array."""

    @staticmethod
    def _build_visibility_batch_prompt(brand_name: str, industry: str, service_type: str) -> str:
        """
        Build a single batched prompt for all 6 visibility discovery questions.
        Brand is NOT mentioned in the questions — we check if AI recommends it organically.
        """
        questions_block = "\n".join(
            f"{i}. {q.format(industry=industry, service_type=service_type)}"
            for i, q in enumerate(SentimentVisibilityTracker.VISIBILITY_DISCOVERY_QUESTIONS, 1)
        )
        return f"""You are a knowledgeable industry advisor. Answer each question with specific company names and brief reasoning. Be comprehensive and mention real, well-known companies.

QUESTIONS:
{questions_block}

Return ONLY a valid JSON array with exactly 6 objects, one per question, in order:
[
  {{
    "question_index": 1,
    "answer": "your detailed answer mentioning specific companies"
  }},
  ...
]

No extra text, no markdown, just the JSON array."""

    @staticmethod
    def _extract_json_array(raw: str) -> list:
        """Robustly extract a JSON array from a response that may have markdown fences."""
        if not raw:
            return []
        # Strip markdown code fences
        raw = raw.strip()
        raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
        raw = re.sub(r'```\s*$', '', raw, flags=re.MULTILINE)
        raw = raw.strip()
        # Try direct parse
        try:
            result = json.loads(raw)
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass
        # Try extracting array with regex
        match = re.search(r'\[.*\]', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass
        return []

    @staticmethod
    async def analyze_sentiment_and_visibility(
        brand_name: str,
        industry: Optional[str] = None,
        service_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Run complete sentiment & visibility analysis for a brand.
        Total API calls: 7 (1 industry + 3 sentiment + 3 visibility)
        """
        print("\n" + "=" * 100)
        print("🔍 STARTING AI SENTIMENT & VISIBILITY TRACKING")
        print("=" * 100)
        print(f"📌 Brand: {brand_name}")
        print(f"📌 Industry: {industry or 'Auto-detecting...'}")
        print(f"📌 Service Type: {service_type or 'Auto-detecting...'}")
        print("=" * 100 + "\n")

        # Auto-infer industry and service type if not provided
        if not industry or not service_type:
            inferred = await SentimentVisibilityTracker._infer_industry_and_service(brand_name)
            industry = industry or inferred.get("industry", "technology")
            service_type = service_type or inferred.get("service_type", "software solutions")

            print("\n" + "=" * 100)
            print("🧠 AUTO-INFERRED BRAND CONTEXT")
            print("=" * 100)
            print(f"📍 Industry: {industry}")
            print(f"📍 Service Type: {service_type}")
            print("=" * 100 + "\n")

        # Phase 1: Sentiment (3 batched calls — 1 per model)
        print("\n" + "=" * 100)
        print("💭 PHASE 1: SENTIMENT ANALYSIS (5 Questions × 3 Models — 1 call per model)")
        print("=" * 100)
        sentiment_results = await SentimentVisibilityTracker._run_sentiment_probes(brand_name)

        # Phase 2: Visibility (3 batched calls — 1 per model)
        print("\n" + "=" * 100)
        print("👁️  PHASE 2: VISIBILITY ANALYSIS (6 Questions × 3 Models — 1 call per model)")
        print("=" * 100)
        visibility_results = await SentimentVisibilityTracker._run_visibility_checks(
            brand_name, industry, service_type
        )

        # Aggregate
        sentiment_data = SentimentVisibilityTracker._aggregate_sentiment(sentiment_results)
        visibility_data = SentimentVisibilityTracker._aggregate_visibility(brand_name, visibility_results)

        result = {
            "brand_name": brand_name,
            "industry": industry,
            "service_type": service_type,
            "sentiment": sentiment_data,
            "visibility": visibility_data,
            "timestamp": datetime.utcnow().isoformat()
        }

        print("\n" + "=" * 100)
        print("✅ SENTIMENT & VISIBILITY ANALYSIS COMPLETE")
        print("=" * 100)
        print(f"📊 Overall Sentiment Score: {sentiment_data['overall_score']}/100")
        print(f"📊 Overall Visibility Score: {visibility_data['overall_visibility_score']}%")
        print(f"📊 Sentiment Distribution: {sentiment_data['distribution']}")
        print(f"📊 Brand Appearance Rate: {visibility_data.get('overall_appearance_rate', 0):.1%}")
        print("=" * 100 + "\n")

        return result

    @staticmethod
    async def _infer_industry_and_service(brand_name: str) -> Dict[str, str]:
        """Use AI to infer brand's industry and service type (1 API call)."""
        prompt = f"""Analyze the brand "{brand_name}" and infer:
1. Industry category (e.g., "software development", "digital marketing", "e-commerce")
2. Primary service type (e.g., "mobile app development", "SEO services", "cloud solutions")

Return ONLY valid JSON (no markdown):
{{"industry": "industry name", "service_type": "service description"}}"""

        try:
            response = await execute_task(
                task_name="module_e_industry_inference",
                input_data={"prompt": prompt},
                provider="openai",
                options={"temperature": 0.2, "response_format": {"type": "json_object"}}
            )

            if not response.success or not response.data:
                raise ValueError(response.error or "Empty response")

            raw = response.data
            data = json.loads(raw) if isinstance(raw, str) else raw
            return {
                "industry": data.get("industry", "technology"),
                "service_type": data.get("service_type", "software solutions")
            }
        except Exception as e:
            logger.warning(f"Industry inference failed: {e}")
            return {"industry": "technology", "service_type": "software solutions"}

    @staticmethod
    async def _run_sentiment_probes(brand_name: str) -> List[Dict]:
        """
        Ask all 5 sentiment questions to each model in a SINGLE batched call.
        3 API calls total (one per model).
        """
        results = []
        prompt = SentimentVisibilityTracker._build_sentiment_batch_prompt(brand_name)

        for model_idx, model in enumerate(["openai", "gemini", "claude"], 1):
            print(f"\n{'─' * 100}")
            print(f"🤖 MODEL {model_idx}/3: {model.upper()} — Batched 5-question sentiment call")
            print(f"{'─' * 100}")

            opts = {"temperature": 0.3}
            if model == "openai":
                opts["response_format"] = {"type": "json_object"}

            try:
                response = await execute_task(
                    task_name=f"module_e_sentiment_batch_{model}",
                    input_data={"prompt": prompt},
                    provider=model,
                    options=opts
                )

                if not response.success or not response.data:
                    raise ValueError(response.error or "Empty response")

                items = SentimentVisibilityTracker._extract_json_array(response.data)

                model_responses = []
                distribution = {"Positive": 0, "Neutral": 0, "Negative": 0}
                scores = []

                for item in items:
                    score = int(item.get("sentiment_score", 50))
                    label = item.get("sentiment_label", "Neutral")
                    answer = item.get("response_text", "")
                    q_idx = item.get("question_index", len(model_responses) + 1)
                    question = SentimentVisibilityTracker.SENTIMENT_PROBES[q_idx - 1].format(brand_name=brand_name) if q_idx <= 5 else ""

                    scores.append(score)
                    distribution[label] = distribution.get(label, 0) + 1

                    print(f"  Q{q_idx}: Score={score}/100 | Label={label}")
                    print(f"       {answer[:120]}{'...' if len(answer) > 120 else ''}")

                    model_responses.append({
                        "question": question,
                        "answer": answer,
                        "score": score,
                        "label": label
                    })

                model_avg = int(sum(scores) / len(scores)) if scores else 50
                print(f"\n  📊 {model.upper()} Average: {model_avg}/100 | Distribution: {distribution}")

                results.append({
                    "model": model,
                    "average_score": model_avg,
                    "distribution": distribution,
                    "details": model_responses
                })

            except Exception as e:
                logger.error(f"Sentiment batch failed for {model}: {e}")
                print(f"  ❌ Error: {e}")
                # Skip this model — don't inject fake neutral scores into the average
                continue

        return results

    @staticmethod
    async def _run_visibility_checks(brand_name: str, industry: str, service_type: str) -> List[Dict]:
        """
        Run all 6 discovery questions per model in a SINGLE batched call.
        3 API calls total (one per model).
        """
        results = []
        prompt = SentimentVisibilityTracker._build_visibility_batch_prompt(brand_name, industry, service_type)

        visibility_questions = [
            q.format(industry=industry, service_type=service_type)
            for q in SentimentVisibilityTracker.VISIBILITY_DISCOVERY_QUESTIONS
        ]

        print(f"\n{'─' * 100}")
        print(f"📋 VISIBILITY DISCOVERY QUESTIONS (Brand NOT in prompts)")
        print(f"{'─' * 100}")
        for i, q in enumerate(visibility_questions, 1):
            print(f"  {i}. {q}")
        print(f"{'─' * 100}\n")

        for model_idx, model in enumerate(["openai", "gemini", "claude"], 1):
            print(f"\n{'─' * 100}")
            print(f"🤖 MODEL {model_idx}/3: {model.upper()} — Batched 6-question visibility call")
            print(f"{'─' * 100}")

            try:
                response = await execute_task(
                    task_name=f"module_e_visibility_batch_{model}",
                    input_data={"prompt": prompt},
                    provider=model,
                    options={"temperature": 0.4}
                )

                if not response.success or not response.data:
                    raise ValueError(response.error or "Empty response")

                items = SentimentVisibilityTracker._extract_json_array(response.data)

                model_answers = []
                mentions = 0

                for item in items:
                    q_idx = item.get("question_index", len(model_answers) + 1)
                    answer_text = item.get("answer", "")
                    question = visibility_questions[q_idx - 1] if q_idx <= len(visibility_questions) else ""

                    brand_mentioned = brand_name.lower() in answer_text.lower()
                    mention_position = answer_text.lower().find(brand_name.lower())

                    if brand_mentioned:
                        mentions += 1
                        print(f"  Q{q_idx}: ✅ BRAND MENTIONED at pos {mention_position}")
                        print(f"       ...{answer_text[max(0, mention_position-30):mention_position+80]}...")
                    else:
                        print(f"  Q{q_idx}: ❌ Not mentioned")

                    model_answers.append({
                        "question": question,
                        "answer": answer_text,
                        "brand_mentioned": brand_mentioned,
                        "mention_position": mention_position if brand_mentioned else -1
                    })

                total = len(model_answers)
                rate = mentions / total if total > 0 else 0
                print(f"\n  📊 {model.upper()} Visibility: {mentions}/{total} mentions ({rate:.1%})")

                results.append({
                    "model": model,
                    "answers": model_answers
                })

            except Exception as e:
                logger.error(f"Visibility batch failed for {model}: {e}")
                print(f"  ❌ Error: {e}")
                # Skip this model — don't count it as 0 mentions in the average
                continue

        return results

    @staticmethod
    def _aggregate_sentiment(results: List[Dict]) -> Dict:
        """Aggregate sentiment across all models."""
        print("\n" + "=" * 100)
        print("📊 AGGREGATING SENTIMENT RESULTS")
        print("=" * 100)

        all_scores = [r["average_score"] for r in results if r.get("average_score") is not None]
        total_dist = {"Positive": 0, "Neutral": 0, "Negative": 0}

        for r in results:
            for label, count in r["distribution"].items():
                total_dist[label] = total_dist.get(label, 0) + count

        overall_score = int(sum(all_scores) / len(all_scores)) if all_scores else 0

        print(f"  Model Scores: {[r['average_score'] for r in results]}")
        print(f"  Overall Score: {overall_score}/100")
        print(f"  Total Distribution: {total_dist}")
        print("=" * 100 + "\n")

        return {
            "overall_score": overall_score,
            "distribution": total_dist,
            "by_model": {
                r["model"]: {
                    "score": r["average_score"],
                    "distribution": r["distribution"]
                } for r in results
            }
        }

    @staticmethod
    def _aggregate_visibility(brand_name: str, results: List[Dict]) -> Dict:
        """Calculate visibility score based on brand mentions in discovery answers."""
        print("\n" + "=" * 100)
        print("📊 AGGREGATING VISIBILITY RESULTS")
        print("=" * 100)

        model_scores = {}

        for result in results:
            model = result["model"]
            appearances = 0
            position_weights = []

            for answer_data in result["answers"]:
                if not answer_data.get("brand_mentioned"):
                    continue

                appearances += 1
                pos = answer_data.get("mention_position", -1)

                # Position weight (earlier mention = stronger recommendation)
                if pos <= 50:
                    weight = 1.0
                elif pos <= 200:
                    weight = 0.8
                elif pos <= 400:
                    weight = 0.5
                else:
                    weight = 0.2

                position_weights.append(weight)

            total_questions = len(result["answers"])
            appearance_rate = appearances / total_questions if total_questions > 0 else 0
            avg_weight = sum(position_weights) / len(position_weights) if position_weights else 0
            visibility_score = int(appearance_rate * avg_weight * 100)

            print(f"  {model.upper()}: {appearances}/{total_questions} mentions | Rate: {appearance_rate:.1%} | Score: {visibility_score}%")

            model_scores[model] = {
                "visibility_score": visibility_score,
                "appearance_rate": appearance_rate,
                "appearances": appearances,
                "total_prompts": total_questions,
                "avg_position_weight": avg_weight
            }

        all_scores = [m["visibility_score"] for m in model_scores.values()]
        overall_visibility = int(sum(all_scores) / len(all_scores)) if all_scores else 0

        all_rates = [m["appearance_rate"] for m in model_scores.values()]
        overall_rate = sum(all_rates) / len(all_rates) if all_rates else 0

        print(f"\n  Overall Visibility Score: {overall_visibility}%")
        print(f"  Overall Appearance Rate: {overall_rate:.1%}")
        print("=" * 100 + "\n")

        return {
            "overall_visibility_score": overall_visibility,
            "overall_appearance_rate": overall_rate,
            "by_model": model_scores
        }

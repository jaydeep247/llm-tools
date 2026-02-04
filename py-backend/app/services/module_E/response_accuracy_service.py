"""
Response Accuracy Service (Module E)
Scores how accurately AI-generated responses (citing this website) reflect the source content.
Uses ChatGPT, Claude, Gemini only (no Perplexity).
"""

import json
import logging
import os
import re
from typing import Dict, List, Any

import openai

logger = logging.getLogger(__name__)

# Fixed prompts for accuracy evaluation (2 prompts to keep cost/latency manageable)
DEFAULT_PROMPTS = [
    "What are the main products or services offered?",
    "What makes this company or website stand out?",
]


def _score_with_judge(source_content: str, response: str, model: str) -> int:
    """
    Use an LLM judge to rate 0-100 how accurately the response reflects the source.
    """
    if not response or "Simulation failed" in response or "not found" in response.lower():
        return 0

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return 0

    judge_prompt = f"""You are an accuracy judge for AEO (Answer Engine Optimization).
Compare the AI-generated RESPONSE below against the SOURCE CONTENT.
Rate 0-100: How accurately does the response reflect the source without distortion or hallucination?
- 100: Perfect match, no errors
- 50: Partially accurate, some omissions or minor distortions
- 0: Major hallucinations or contradicts the source

Return ONLY a JSON object: {{ "accuracy": <0-100> }}
No markdown, no explanation.

SOURCE CONTENT (excerpt):
{source_content[:3000]}

AI RESPONSE:
{response[:1500]}
"""

    try:
        client = openai.OpenAI(api_key=api_key)
        resp = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": judge_prompt}],
            max_tokens=50,
            temperature=0,
        )
        text = resp.choices[0].message.content.strip()
        match = re.search(r'["\']?accuracy["\']?\s*:\s*(\d+)', text)
        if match:
            return min(100, max(0, int(match.group(1))))
        try:
            data = json.loads(text)
            return min(100, max(0, int(data.get("accuracy", 0))))
        except json.JSONDecodeError:
            return 0
    except Exception as e:
        logger.warning(f"[accuracy] Judge failed for {model}: {e}")
        return 0


class ResponseAccuracyService:
    """Calculates accuracy of AI-generated responses against source content."""

    @staticmethod
    def calculate_accuracy(content: str, prompts: List[str] = None) -> Dict[str, Any]:
        """
        For each prompt, simulate answers from ChatGPT/Claude/Gemini, then judge accuracy.
        Returns per-model and overall scores (0-100).
        """
        from ..module_C.multi_ai_service import MultiAIService

        prompts = prompts or DEFAULT_PROMPTS
        prompts = prompts[:3]  # Max 3 prompts for cost control

        multi_ai = MultiAIService()
        scores_by_model: Dict[str, List[int]] = {"chatgpt": [], "claude": [], "gemini": []}
        max_context = 5000
        context_snippet = content[:max_context] + ("..." if len(content) > max_context else "")

        for query in prompts:
            sim = multi_ai.generate_simulated_answer(content, query)

            for key, model_name in [
                ("openai_answer", "chatgpt"),
                ("claude_answer", "claude"),
                ("gemini_answer", "gemini"),
            ]:
                ans = sim.get(key)
                if ans:
                    score = _score_with_judge(context_snippet, ans, model_name)
                    scores_by_model[model_name].append(score)

        result: Dict[str, Any] = {}
        all_scores: List[int] = []
        for model_name, scores in scores_by_model.items():
            avg = round(sum(scores) / len(scores)) if scores else 0
            result[model_name] = avg
            all_scores.extend(scores)

        result["overall"] = round(sum(all_scores) / len(all_scores)) if all_scores else 0
        return result

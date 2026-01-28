"""
Sentiment Tracking Service (Module E)
Analyzes AI sentiment towards a brand using multi-model probing.
"""

import logging
import json
import asyncio
from typing import Dict, List, Any
from ..module_C.multi_ai_service import MultiAIService

# Configure logging
logger = logging.getLogger(__name__)

class SentimentTrackingService:
    """
    Service to track AI sentiment using 5 specific probe questions across 3 models.
    """
    
    def __init__(self):
        self.multi_ai = MultiAIService()
        
        # The 5 Fixed Probe Questions
        self.PROBE_QUESTIONS = [
            "What is the general reputation of {brand_name} in its industry?",
            "What are the main strengths and weaknesses of {brand_name}?",
            "Is {brand_name} considered trustworthy and reliable? Why or why not?",
            "How do customers or users generally feel about {brand_name}?",
            "Would you recommend {brand_name} to others? Explain briefly."
        ]
        
        # Instruction appended to every prompt
        self.SCORING_INSTRUCTION = (
            "\n\nIMPORTANT: After answering, analyze your own sentiment. "
            "Rate the sentiment of your response on a scale of 0 to 100 "
            "(0=Negative, 50=Neutral, 100=Positive). "
            "Also provide a label: 'Positive', 'Neutral', or 'Negative'. "
            "Return ONLY a JSON object with this format (no markdown, no extra text): "
            "{\"response_text\": \"your answer here\", \"sentiment_score\": 85, \"sentiment_label\": \"Positive\"}"
        )

    async def analyze_sentiment(self, brand_name: str) -> Dict[str, Any]:
        """
        Run sentiment analysis for a brand across all configured models.
        """
        logger.info(f"Starting sentiment tracking for brand: {brand_name}")
        
        # We will run this for each model: OpenAI, Gemini, Claude
        # Since MultiAIService doesn't expose a clean "ask single question" method for all models generically,
        # we will implement specific methods here leveraging the clients key've already initialized.
        
        tasks = []
        
        if self.multi_ai.openai_client:
            tasks.append(self._audit_model(brand_name, "openai"))
            
        if self.multi_ai.gemini_client:
            tasks.append(self._audit_model(brand_name, "gemini"))
            
        if self.multi_ai.claude_client:
            tasks.append(self._audit_model(brand_name, "claude"))
            
        results_list = await asyncio.gather(*tasks)
        
        # Aggregate results
        aggregated_results = {
            "brand_name": brand_name,
            "overall_score": 0,
            "distribution": {"Positive": 0, "Neutral": 0, "Negative": 0},
            "models": {},
            # Visibility metrics derived from the same probes/answers
            "visibility": {
                "overall_visibility_score": 0,
                "models": {}
            }
        }
        
        valid_model_scores = []
        visibility_scores: List[int] = []
        
        for result in results_list:
            if not result:
                continue
                
            model_name = result["model"]
            aggregated_results["models"][model_name] = result

            # --- Compute visibility metrics for this model based on its answers ---
            visibility_for_model = self._compute_visibility_for_model(
                brand_name=brand_name,
                model_result=result
            )
            aggregated_results["visibility"]["models"][model_name] = visibility_for_model
            
            # Add to global distribution
            for label, count in result["distribution"].items():
                aggregated_results["distribution"][label] += count
            
            # Add to proper score list
            if result["average_score"] > 0:
                valid_model_scores.append(result["average_score"])
            if visibility_for_model["visibility_score"] > 0:
                visibility_scores.append(visibility_for_model["visibility_score"])

        # Global Average
        if valid_model_scores:
            aggregated_results["overall_score"] = int(sum(valid_model_scores) / len(valid_model_scores))

        if visibility_scores:
            aggregated_results["visibility"]["overall_visibility_score"] = int(
                sum(visibility_scores) / len(visibility_scores)
            )
            
        return aggregated_results

    def _compute_visibility_for_model(self, brand_name: str, model_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compute visibility metrics for a single model using its detailed answers.

        Heuristic:
        - appearance_rate: fraction of probe answers where the brand name appears
        - position_weight: earlier mentions are better (1.0 for very early, down to 0.2 for very late)
        - visibility_score: appearance_rate * avg_position_weight scaled to 0–100
        """
        details: List[Dict[str, Any]] = model_result.get("details") or []
        total_prompts = len(details) or 1

        brand_lower = brand_name.lower()

        appearance_count = 0
        position_weights: List[float] = []

        for item in details:
            answer = (item.get("answer") or "")
            answer_lower = str(answer).lower()

            idx = answer_lower.find(brand_lower)
            if idx == -1:
                continue

            appearance_count += 1

            # Simple heuristic for prominence based on character index
            if idx <= 50:
                weight = 1.0
            elif idx <= 200:
                weight = 0.8
            elif idx <= 400:
                weight = 0.5
            else:
                weight = 0.2

            position_weights.append(weight)

        appearance_rate = appearance_count / total_prompts
        avg_position_weight = sum(position_weights) / len(position_weights) if position_weights else 0.0

        raw_visibility = appearance_rate * avg_position_weight
        visibility_score = int(max(0.0, min(raw_visibility * 100.0, 100.0)))

        return {
            "appearance_rate": appearance_rate,
            "avg_position_weight": avg_position_weight,
            "visibility_score": visibility_score,
            "total_prompts": total_prompts,
            "appearances": appearance_count,
        }

    async def _audit_model(self, brand_name: str, model_name: str) -> Dict[str, Any]:
        """
        Ask all 5 questions to a specific model and aggregate its score.
        """
        responses = []
        scores = []
        labels = {"Positive": 0, "Neutral": 0, "Negative": 0}
        
        logger.info(f"Auditing model: {model_name} for {brand_name}")
        
        for i, question_template in enumerate(self.PROBE_QUESTIONS):
            question = question_template.format(brand_name=brand_name)
            prompt = question + self.SCORING_INSTRUCTION
            
            try:
                # Call model-specific logic
                if model_name == "openai":
                    data = await self._call_openai(prompt)
                elif model_name == "gemini":
                    data = await self._call_gemini(prompt)
                elif model_name == "claude":
                    data = await self._call_claude(prompt)
                else:
                    data = None

                if data:
                    responses.append({
                        "question": question,
                        "answer": data.get("response_text", ""),
                        "score": data.get("sentiment_score", 0),
                        "label": data.get("sentiment_label", "Neutral")
                    })
                    scores.append(data.get("sentiment_score", 0))
                    label = data.get("sentiment_label", "Neutral")
                    labels[label] = labels.get(label, 0) + 1
                    
            except Exception as e:
                logger.error(f"Error querying {model_name} (Q{i+1}): {e}")
        
        if not scores:
            return None
            
        return {
            "model": model_name,
            "average_score": int(sum(scores) / len(scores)),
            "distribution": labels,
            "details": responses
        }

    async def _call_openai(self, prompt: str) -> Dict:
        # Wrap sync call in executor if needed, but for simplicity/speed let's just call direct or sync
        # Since MultiAIService inits clients, we use them.
        try:
            client = self.multi_ai.openai_client
            completion = client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.3
            )
            return json.loads(completion.choices[0].message.content)
        except Exception as e:
            logger.error(f"OpenAI Call Failed: {e}")
            return None

    async def _call_gemini(self, prompt: str) -> Dict:
        try:
            model = self.multi_ai.gemini_client
            # Gemini async not standard in simple SDK usage, running sync block
            # In production, use run_in_executor for CPU blocking calls
            response = model.generate_content(prompt)
            # Clean JSON
            text = response.text
            start = text.find('{')
            end = text.rfind('}') + 1
            if start != -1 and end != -1:
                 return json.loads(text[start:end])
            return None
        except Exception as e:
            logger.error(f"Gemini Call Failed: {e}")
            return None

    async def _call_claude(self, prompt: str) -> Dict:
        try:
            client = self.multi_ai.claude_client
            message = client.messages.create(
                model="claude-3-sonnet-20240229", # Valid model name
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}]
            )
            text = message.content[0].text
            start = text.find('{')
            end = text.rfind('}') + 1
            if start != -1 and end != -1:
                 return json.loads(text[start:end])
            return None
        except Exception as e:
            logger.error(f"Claude Call Failed: {e}")
            return None

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
            "models": {}
        }
        
        valid_model_scores = []
        
        for result in results_list:
            if not result:
                continue
                
            model_name = result["model"]
            aggregated_results["models"][model_name] = result
            
            # Add to global distribution
            for label, count in result["distribution"].items():
                aggregated_results["distribution"][label] += count
            
            # Add to proper score list
            if result["average_score"] > 0:
                valid_model_scores.append(result["average_score"])

        # Global Average
        if valid_model_scores:
            aggregated_results["overall_score"] = int(sum(valid_model_scores) / len(valid_model_scores))
            
        return aggregated_results

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

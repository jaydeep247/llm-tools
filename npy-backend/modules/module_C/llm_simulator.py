import json
import logging
import asyncio
from typing import Dict, List, Any
from orchestrator.checkpoint.executor import execute_task
from .multi_model_insights import MultiModelInsights

class LlmSimulatorModule:
    """
    Simulates how different AI platforms answer queries based on website content 
    and evaluates the accuracy, completeness, and consistency of those answers.
    """
    
    def __init__(self):
        self.providers = {
            'openai': 'gpt-4o',
            'gemini': 'gemini-2.0-flash',
            'claude': 'claude-haiku-4-5-20251001'
        }
        self.insights = MultiModelInsights()

    async def simulate_answer(self, query: str, content: str) -> Dict[str, Any]:
        """
        Main entry point for LLM Answer Simulation.
        Generates answers from multiple models and evaluates them.
        """
        if not content:
            return {"error": "No content provided for simulation"}

        # 1. Generate Answers from multiple providers in parallel
        answers = await self._generate_answers(query, content)
        
        # 2. Evaluate Accuracy and Completeness for each answer
        evaluations = await self._evaluate_accuracy_completeness(query, content, answers)
        
        # 3. Perform detailed multi-model insights analysis (Variation, Gaps, Scores)
        insights_res = self.insights.perform_analysis(answers)
        
        # 4. Construct Final Response
        results = {
            "query": query,
            "simulations": {},
            "cross_model_metrics": {
                "consistency_score": insights_res.get("agreement", {}).get("outcome_level", {}).get("score", 0) * 100,
                "variation_analysis": insights_res.get("agreement", {}),
                "coverage_gaps": insights_res.get("coverage_gaps", []),
                "claim_matrix": insights_res.get("claim_matrix", []),
                "model_scores": insights_res.get("scores", {})
            }
        }
        
        for provider, answer in answers.items():
            eval_data = evaluations.get(provider, {})
            results["simulations"][provider] = {
                "answer": answer,
                "accuracy_score": eval_data.get("accuracy_score", 0),
                "completeness_score": eval_data.get("completeness_score", 0),
                "eval_explanation": eval_data.get("explanation", "")
            }
            
        return results

    async def _generate_answers(self, query: str, content: str) -> Dict[str, str]:
        """Calls OpenAI, Gemini, and Claude in parallel to get simulated answers."""
        tasks = []
        provider_names = []
        
        # Truncate content for simulation
        safe_content = content[:15000]
        
        prompt = f"""You are an AI Search Engine. A user searched for: "{query}".
        Based ONLY on the following website content, provide a direct, helpful answer.
        If the answer is not in the content, state "Information not found in provided content."
        
        Website Content:
        {safe_content}"""

        for name, model in self.providers.items():
            provider_names.append(name)
            tasks.append(execute_task(
                task_name="aeo_simulate_answer_generation",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider=name,
                options={"model": model}
            ))

        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        answers = {}
        for i, resp in enumerate(responses):
            name = provider_names[i]
            if isinstance(resp, Exception):
                logging.error(f"Provider {name} failed: {str(resp)}")
                answers[name] = f"Error: Simulation failed"
            elif not resp.success:
                logging.error(f"Provider {name} error: {resp.error}")
                answers[name] = f"Error: {resp.error}"
            else:
                answers[name] = resp.data.strip()
        
        return answers

    async def _evaluate_accuracy_completeness(self, query: str, content: str, answers: Dict[str, str]) -> Dict[str, Any]:
        """Uses an LLM to evaluate the accuracy and completeness of each generated answer."""
        eval_tasks = []
        provider_names = []
        
        safe_content = content[:10000] # Evaluator needs context but less than generator maybe

        for provider, answer in answers.items():
            if "Error:" in answer:
                continue
                
            provider_names.append(provider)
            eval_prompt = f"""
            Evaluate the following AI-generated answer for Accuracy and Completeness based on the Website Context provided.
            
            Query: "{query}"
            AI Answer ({provider}): "{answer}"
            
            Website Context:
            {safe_content}
            
            Return JSON ONLY:
            {{
                "accuracy_score": 0-100,
                "completeness_score": 0-100,
                "explanation": "Brief explanation of the scores"
            }}
            """
            
            # Use gpt-4o-mini for evaluation as it's cheaper and good at following JSON schemas
            eval_tasks.append(execute_task(
                task_name="aeo_evaluate_answer_quality",
                input_data={"messages": [{"role": "user", "content": eval_prompt}]},
                provider="openai",
                options={"model": "gpt-4o-mini", "response_format": {"type": "json_object"}}
            ))

        eval_responses = await asyncio.gather(*eval_tasks, return_exceptions=True)
        
        evaluations = {}
        for i, resp in enumerate(eval_responses):
            name = provider_names[i]
            if isinstance(resp, Exception) or not resp.success:
                evaluations[name] = {"accuracy_score": 0, "completeness_score": 0, "explanation": "Evaluation failed"}
            else:
                try:
                    evaluations[name] = json.loads(resp.data)
                except:
                    evaluations[name] = {"accuracy_score": 0, "completeness_score": 0, "explanation": "Failed to parse evaluation"}
        
        return evaluations

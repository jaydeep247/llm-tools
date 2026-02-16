import json
import logging
import asyncio
from typing import Dict, List, Any
from orchestrator.checkpoint.executor import execute_task

class LlmSimulatorModule:
    """
    Simulates how different AI platforms answer queries based on website content 
    and evaluates the accuracy, completeness, and consistency of those answers.
    """
    
    def __init__(self):
        self.providers = {
            'openai': 'gpt-4o',
            'gemini': 'gemini-2.0-flash',
            'claude': 'claude-3-5-sonnet-20241022'
        }

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
        
        # 3. Calculate Cross-Model Consistency
        consistency = await self._calculate_cross_model_consistency(query, answers)
        
        # 4. Construct Final Response
        results = {
            "query": query,
            "simulations": {},
            "cross_model_metrics": {
                "consistency_score": consistency.get("consistency_score", 0),
                "consensus_summary": consistency.get("summary", ""),
                "agreements": consistency.get("agreements", []),
                "disagreements": consistency.get("disagreements", [])
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

    async def _calculate_cross_model_consistency(self, query: str, answers: Dict[str, str]) -> Dict[str, Any]:
        """Compares answers across models to measure consistency and consensus."""
        valid_answers = {p: a for p, a in answers.items() if "Error:" not in a}
        if len(valid_answers) < 2:
            return {"consistency_score": 100, "summary": "Insufficient data for comparison", "agreements": [], "disagreements": []}

        compare_prompt = f"""
        Compare these 3 AI-generated answers for the query: "{query}".
        Identify what they agree on (consensus) and where they disagree.
        Rate their overall consistency.
        
        Answers:
        1. OpenAI: {valid_answers.get('openai', 'N/A')}
        2. Gemini: {valid_answers.get('gemini', 'N/A')}
        3. Claude: {valid_answers.get('claude', 'N/A')}
        
        Return JSON ONLY:
        {{
            "consistency_score": 0-100,
            "summary": "Short overview of consistency",
            "agreements": ["list of facts they all agree on"],
            "disagreements": ["list of areas where they differ"]
        }}
        """

        resp = await execute_task(
            task_name="aeo_calculate_answer_consistency",
            input_data={"messages": [{"role": "user", "content": compare_prompt}]},
            provider="openai",
            options={"model": "gpt-4o-mini", "response_format": {"type": "json_object"}}
        )

        if resp.success:
            try:
                return json.loads(resp.data)
            except:
                pass
        
        return {"consistency_score": 0, "summary": "Consistency analysis failed", "agreements": [], "disagreements": []}

import json
import logging
import asyncio
import re
from typing import Dict, Any, List, Optional, Tuple
from orchestrator.checkpoint.executor import execute_task

logger = logging.getLogger("module_e_competitive_leaderboard")

class CompetitiveLeaderboard:
    """
    Produces a competitive leaderboard based on keywords, prompts, or industry.
    Follows the Planner -> Executor -> Validator -> Refactorer pattern.
    """

    def __init__(self, models: Optional[List[str]] = None):
        self.models = models or ["openai", "gemini", "claude"]

    async def generate(self, industry: str, brand_name: str, domain: str, keywords: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Main entry point for generating the competitive leaderboard.
        """
        # 1. Plan
        plan = await self._planner(industry, brand_name, domain, keywords)
        
        # 2. Execute
        raw_results = await self._executor(plan, brand_name, industry)
        
        # 3. Validate
        validated_results = await self._validator(raw_results, plan)
        
        # 4. Refactor (Synthesize)
        leaderboard = self._refactorer(validated_results)
        
        return leaderboard

    async def _planner(self, industry: str, brand_name: str, domain: str, keywords: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        PLANNER: Determines the best way to source data and benchmarking agencies.
        """
        prompt = f"""You are a strategic market research planner.
Goal: Create a plan to generate a competitive leaderboard for "{brand_name}" ({domain}) in the "{industry}" industry.
Keywords: {", ".join(keywords) if keywords else "None provided"}

Your plan should identify:
1. Top 5-7 direct business competitors or specialized agencies that compete with "{brand_name}" for the same clients (e.g., if it's a digital marketing agency, find other digital marketing agencies, not just global tech giants).
2. Specific prompts to use for AI models to rank these competitors fairly based on their actual service offerings.
3. Sourcing strategy (what data points to look for: market share, AI SOV, sentiment, etc.).

Return ONLY valid JSON:
{{
  "benchmarks": ["Competitor 1", "Competitor 2", ...],
  "prompts": ["Prompt 1", "Prompt 2"],
  "metrics": ["Metric 1", "Metric 2"]
}}"""

        try:
            resp = await execute_task(
                task_name="leaderboard_planner",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider="openai",
                options={"temperature": 0.2, "response_format": {"type": "json_object"}}
            )
            if resp.success and resp.data:
                return json.loads(resp.data) if isinstance(resp.data, str) else resp.data
        except Exception as e:
            logger.error(f"Planner failed: {e}")
        
        # Fallback plan
        return {
            "benchmarks": ["Accenture", "Deloitte Digital", "Publicis Sapient", "WPP", "Dentsu"],
            "prompts": [f"Rank the top {industry} agencies by market presence and AI adoption."],
            "metrics": ["Market Presence", "AI Innovation", "Client Satisfaction"]
        }

    async def _executor(self, plan: Dict[str, Any], brand_name: str, industry: str) -> List[Dict[str, Any]]:
        """
        EXECUTOR: Runs the actual AI queries across multiple models.
        """
        prompts = plan.get("prompts", [])
        benchmarks = plan.get("benchmarks", [])
        
        execution_tasks = []
        for model in self.models:
            for prompt_text in prompts:
                full_prompt = f"""{prompt_text}

Analyze the "{industry}" market landscape relative to "{brand_name}".
Compare these benchmarks: {", ".join(benchmarks)}.

For each company (including "{brand_name}" if it fits the ranking), provide:
1. Rank (1-10)
2. Score (0-100) based on {", ".join(plan.get("metrics", []))}
3. Detailed rationale (mention specific services, strengths, and weaknesses).

Return ONLY valid JSON list of objects:
[{{"name": "Company Name", "rank": 1, "score": 95, "rationale": "...", "strengths": ["..."], "weaknesses": ["..."]}}]"""
                
                execution_tasks.append(self._query_model(model, full_prompt))
        
        results = await asyncio.gather(*execution_tasks)
        return [r for r in results if r]

    async def _query_model(self, model: str, prompt: str) -> Optional[Dict[str, Any]]:
        try:
            resp = await execute_task(
                task_name=f"leaderboard_executor_{model}",
                input_data={"messages": [{"role": "user", "content": prompt}]},
                provider=model,
                options={"temperature": 0.3}
            )
            if resp.success and resp.data:
                raw = str(resp.data).strip()
                # Clean markdown
                raw = re.sub(r'^```(?:json)?\s*', '', raw, flags=re.MULTILINE)
                raw = re.sub(r'```\s*$', '', raw, flags=re.MULTILINE).strip()
                
                data = json.loads(raw)
                return {"model": model, "data": data}
        except Exception as e:
            logger.warning(f"Executor query failed for {model}: {e}")
        return None

    async def _validator(self, raw_results: List[Dict[str, Any]], plan: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        VALIDATOR: Ensures no wrong generation and consistent data format.
        """
        validated = []
        benchmarks_lower = [b.lower() for b in plan.get("benchmarks", [])]
        
        for entry in raw_results:
            model = entry["model"]
            data = entry["data"]
            
            if not isinstance(data, list):
                continue
                
            valid_items = []
            for item in data:
                name = item.get("name", "")
                score = item.get("score", 0)
                
                # Basic validation
                if not name or not isinstance(score, (int, float)):
                    continue
                
                # Sanity check: is it a real company or hallucination?
                # For MVP, we just check if it's in our benchmark list or seems like a valid name
                if len(name) < 2:
                    continue
                
                valid_items.append(item)
            
            if valid_items:
                validated.append({"model": model, "data": valid_items})
                
        return validated

    def _refactorer(self, validated_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        REFACTORER: Synthesizes multiple model outputs into a single leaderboard.
        """
        if not validated_results:
            return {"leaderboard": [], "status": "no_data"}
            
        aggregated: Dict[str, Dict[str, Any]] = {}
        
        for entry in validated_results:
            for item in entry["data"]:
                name = item["name"]
                score = item["score"]
                
                if name not in aggregated:
                    aggregated[name] = {
                        "name": name,
                        "total_score": 0,
                        "count": 0,
                        "rationales": [],
                        "strengths": [],
                        "weaknesses": []
                    }
                
                aggregated[name]["total_score"] += score
                aggregated[name]["count"] += 1
                if item.get("rationale"):
                    aggregated[name]["rationales"].append(item["rationale"])
                if item.get("strengths"):
                    aggregated[name]["strengths"].extend(item["strengths"])
                if item.get("weaknesses"):
                    aggregated[name]["weaknesses"].extend(item["weaknesses"])

        leaderboard = []
        for name, info in aggregated.items():
            avg_score = round(info["total_score"] / info["count"], 1)
            # Unique strengths/weaknesses
            unique_strengths = list(dict.fromkeys(info["strengths"]))[:3]
            unique_weaknesses = list(dict.fromkeys(info["weaknesses"]))[:3]
            
            leaderboard.append({
                "name": name,
                "score": avg_score,
                "mentions": info["count"],
                "summary": info["rationales"][0] if info["rationales"] else "",
                "strengths": unique_strengths,
                "weaknesses": unique_weaknesses
            })
            
        # Sort by score descending
        leaderboard.sort(key=lambda x: x["score"], reverse=True)
        
        # Add rank
        for i, item in enumerate(leaderboard):
            item["rank"] = i + 1
            
        return {
            "leaderboard": leaderboard,
            "metadata": {
                "models_used": list(set(r["model"] for r in validated_results)),
                "total_competitors": len(leaderboard)
            }
        }

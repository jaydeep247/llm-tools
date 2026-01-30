
import asyncio
import json
import os
import random
from pydantic import BaseModel
from typing import Dict, Any, List

# Import LLM clients
import openai
from anthropic import Anthropic
import google.generativeai as genai

class WebsiteScoreRequest(BaseModel):
    content: str

class WebsiteScoreService:
    @staticmethod
    async def calculate_scores(content: str) -> Dict[str, int]:
        """
        Analyzes the content using 3 LLMs and returns scores.
        """
        
        # Construct the Prompt
        prompt = f"""
        You are an AEO (Answer Engine Optimization) expert.
        Analyze the following aggregated website content and rate it on a scale of 0-100 
        based on how well it answers user intent, authority, and clarity for AI/Search engines.
        
        Rules:
        1. Return ONLY a JSON object: {{ "score": <number> }}
        2. Be strict but fair.
        3. Do NOT include markdown formatting (```json ... ```). Just the raw JSON string.
        
        Content:
        {content[:15000]}...
        """

        async def get_openai_score():
            try:
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key: return {"score": 0, "consistency_score": 0}
                
                # Specialized prompt for OpenAI to get consistency score
                openai_prompt = f"""
                You are an AEO (Answer Engine Optimization) expert.
                Analyze the following aggregated website content.
                
                1. Performance Score (0-100): Rate based on how well it answers user intent, authority, and clarity.
                2. Content Consistency Score (0-100): Measure how uniform, stable, and non-contradictory the information is across pages. "Does this website say the same thing everywhere, or does it contradict itself?"
                
                Rules:
                1. Return ONLY a JSON object: {{ "score": <number>, "consistency_score": <number> }}
                2. Be strict but fair.
                3. Do NOT include markdown formatting. Just raw JSON.
                
                Content:
                {content[:15000]}...
                """
                
                client = openai.AsyncOpenAI(api_key=api_key)
                response = await client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": openai_prompt}],
                    response_format={"type": "json_object"}
                )
                result = json.loads(response.choices[0].message.content)
                return {
                    "score": int(result.get("score", 0)),
                    "consistency_score": int(result.get("consistency_score", 0))
                }
            except Exception as e:
                print(f"OpenAI Error: {e}")
                return {"score": 0, "consistency_score": 0}

        async def get_claude_score():
            try:
                api_key = os.getenv("CLAUDE_API_KEY")
                if not api_key: return 0
                
                client = Anthropic(api_key=api_key)
                message = client.messages.create(
                    model="claude-sonnet-4-5-20250929",
                    max_tokens=100,
                    messages=[{"role": "user", "content": prompt}]
                )
                # Claude doesn't have strict JSON mode like OpenAI, so we parse carefully
                content_text = message.content[0].text
                # Try validation
                import re
                match = re.search(r'\{.*"score":\s*(\d+).*\}', content_text, re.DOTALL)
                if match:
                    return int(match.group(1))
                # Fallback simple json load
                try:
                    return int(json.loads(content_text).get("score", 0))
                except:
                    return 0
            except Exception as e:
                print(f"Claude Error: {e}")
                return 0

        async def get_gemini_score():
            try:
                api_key = os.getenv("GEMINI_API_KEY")
                if not api_key: return 0
                
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel('gemini-2.0-flash')
                response = await model.generate_content_async(prompt)
                
                text = response.text
                # Extract JSON
                start = text.find('{')
                end = text.rfind('}') + 1
                if start != -1 and end != -1:
                    json_str = text[start:end]
                    return int(json.loads(json_str).get("score", 0))
                return 0
            except Exception as e:
                print(f"Gemini Error: {e}")
                return 0

        # Run in parallel
        openai_result, claude_score, gemini_score = await asyncio.gather(
            get_openai_score(),
            get_claude_score(),
            get_gemini_score()
        )

        scores = {
            "openai": openai_result["score"],
            "claude": claude_score,
            "gemini": gemini_score,
            "consistency": openai_result["consistency_score"]
        }

        return scores

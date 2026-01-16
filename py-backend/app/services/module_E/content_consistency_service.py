import os
import json
import openai
from typing import List, Dict, Any, Optional

class ContentConsistencyService:
    @staticmethod
    async def generate_canonical_topic(context: str) -> Dict[str, str]:
        """
        Analyzes context to define a strict 'Content Mandate' (Topic + Audience + Tone).
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key: return {"topic": "Unknown", "audience": "General", "tone": "Neutral", "brand_name": ""}

        print(f"\n[DEBUG] 🎯 Generating Canonical Content Mandate...")
        
        prompt = f"""
        Analyze the following homepage/core content.
        Construct a 'Content Mandate' that defines what this website is strictly about.

        1. **Topic**: The specific field or service (e.g., "Enterprise Cloud Security", not just "Technology").
        2. **Target Audience**: Who is this written for? (e.g., "CTOs and IT Managers", "Teenage Gamers").
        3. **Brand Voice/Tone**: The style of writing (e.g., "Professional & Authoritative", "Playful & Casual").
        4. **Brand Name**: The official name.

        STRICT OUTPUT FORMAT (JSON ONLY):
        {{
            "topic": "...",
            "audience": "...",
            "tone": "...",
            "brand_name": "..."
        }}

        CONTENT:
        {context[:5000]}
        """

        try:
            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3, 
                response_format={"type": "json_object"}
            )
            
            data = json.loads(response.choices[0].message.content)
            
            result = {
                "topic": data.get("topic", "Unknown"),
                "audience": data.get("audience", "General"),
                "tone": data.get("tone", "Neutral"),
                "brand_name": data.get("brand_name", "")
            }
            
            print(f"[DEBUG] 📌 Mandate: {result}")
            return result
        except Exception as e:
            print(f"❌ [ERROR] generate_canonical_topic failed: {e}")
            return {"topic": "Unknown", "audience": "General", "tone": "Neutral", "brand_name": ""}

    @staticmethod
    async def calculate_batch_consistency(topic: str, audience: str, tone: str, batch_content: str) -> int:
        """
        Strictly scores content against the defined Mandate (Topic + Audience + Tone).
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key: return 0
        
        if not batch_content.strip():
            return 0

        print(f"\n[DEBUG] 📉 Scoring Batch (Strict Mode)...")
        
        prompt = f"""
        Act as a strict **Content Auditor**. 
        Rate how well the provided content batch adheres to the following **Content Mandate**.

        === MANDATE ===
        1. **Topic**: {topic}
        2. **Target Audience**: {audience}
        3. **Required Tone**: {tone}

        === MARKING SCHEME ===
        * **90-100 (Exceptional)**: Perfect alignment. Deep insight. Matches audience/tone exactly. Zero fluff.
        * **70-89 (Good)**: Mostly aligned, but contains some generic statements or slight tone shift.
        * **50-69 (Average)**: Relevent but generic. Could apply to any competitor. Too much "marketing fluff" (e.g., "We are innovative").
        * **30-49 (Poor)**: Distracting tangents, wrong audience level (e.g., explaining basics to experts), or pure sales pitch sans substance.
        * **0-29 (Fail)**: Irrelevant, broken text, or completely wrong topic.

        === CONTENT BATCH ===
        {batch_content[:4000]}
        
        === TASK ===
        Return ONLY a single integer (0-100). Do not write anything else.
        """

        try:
            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "system", "content": "You are a harsh critic. Do not give 100% easily."}, {"role": "user", "content": prompt}],
                temperature=0.1, 
            )
            
            content = response.choices[0].message.content.strip()
            cleaned = ''.join(filter(str.isdigit, content))
            
            if not cleaned: return 0
            return max(0, min(100, int(cleaned)))

        except Exception as e:
            print(f"❌ [ERROR] calculate_batch_consistency failed: {e}")
            return 0

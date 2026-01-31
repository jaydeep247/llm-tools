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

        print(f"\n[CONTENT CONSISTENCY] generate_canonical_topic: contextLen={len(context)}, contextPreview={repr((context or '')[:200])}...", flush=True)

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
            
            raw_content = response.choices[0].message.content
            print(f"[CONTENT CONSISTENCY] generate_canonical_topic: raw LLM response len={len(raw_content)}, preview={repr(raw_content[:300])}", flush=True)
            data = json.loads(raw_content)

            result = {
                "topic": data.get("topic", "Unknown"),
                "audience": data.get("audience", "General"),
                "tone": data.get("tone", "Neutral"),
                "brand_name": data.get("brand_name", "")
            }

            print(f"[CONTENT CONSISTENCY] generate_canonical_topic: parsed result={result}", flush=True)
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

        print(f"[CONTENT CONSISTENCY] calculate_batch_consistency: topic={topic!r}, audience={audience!r}, tone={tone!r}, batch_contentLen={len(batch_content)}, preview={repr(batch_content[:150])}...", flush=True)

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
            * **50-69 (Average)**: Relevant but generic. Could apply to any competitor. Too much "marketing fluff" (e.g., "We are innovative").
        * **30-49 (Poor)**: Distracting tangents, wrong audience level (e.g., explaining basics to experts), or pure sales pitch sans substance.
        * **0-29 (Fail)**: Irrelevant, broken text, or completely wrong topic.

        === CONTENT BATCH ===
        {batch_content[:4000]}
        
        === TASK ===
        Use the full 0-100 scale. Different sites deserve different scores (e.g. 72 vs 78 vs 85). Return ONLY a single integer (0-100). No other text.
        """

        try:
            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "system", "content": "You are a harsh critic. Use the full score range; avoid defaulting to the same number."}, {"role": "user", "content": prompt}],
                temperature=0.3,
            )
            
            content = response.choices[0].message.content.strip()
            cleaned = ''.join(filter(str.isdigit, content))
            score = max(0, min(100, int(cleaned))) if cleaned else 0
            print(f"[CONTENT CONSISTENCY] calculate_batch_consistency: raw LLM content={repr(content[:200])}, cleaned digits={repr(cleaned)}, parsed score={score}", flush=True)
            if not cleaned:
                return 0
            return score

        except Exception as e:
            print(f"❌ [ERROR] calculate_batch_consistency failed: {e}")
            return 0

    @staticmethod
    async def generate_ranking_prompts(topic: str, audience: str, brand_name: str) -> List[str]:
        """
        Generate 5 natural search prompts users would type when looking for this business.
        Used for AI Citation Ranking when prompts are not provided.
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            # Fallback to simple templates
            prompts = [f"best {topic} companies", f"top {topic} services"]
            if brand_name:
                prompts.append(f"{brand_name} reviews")
            return prompts[:5]

        prompt_text = f"""
        Given this website's profile:
        - Topic/Field: {topic}
        - Target Audience: {audience}
        - Brand Name: {brand_name or '(not provided)'}

        Generate exactly 5 short, natural search prompts that real users would type into ChatGPT, Perplexity, or Google when looking for this type of business or service.
        Prompts should NOT include the brand name (we want discovery-style queries).
        Examples: "best IT companies in Surat", "top CRM software for startups", "how to choose project management tools".
        Return ONLY a JSON object: {{ "prompts": ["prompt1", "prompt2", "prompt3", "prompt4", "prompt5"] }}
        """

        try:
            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt_text}],
                temperature=0.5,
                response_format={"type": "json_object"},
            )
            data = json.loads(response.choices[0].message.content)
            prompts = data.get("prompts", [])
            return [str(p).strip()[:200] for p in prompts if p][:5]
        except Exception as e:
            print(f"❌ [ERROR] generate_ranking_prompts failed: {e}", flush=True)
            prompts = [f"best {topic} companies", f"top {topic} services"]
            if brand_name:
                prompts.append(f"{brand_name} reviews")
            return prompts[:5]

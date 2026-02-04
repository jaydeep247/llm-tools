import os
import json
import re
import openai
import google.generativeai as genai
from typing import List, Dict, Optional
from urllib.parse import urlparse

def _infer_topic_from_domain(url: str) -> str:
    """Infer topic from domain name when LLM extraction fails."""
    try:
        parsed = urlparse(url if "://" in url else f"https://{url}")
        domain = (parsed.netloc or parsed.path or "").lower()
        stem = domain.replace("www.", "").split(".")[0]
        if not stem or len(stem) < 3:
            return ""
        industry_hints = {
            "yogreet": "Real Estate AI Chatbots",
            "attrock": "IT Services",
            "tech": "Technology",
            "realestate": "Real Estate",
            "property": "Property",
            "health": "Healthcare",
            "med": "Medical",
            "edu": "Education",
            "shop": "E-commerce",
            "store": "E-commerce",
        }
        for key, topic in industry_hints.items():
            if key in stem:
                return topic
        return stem.replace("-", " ").title() if stem else ""
    except Exception:
        return ""

def _infer_location_from_context(context: str) -> str:
    """Extract location hints from content (city, country, region)."""
    if not context or len(context) < 50:
        return ""
    location_patterns = [
        r"\b(in|from|based in|headquartered in|located in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
        r"\b(UAE|USA|UK|India|Spain|France|Singapore|Australia)\b",
        r"\b(Surat|Mumbai|Dubai|London|New York|Bangalore|Ahmedabad)\b",
    ]
    for pat in location_patterns:
        m = re.search(pat, context, re.IGNORECASE)
        if m:
            return m.group(2) if m.lastindex >= 2 else m.group(1)
    return ""


def _extract_json_from_text(text: str) -> Optional[dict]:
    """Extract JSON object from LLM response (handles markdown/code fences)."""
    if not text or not text.strip():
        return None
    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return None


class ContentConsistencyService:
    @staticmethod
    async def generate_canonical_topic(
        context: str, url: str = "", use_gemini: bool = False
    ) -> Dict[str, str]:
        """
        Analyzes context to define a strict 'Content Mandate' (Topic + Audience + Tone + Location).
        Uses fallbacks when content is short or LLM fails.
        use_gemini: When True, use Gemini for AI Citation prompt generation; otherwise OpenAI.
        """
        result = {"topic": "Unknown", "audience": "General", "tone": "Neutral", "brand_name": "", "location": ""}

        print(f"\n[CONTENT CONSISTENCY] generate_canonical_topic: contextLen={len(context or '')}, url={url[:80] if url else 'none'}, use_gemini={use_gemini}", flush=True)

        if not context or len(context.strip()) < 100:
            print("[CONTENT CONSISTENCY] context too short, using fallbacks", flush=True)
            result["topic"] = _infer_topic_from_domain(url) or "Business Services"
            result["location"] = ""
            return result

        prompt = f"""
        Analyze the following homepage/core content.
        Construct a 'Content Mandate' that defines what this website is strictly about.

        1. **Topic**: The specific field or service (e.g., "Enterprise Cloud Security", "Real Estate AI Chatbots", not just "Technology").
        2. **Target Audience**: Who is this written for? (e.g., "CTOs and IT Managers", "Property managers", "Real estate agents").
        3. **Brand Voice/Tone**: The style of writing (e.g., "Professional & Authoritative", "Playful & Casual").
        4. **Brand Name**: The official name.
        5. **Location** (optional): City, region, or country if the business targets a specific geography (e.g., "Surat", "UAE", "Spain"). Leave empty if not applicable.

        STRICT OUTPUT FORMAT (JSON ONLY, no other text):
        {{
            "topic": "...",
            "audience": "...",
            "tone": "...",
            "brand_name": "...",
            "location": "..."
        }}

        CONTENT:
        {context[:5000]}
        """

        try:
            if use_gemini:
                api_key = os.getenv("GEMINI_API_KEY")
                if not api_key:
                    print("[CONTENT CONSISTENCY] generate_canonical_topic: GEMINI_API_KEY missing, using fallbacks", flush=True)
                    result["topic"] = _infer_topic_from_domain(url) or "Business Services"
                    result["location"] = _infer_location_from_context(context) if context else ""
                    return result
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel("gemini-2.0-flash")
                response = await model.generate_content_async(prompt)
                raw_content = response.text if response else ""
            else:
                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    result["topic"] = _infer_topic_from_domain(url) or "Business Services"
                    result["location"] = ""
                    return result
                client = openai.AsyncOpenAI(api_key=api_key)
                response = await client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    response_format={"type": "json_object"},
                )
                raw_content = response.choices[0].message.content or ""

            print(f"[CONTENT CONSISTENCY] generate_canonical_topic: raw len={len(raw_content)}, preview={repr(raw_content[:200])}", flush=True)
            data = _extract_json_from_text(raw_content) if use_gemini else json.loads(raw_content)
            if not data:
                raise ValueError("Failed to parse JSON from response")

            result["topic"] = (data.get("topic") or "").strip() or "Unknown"
            result["audience"] = (data.get("audience") or "").strip() or "General"
            result["tone"] = (data.get("tone") or "").strip() or "Neutral"
            result["brand_name"] = (data.get("brand_name") or "").strip()
            result["location"] = (data.get("location") or "").strip()

            if result["topic"] == "Unknown" and url:
                fallback = _infer_topic_from_domain(url)
                if fallback:
                    result["topic"] = fallback
                    print(f"[CONTENT CONSISTENCY] topic fallback from domain: {fallback}", flush=True)
            if not result["location"] and context:
                result["location"] = _infer_location_from_context(context)

            print(f"[CONTENT CONSISTENCY] generate_canonical_topic: result={result}", flush=True)
            return result
        except Exception as e:
            print(f"[CONTENT CONSISTENCY] generate_canonical_topic failed: {e}, using fallbacks", flush=True)
            result["topic"] = _infer_topic_from_domain(url) or "Business Services"
            result["location"] = _infer_location_from_context(context) if context else ""
            return result

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
    async def generate_ranking_prompts(
        topic: str,
        audience: str,
        brand_name: str,
        location: str = "",
        use_gemini: bool = False,
    ) -> List[str]:
        """
        Generate 5 natural search prompts with variety (commercial, informational, comparative).
        Includes location when provided. Never uses "Unknown" in prompts.
        use_gemini: When True, use Gemini for AI Citation; otherwise OpenAI.
        """
        topic_clean = (topic or "").strip()
        if not topic_clean or topic_clean.lower() == "unknown":
            topic_clean = "business services"
        loc_suffix = f" in {location}" if (location or "").strip() else ""

        def fallback_prompts() -> List[str]:
            base = [
                f"best {topic_clean} companies{loc_suffix}",
                f"top {topic_clean} services{loc_suffix}",
                f"how to choose {topic_clean}",
            ]
            if location:
                base.append(f"leading {topic_clean} providers in {location}")
            if brand_name:
                base.append(f"{brand_name} reviews")
            return [p.strip() for p in base if p.strip()][:5]

        api_key = os.getenv("GEMINI_API_KEY") if use_gemini else os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("[CONTENT CONSISTENCY] generate_ranking_prompts: no API key, using fallbacks", flush=True)
            return fallback_prompts()

        prompt_text = f"""
        Given this website's profile:
        - Topic/Field: {topic_clean}
        - Target Audience: {audience or 'General'}
        - Brand Name: {brand_name or '(not provided)'}
        - Location (if applicable): {location or 'not specified'}

        Generate exactly 5 short, natural search prompts that real users would type into ChatGPT, Perplexity, or Google.
        RULES:
        1. Prompts must NOT include the brand name (discovery-style queries).
        2. INCLUDE location in 2-3 prompts when provided (e.g., "best X in {location}").
        3. Use VARIETY: 2 commercial ("best/top X"), 1 informational ("what is X" or "how does X work"), 1 comparative ("X vs alternatives" or "how to choose X").
        4. Be specific to the topic - never use "Unknown".

        Examples with location: "best AI chatbots for real estate in UAE", "top IT companies in Surat".
        Examples without: "how to choose CRM software", "what are the best project management tools".

        Return ONLY a JSON object, no other text: {{ "prompts": ["prompt1", "prompt2", "prompt3", "prompt4", "prompt5"] }}
        """

        try:
            if use_gemini:
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel("gemini-2.0-flash")
                response = await model.generate_content_async(prompt_text)
                raw_content = response.text if response else ""
                data = _extract_json_from_text(raw_content)
            else:
                client = openai.AsyncOpenAI(api_key=api_key)
                response = await client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": prompt_text}],
                    temperature=0.5,
                    response_format={"type": "json_object"},
                )
                data = json.loads(response.choices[0].message.content)
            prompts = data.get("prompts", []) if data else []
            out = [str(p).strip()[:200] for p in prompts if p and "unknown" not in str(p).lower()]
            if len(out) >= 3:
                print(f"[CONTENT CONSISTENCY] generate_ranking_prompts: generated {len(out)} prompts", flush=True)
                return out[:5]
            print(f"[CONTENT CONSISTENCY] generate_ranking_prompts: LLM returned too few, using fallbacks", flush=True)
            return fallback_prompts()
        except Exception as e:
            print(f"[CONTENT CONSISTENCY] generate_ranking_prompts failed: {e}, using fallbacks", flush=True)
            return fallback_prompts()

import os
import json
import openai
from typing import List, Dict, Any, Set

# If fuzzywuzzy is not available, we can use a simple customized matcher, 
# but for now assuming we can use basic string matching if import fails to avoid dependency hell
try:
    from fuzzywuzzy import fuzz
except ImportError:
    fuzz = None

class EntityCoverageService:
    @staticmethod
    async def generate_expected_entities(topic_context: str, fallback_context: str = None) -> List[str]:
        """
        Generates a list of Expected Entities (max 25) based on the homepage/topic context.
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("❌ [ERROR] Missing OPENAI_API_KEY")
            return []

        # 1. Context Logic: Combine fallback if main context is too short
        full_context = topic_context
        if len(topic_context) < 2000 and fallback_context:
            print("⚠️ [INFO] Homepage context short (<2000 chars), appending fallback content.")
            full_context += "\n---\n" + fallback_context

        # Debug Log (Step A)
        print(f"\n[DEBUG] 🧠 generating_expected_entities...")
        print(f"[DEBUG] Context Length: {len(full_context)} chars")
        print("="*60)
        print(f"[DEBUG] CONTENT SENT TO CHATGPT (PREVIEW):\n{full_context[:500]}...")
        print("="*60)

        prompt = f"""
        You are an AEO (Answer Engine Optimization) expert.
        Analyze the following text (from a website's homepage/core pages) to identify the Main Topic.
        
        Task:
        List strictly the **Top 10-25 SEMANTIC ENTITIES** (Specific Technologies, Products, Companies, Industry Standards, Technical Concepts) 
        that a high-authority website on this specific topic MUST mention to be considered comprehensive.

        STRICT RULES:
        STRICT RULES:
1. **NO Marketing Fluff**: Exclude generic business or positioning phrases such as
   "innovation", "growth", "cutting-edge", "excellence", "world-class",
   "serving clients", "global reach", "end-to-end services".

2. **NO Generic Service Categories**: Exclude vague service or business descriptors such as
   "IT solutions provider", "software company", "enterprise solutions",
   "custom software solutions", "development services".

3. **NO Technical / Meta Noise**: Exclude website or SEO implementation terms such as
   "SEO Meta Tags", "Open Graph", "Twitter Card", "cookie policy",
   "privacy policy", "copyright", "menu", "navigation".

4. **NO Own Brand Bias**: Exclude the website’s own brand name unless it is a widely
   recognized external platform (e.g., Google, AWS, Stripe, Salesforce).

5. **Be Specific**: Use concrete, referencable entities only.
   Example: "React.js", "PostgreSQL", "AWS Lambda", "Stripe API".
   Do NOT use abstract or umbrella terms.

6. **Limit**: Return **10–25 entities only**, prioritizing the most essential ones.

7. **Format**: Return ONLY a JSON object:
   {{
     "entities": ["Entity1", "Entity2", ...]
   }}


        Context:
        {full_context[:10000]} # Limit to Avoid Token Limits
        """

        try:
            client = openai.AsyncOpenAI(api_key=api_key)
            response = await client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3, # Low temp for deterministic results
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content
            data = json.loads(content)
            
            # Handle different JSON return structures if model drifts (it asks for list but might wrap in object)
            entities = []
            if isinstance(data, list):
                entities = data
            elif isinstance(data, dict):
                # Look for common keys if it wrapped it
                for key in ["entities", "list", "items", "expected_entities"]:
                    if key in data and isinstance(data[key], list):
                        entities = data[key]
                        break
                # Fallback: if dict but no known key, take the first list value found
                if not entities:
                    for val in data.values():
                        if isinstance(val, list):
                            entities = val
                            break
            
            # Clean and Normalize
            final_entities = [str(e).strip() for e in entities if isinstance(e, str)]
            
            print(f"[DEBUG] ✅ OpenAI Returning {len(final_entities)} Expected Entities: {final_entities}")
            return final_entities

        except Exception as e:
            print(f"❌ [ERROR] generate_expected_entities failed: {e}")
            return []

    @staticmethod
    async def extract_observed_entities(content_batch: str) -> List[str]:
        """
        Extracts semantic entities found in a batch of content using LLM.
        """
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key: return []

        print(f"\n[DEBUG] 👁️  extracting_observed_entities (Batch)...")
        print(f"[DEBUG] Batch Length: {len(content_batch)} chars")
        print(f"[DEBUG] Content Preview: {content_batch[:200]}...")

        prompt = f"""
        Analyze the following website content.
        Extract all significant SEMANTIC ENTITIES (specific technologies, products, companies, key concepts) mentioned in the text.
        
        STRICT RULES:
        1. **NO Marketing Fluff**: Ignore "innovation", "passion", "results", "growth", "excellence", "top-tier", "leading provider".
        2. **NO UI/Meta Noise**: Ignore "Menu", "Home", "Contact Us", "Privacy Policy", "Copyright", "Login", "Sign Up", "SEO Meta Tags".
        3. **Be Specific**: "Python" not "Language". "AWS" not "Cloud".
        4. **Format**: Return ONLY a JSON array of strings: ["Entity1", "Entity2", ...].
        5. No markdown.
        
        Content:
        {content_batch[:12000]}
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
            
            # Same parsing logic as above
            observed = []
            if isinstance(data, list):
                observed = data
            elif isinstance(data, dict):
                for key in ["entities", "list", "items", "observed_entities"]:
                    if key in data and isinstance(data[key], list):
                        observed = data[key]
                        break
                if not observed:
                    for val in data.values():
                        if isinstance(val, list):
                            observed = val
                            break

            final_observed = [str(e).strip() for e in observed if isinstance(e, str)]
            print(f"[DEBUG] ✅ Found {len(final_observed)} entities in batch: {final_observed[:5]}...")
            return final_observed

        except Exception as e:
            print(f"❌ [ERROR] extract_observed_entities failed: {e}")
            return []

    @staticmethod
    def compare_entity_coverage(expected_list: List[str], observed_list: List[str]) -> Dict[str, Any]:
        """
        PURE PYTHON: Compares Expected vs Observed using fuzzy matching.
        """
        print(f"\n[DEBUG] ⚖️  Comparing Entity Coverage...")
        print(f"[DEBUG] Expected ({len(expected_list)}): {expected_list}")
        print(f"[DEBUG] Observed ({len(observed_list)}): {len(observed_list)} unique items")

        if not expected_list:
            return {"score": 0, "missing": [], "found": [], "total_expected": 0}

        # Normalize Observed Set for faster lookups (lowercase)
        observed_norm = {e.lower().strip() for e in observed_list}
        
        found_matches = []
        missing_entities = []
        
        score_hits = 0

        for expected in expected_list:
            exp_clean = expected.lower().strip()
            
            # 1. Direct Match
            if exp_clean in observed_norm:
                found_matches.append(expected)
                score_hits += 1
                continue
            
            # 2. Substring Match (e.g., "AI" inside "AI Agent")
            # If the expected entity is found as a substring in ANY observed entity
            # OR any observed entity is a substring of the expected (less reliable but possible)
            is_substring = any(exp_clean in obs or obs in exp_clean for obs in observed_norm)
            if is_substring:
                 found_matches.append(expected)
                 score_hits += 1
                 continue

            # 3. Fuzzy Match (if library available)
            if fuzz:
                # Find best match in observed list
                # This is O(N*M) heavy, but lists are small (Expected ~25, Observed ~200-500)
                # We can optimize by checking only if no direct match.
                best_score = 0
                for obs in observed_norm:
                    ratio = fuzz.ratio(exp_clean, obs)
                    if ratio > 85: # High threshold for "same thing"
                        best_score = ratio
                        break
                
                if best_score > 85:
                    found_matches.append(expected)
                    score_hits += 1
                    continue
            
            # If we get here, it's missing
            missing_entities.append(expected)

        # Calculate Score
        total = len(expected_list)
        score_percent = int((score_hits / total) * 100) if total > 0 else 0
        
        print(f"[DEBUG] 🏁 Final Calculation: {score_hits}/{total} = {score_percent}%")
        print(f"[DEBUG] Missing: {missing_entities}")

        return {
            "score": score_percent,
            "missing_entities": missing_entities,
            "found_entities": found_matches,
            "all_expected": expected_list
        }

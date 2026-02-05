"""
Sentiment Tracking Service (Module E)
Analyzes AI sentiment towards a brand using multi-model probing.
"""

import logging
import json
import asyncio
import re
from typing import Dict, List, Any
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup
from ..module_C.multi_ai_service import MultiAIService  # pylint: disable=relative-beyond-top-level

# Configure logging
logger = logging.getLogger(__name__)

class SentimentTrackingService:
    """
    Service to track AI sentiment using 5 specific probe questions across 3 models.
    """
    
    def __init__(self):
        self.multi_ai = MultiAIService()
        
        # The 5 Fixed Probe Questions for SENTIMENT
        # These explicitly talk about the brand so the models
        # give us rich, opinionated answers we can score.
        self.PROBE_QUESTIONS = [
            "What is the general reputation of {brand_name} in its industry?",
            "What are the main strengths and weaknesses of {brand_name}?",
            "Is {brand_name} considered trustworthy and reliable? Why or why not?",
            "How do customers or users generally feel about {brand_name}?",
            "Would you recommend {brand_name} to others? Explain briefly."
        ]

        # Discovery-style queries for VISIBILITY.
        # These DO NOT mention the brand. We check if the model surfaces the brand in answers.
        # Mix of tech and general so non-software brands (e.g. e-commerce, niche) can appear.
        self.VISIBILITY_QUERIES = [
            "Who are the leading mobile app development companies?",
            "Which companies would you recommend for custom software development?",
            "What are some well-known providers of IT consulting and digital transformation services?",
            "What are some e-commerce websites or online stores you would recommend?",
            "Name a few small or mid-size companies or brands that have good reputation or visibility.",
            "What companies or brands come to mind when you think of quality products or customer service?",
        ]
        
        # Instruction appended to every prompt
        self.SCORING_INSTRUCTION = (
            "\n\nIMPORTANT: After answering, analyze your own sentiment. "
            "Rate the sentiment of your response on a scale of 0 to 100 "
            "(0=Negative, 50=Neutral, 100=Positive). "
            "Also provide a label: 'Positive', 'Neutral', or 'Negative'. "
            "CRITICAL: You must return your response as a json object (valid json format). "
            "Return ONLY a json object with this exact format (no markdown, no extra text): "
            "{\"response_text\": \"your answer here\", \"sentiment_score\": 85, \"sentiment_label\": \"Positive\"}"
        )

    def _fetch_website_text_sync(self, url: str, max_chars: int = 3500, timeout: int = 12) -> str:
        """
        Fetch a URL and return plain text excerpt (for LLM context). Sync, run in thread from async.
        """
        try:
            if not url or not isinstance(url, str):
                return ""
            url = url.strip()
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
            resp = requests.get(url, headers=headers, timeout=timeout)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
            text = re.sub(r"\s+", " ", text).strip()
            return text[:max_chars] if text else ""
        except Exception as e:
            logger.warning(f"[visibility] Failed to fetch website for context: {e}")
            return ""

    def _is_likely_url(self, brand_name: str) -> bool:
        """Return True if brand_name looks like a URL we can fetch."""
        if not brand_name or not isinstance(brand_name, str):
            return False
        s = brand_name.strip().lower()
        if s.startswith(("http://", "https://")):
            return True
        if "." in s and any(tld in s for tld in (".com", ".io", ".co", ".net", ".org", ".app")):
            return True
        return False

    async def _generate_visibility_queries_for_brand(self, brand_name: str) -> List[str]:
        """
        Use an LLM to generate 6 discovery-style questions tailored to the brand's industry.
        If brand_name is a URL, fetch the website content and pass it to the LLM so it can infer the industry accurately.
        Questions must NOT mention the brand; we will ask these to models and check if they mention the brand.
        """
        logger.info(f"[visibility] Asking LLM to generate visibility questions for brand: {brand_name!r}")
        print(f"[visibility] Asking LLM to generate visibility questions for brand: {brand_name!r}", flush=True)

        website_context = ""
        if self._is_likely_url(brand_name):
            print(f"[visibility] Fetching website content to understand the brand...", flush=True)
            website_context = await asyncio.to_thread(
                self._fetch_website_text_sync, brand_name, 3500, 12
            )
            if website_context:
                print(f"[visibility] Fetched {len(website_context)} chars from website", flush=True)
            else:
                print(f"[visibility] Could not fetch website content, using URL only", flush=True)

        if website_context:
            prompt = (
                "You are given a website URL and content excerpt from that website. Read the content to understand what the website/brand is about.\n\n"
                f"Website URL: \"{brand_name}\"\n\n"
                "Content from the website:\n"
                "---\n"
                f"{website_context}\n"
                "---\n\n"
                "Based on the above content, infer the ONE industry or category this website is about (e.g. fashion/apparel, shoes, e-commerce clothing, IT/software, healthcare). "
                "Generate exactly 6 short discovery-style questions that do NOT mention this brand or URL. "
                "CRITICAL: All 6 questions must be about the SAME industry/category that this website is about. Do NOT mix unrelated industries (e.g. do not include both healthcare and fashion). "
                "Every question MUST explicitly name that industry/category in the question text—never use 'this industry', 'this category', 'this space', or 'this sector'. "
                "Right: 'What are some popular brands in the fashion industry?', 'Which apparel companies would you recommend?'. "
                "Wrong: 'What are some popular brands in this industry?' or mixing in 'IT industry' when the site is about fashion. "
                "Every question MUST ask for a LIST of companies, brands, or key players so answers contain brand names. "
                "Do NOT ask about trends, target customers, or marketing tactics. "
                "You must return a json object with key \"questions\" whose value is an array of exactly 6 question strings. Return ONLY valid json. Example: {\"questions\": [\"What are some popular brands in the fashion industry?\", \"Which apparel companies would you recommend?\"]}"
            )
        else:
            prompt = (
                f"Given this brand or website: \"{brand_name}\". "
                "Infer the industry or category (e.g. fashion/apparel, shoes, IT/software, e-commerce, healthcare). "
                "Generate exactly 6 short discovery-style questions that do NOT mention this brand or URL. "
                "CRITICAL: All 6 questions must be about the SAME industry. Do NOT mix unrelated industries. "
                "Every question MUST explicitly name the industry/category in the question text—never use 'this industry', 'this category', 'this space', or 'this sector'. "
                "Right: 'What are some popular brands in the IT industry?', 'What are some common products offered in the fashion category?'. "
                "Wrong: 'What are some popular brands in this industry?' (model has no context for 'this'). "
                "Every question MUST ask for a LIST of companies, brands, or key players so answers contain brand names. "
                "Do NOT ask about trends, target customers, or marketing tactics. "
                "You must return a json object with key \"questions\" whose value is an array of exactly 6 question strings. Return ONLY valid json. Example: {\"questions\": [\"What are some popular brands in the IT industry?\", \"Which software companies would you recommend?\"]}"
            )

        try:
            if self.multi_ai.openai_client:
                completion = self.multi_ai.openai_client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    temperature=0.3,
                )
                raw = completion.choices[0].message.content
                # Accept either {"questions": [...]} or [...]
                data = json.loads(raw)
                if isinstance(data, list) and len(data) >= 6:
                    out = [str(q).strip() for q in data[:6] if q]
                elif isinstance(data, dict):
                    qs = data.get("questions", data.get("queries", []))
                    out = [str(q).strip() for q in (qs[:6] if isinstance(qs, list) else []) if q]
                else:
                    out = []
                if len(out) >= 4:
                    out = out[:6]
                    logger.info(f"[visibility] Generated {len(out)} dynamic questions for brand={brand_name!r}")
                    print(f"[visibility] Generated {len(out)} dynamic questions for brand={brand_name!r}", flush=True)
                    for i, q in enumerate(out, 1):
                        logger.info(f"[visibility]   Q{i}: {q}")
                        print(f"[visibility]   Q{i}: {q}", flush=True)
                    return out
        except Exception as e:
            logger.warning(f"[visibility] Dynamic question generation failed: {e}, using static questions")
        return []

    async def analyze_sentiment(self, brand_name: str) -> Dict[str, Any]:
        """
        Run sentiment analysis for a brand across all configured models.
        """
        logger.info(f"Starting sentiment tracking for brand: {brand_name}")
        print(f"[visibility] Starting sentiment tracking for brand: {brand_name!r}", flush=True)
        
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
        
        # Generate visibility questions tailored to this brand (or use static fallback)
        visibility_queries = await self._generate_visibility_queries_for_brand(brand_name)
        if not visibility_queries:
            visibility_queries = self.VISIBILITY_QUERIES
            logger.info(f"[visibility] Using static visibility questions for brand: {brand_name!r}")
            print(f"[visibility] Using static visibility questions for brand: {brand_name!r}", flush=True)
        logger.info(f"[visibility] Brand used for visibility score: {brand_name!r} | questions_count={len(visibility_queries)}")
        print(f"[visibility] Brand used for visibility score: {brand_name!r} | questions_count={len(visibility_queries)}", flush=True)
        for i, q in enumerate(visibility_queries, 1):
            logger.info(f"[visibility] Visibility Q{i}: {q}")
            print(f"[visibility] Visibility Q{i}: {q}", flush=True)
        
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

            # --- Compute visibility metrics for this model based on DISCOVERY queries ---
            # These are separate from the sentiment probes above.
            visibility_details = await self._audit_model_visibility(brand_name, model_name, visibility_queries)
            visibility_for_model = self._compute_visibility_for_model(
                brand_name=brand_name,
                visibility_details=visibility_details
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

    def _visibility_search_terms(self, brand_name: str) -> List[str]:
        """
        Return a list of strings to search for in discovery answers.
        When brand is a URL, include domain, stem (e.g. iroidsolutions), and a
        "display name" variant with space (e.g. iroid solutions) so we match
        how models typically mention brands ("Iroid Solutions", "YesQuest Tech").
        """
        terms: List[str] = []
        raw = (brand_name or "").strip()
        if not raw:
            return terms
        raw_lower = raw.lower()
        terms.append(raw_lower)
        try:
            parsed = urlparse(raw if "://" in raw else f"https://{raw}")
            netloc = (parsed.netloc or parsed.path or "").strip().lower()
            if netloc:
                terms.append(netloc)
                no_www = re.sub(r"^www\.", "", netloc)
                stem = no_www.split(".")[0] if "." in no_www else no_www
                if stem and stem not in terms:
                    terms.append(stem)
                # Models often say "Iroid Solutions" / "YesQuest Tech" (with space).
                # Add stem-with-space variant for common suffixes so we match.
                for suffix in ("solutions", "tech", "lab", "software", "apps", "digital", "systems"):
                    if stem.endswith(suffix) and len(stem) > len(suffix):
                        prefix = stem[: -len(suffix)]
                        if prefix:
                            space_variant = f"{prefix} {suffix}"
                            if space_variant not in terms:
                                terms.append(space_variant)
                        break
        except Exception:
            pass
        out = list(dict.fromkeys(terms))
        logger.info(f"[visibility] _visibility_search_terms brand={brand_name!r} -> terms={out}")
        return out

    def _compute_visibility_for_model(self, brand_name: str, visibility_details: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Compute visibility metrics for a single model using its detailed answers.

        Heuristic:
        - appearance_rate: fraction of probe answers where the brand (or domain/name) appears
        - position_weight: earlier mentions are better (1.0 for very early, down to 0.2 for very late)
        - visibility_score: appearance_rate * avg_position_weight scaled to 0–100
        """
        details: List[Dict[str, Any]] = visibility_details or []
        total_prompts = len(details) or 1

        search_terms = self._visibility_search_terms(brand_name)
        if not search_terms:
            search_terms = [brand_name.lower()]

        logger.info(f"[visibility] _compute_visibility_for_model brand={brand_name!r} search_terms={search_terms} total_prompts={total_prompts}")

        appearance_count = 0
        position_weights: List[float] = []

        for item in details:
            answer = (item.get("answer") or "")
            answer_lower = str(answer).lower()

            best_idx = -1
            for term in search_terms:
                pos = answer_lower.find(term.lower())
                if pos != -1 and (best_idx == -1 or pos < best_idx):
                    best_idx = pos
            if best_idx == -1:
                continue

            appearance_count += 1
            if best_idx <= 50:
                weight = 1.0
            elif best_idx <= 200:
                weight = 0.8
            elif best_idx <= 400:
                weight = 0.5
            else:
                weight = 0.2
            position_weights.append(weight)

        appearance_rate = appearance_count / total_prompts
        avg_position_weight = sum(position_weights) / len(position_weights) if position_weights else 0.0

        raw_visibility = appearance_rate * avg_position_weight
        visibility_score = int(max(0.0, min(raw_visibility * 100.0, 100.0)))
        logger.info(f"[visibility] _compute_visibility_for_model result appearances={appearance_count} appearance_rate={appearance_rate} avg_pos_weight={avg_position_weight} visibility_score={visibility_score}")

        return {
            "appearance_rate": appearance_rate,
            "avg_position_weight": avg_position_weight,
            "visibility_score": visibility_score,
            "total_prompts": total_prompts,
            "appearances": appearance_count,
        }

    def _build_batched_visibility_prompt(self, queries: List[str]) -> str:
        """Build one prompt that lists all 6 questions and asks for JSON with answer_1..answer_6."""
        questions_block = "\n".join(f"Question {i+1}: {q}" for i, q in enumerate(queries[:6]))
        return (
            "Answer the following 6 questions briefly. Each answer should be a short paragraph or list. "
            "CRITICAL: You must return your response as a json object (valid json format). "
            "The json object must have exactly these keys: answer_1, answer_2, answer_3, answer_4, answer_5, answer_6. "
            "Each value must be your answer text for the corresponding question. "
            "Return ONLY valid json, no markdown, no other text, no other keys.\n\n"
            f"{questions_block}"
        )

    async def _audit_model_visibility(
        self, brand_name: str, model_name: str, visibility_queries: List[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Ask all 6 discovery-style questions in ONE API call per model; collect answers
        for visibility scoring (not sentiment).
        """
        queries = (visibility_queries or self.VISIBILITY_QUERIES)[:6]
        logger.info(f"Running visibility audit for model: {model_name} and brand: {brand_name} (1 API call for {len(queries)} questions)")

        batched_prompt = self._build_batched_visibility_prompt(queries)
        visibility_responses: List[Dict[str, Any]] = []

        try:
            if model_name == "openai":
                data = await self._call_openai(batched_prompt)
            elif model_name == "gemini":
                data = await self._call_gemini(batched_prompt)
            elif model_name == "claude":
                data = await self._call_claude(batched_prompt)
            else:
                data = None

            if data and isinstance(data, dict):
                for i in range(len(queries)):
                    # Accept answer_1, answer_2, ... or response_text_1, ...
                    answer_text = (
                        data.get(f"answer_{i+1}") or
                        data.get(f"response_text_{i+1}") or
                        ""
                    )
                    if isinstance(answer_text, dict):
                        answer_text = answer_text.get("response_text", answer_text.get("text", ""))
                    answer_text = str(answer_text).strip()
                    visibility_responses.append({
                        "question": queries[i],
                        "answer": answer_text
                    })
                    print(f"[visibility] {model_name} Q{i+1} question: {queries[i]}", flush=True)
                    print(f"[visibility] {model_name} Q{i+1} answer: {answer_text}", flush=True)
        except Exception as e:
            logger.error(f"Error querying {model_name} for visibility (batched): {e}")

        n = len(visibility_responses)
        first_len = len(visibility_responses[0].get("answer", "")) if visibility_responses else 0
        logger.info(f"[visibility] _audit_model_visibility model={model_name} brand={brand_name!r} count={n} first_answer_len={first_len}")
        return visibility_responses

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

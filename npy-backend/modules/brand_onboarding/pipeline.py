import asyncio
import logging
import json
import re
from urllib.parse import urljoin, urlparse
from datetime import datetime

import aiohttp
from bs4 import BeautifulSoup

from orchestrator.checkpoint.executor import execute_task
from utils.mongo import mongo_manager
from utils.storage import load_raw_html

logger = logging.getLogger("brand_pipeline")

_STRIP_TAGS = ["script", "style", "noscript", "svg", "iframe", "template", "nav", "footer", "header"]
_MAX_TEXT_CHARS = 12000

class BrandPipeline:
    @staticmethod
    def _html_to_plain_text(html: str) -> str:
        from bs4 import Comment
        soup = BeautifulSoup(html, "lxml")
        for tag in soup.find_all(_STRIP_TAGS):
            tag.decompose()
        for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
            comment.extract()
        text = soup.get_text(separator=" ")
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _extract_json(text: str) -> any:
        """Robustly extract JSON from LLM output that may contain markdown fences or prose."""
        if not text:
            return None
        # 1. Try direct parse first
        try:
            return json.loads(text)
        except Exception:
            pass
        # 2. Strip markdown code fences: ```json ... ``` or ``` ... ```
        stripped = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
        try:
            return json.loads(stripped)
        except Exception:
            pass
        # 3. Find the first { ... } or [ ... ] block
        for start_ch, end_ch in (("{" , "}"), ("[", "]")):
            start = text.find(start_ch)
            end = text.rfind(end_ch)
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(text[start:end + 1])
                except Exception:
                    pass
        return None

    @staticmethod
    async def fetch_html(url: str) -> str:
        full_url = url if url.startswith(("http://", "https://")) else f"https://{url}"
        timeout = aiohttp.ClientTimeout(total=30)
        headers = {"User-Agent": "Mozilla/5.0 (compatible; YogreetBot/1.0)"}
        async with aiohttp.ClientSession(headers=headers) as session:
            try:
                async with session.get(full_url, timeout=timeout, allow_redirects=True) as resp:
                    if resp.status == 200:
                        return await resp.text(errors="replace")
            except Exception as e:
                logger.warning(f"Failed to fetch {full_url}: {e}")
        return ""

    @staticmethod
    async def stage1_crawl(url: str, job_id: str | None = None) -> str:
        """Stage 1: Enhanced Crawl & Content Extraction"""
        base_url = url if url.startswith(("http://", "https://")) else f"https://{url}"
        
        homepage_html = ""
        # 1. Try S3 first when we know the job (Quick Start integration)
        if job_id:
            try:
                homepage_html = await load_raw_html(job_id)
                if homepage_html:
                    logger.info(f"Loaded HTML from S3 for job {job_id} ({len(homepage_html)} bytes)")
            except Exception as exc:
                logger.warning(f"S3 load failed for job {job_id}: {exc}")

        # 2. Fall back to live fetch
        if not homepage_html:
            homepage_html = await BrandPipeline.fetch_html(base_url)
            
        if not homepage_html:
            return ""

        soup = BeautifulSoup(homepage_html, "lxml")
        internal_links = set()
        parsed_base = urlparse(base_url)
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith(("/", parsed_base.scheme + "://" + parsed_base.netloc)):
                full_href = urljoin(base_url, href)
                internal_links.add(full_href)

        high_signal_paths = ["/about", "/about-us", "/product", "/features", "/how-it-works", "/pricing", "/plans", "/solutions", "/use-cases", "/blog"]
        
        target_urls = []
        for link in internal_links:
            path = urlparse(link).path.lower()
            if any(path.startswith(p) or path == p for p in high_signal_paths):
                target_urls.append(link)
                
        target_urls = list(set(target_urls))[:6]
        
        logger.info(f"Stage 1: Crawling homepage + {len(target_urls)} inner pages")

        # Track (label, html) pairs so each page is labeled in the output
        page_sources: list[tuple[str, str]] = [("Homepage", homepage_html)]
        if target_urls:
            tasks = [BrandPipeline.fetch_html(u) for u in target_urls]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for u, res in zip(target_urls, results):
                if isinstance(res, str) and res:
                    path_label = urlparse(u).path.rstrip("/") or "/"
                    page_sources.append((path_label, res))

        # Per-page character budget so no single page dominates the context
        _PER_PAGE_CHARS = 3200
        labeled_sections: list[str] = []
        for label, html in page_sources:
            extracted = BrandPipeline._html_to_plain_text(html)[:_PER_PAGE_CHARS]
            if extracted:
                labeled_sections.append(f"--- PAGE: {label} ---\n{extracted}")

        combined_text = "\n\n".join(labeled_sections)
        return combined_text[:26000]  # ~6500 tokens

    @staticmethod
    async def stage2_description(brand_raw_context: str, url: str, job_id: str) -> dict:
        """Stage 2: Deep Evidence-Based Brand Overview Generation"""
        prompt = f"""You are a brand intelligence analyst performing a deep, evidence-based analysis of a website's content.

CRITICAL RULES — follow ALL without exception:
1. ONLY extract information that is DIRECTLY AND EXPLICITLY stated in the provided content
2. Do NOT infer, assume, or extrapolate anything beyond what is clearly written
3. Do NOT paraphrase marketing copy — reflect actual claims made on the site
4. If a field cannot be supported by direct evidence from the content, return null or an empty array []
5. For lists, only include items explicitly named or described — do NOT pad with guesses
6. If the same fact appears across multiple pages, include it exactly once
7. Ignore generic boilerplate (cookie banners, legal footers, navigation labels, social media links)
8. The site may be anything — a product, service, blog, organisation, community, e-commerce store, etc. Describe it as it actually is

Return a JSON object with EXACTLY these fields:
{{
  "brand_name": "Name of the company, product, or site as it appears",
  "one_liner": "One factual sentence describing what this is and who it is for, using only their stated positioning",
  "description": "3-4 sentences covering: (1) what this is, (2) the problem or need it addresses, (3) who it is for, (4) what makes it notable — evidence only, no invention",
  "product_category": "What category this falls into, derived purely from the content. Could be anything — a product type, service type, information resource, community, etc.",
  "business_model": "How this operates or makes money, as implied or stated by the content. Describe it in your own words based on what you see — do not force a label",
  "target_audience": [
    {{"segment": "specific type of person or organisation mentioned as the intended user or customer", "company_type": "industry or organisation type if explicitly stated, else null", "evidence": "short verbatim phrase from the content"}}
  ],
  "core_use_cases": [
    {{"use_case": "specific task, goal, or problem this helps with, as stated on the site", "evidence": "short verbatim phrase from the content"}}
  ],
  "key_features": [
    {{"feature": "feature, capability, or offering name as stated", "description": "what it does — only from content", "source_page": "page label this came from"}}
  ],
  "pain_points_solved": ["specific problem or frustration explicitly described on the site"],
  "differentiators": ["what makes this stand out — only include if explicitly claimed"],
  "pricing_model": "Description of the pricing or access model if mentioned, else null",
  "pricing_tiers": ["plan or tier name as stated on the site"],
  "geographic_focus": "Geographic scope if stated anywhere on the site, else null",
  "integrations_mentioned": ["any external tool, platform, or service explicitly named"],
  "competitors_mentioned": ["any competitor or alternative explicitly named"],
  "technology_signals": ["any technology, framework, API, or platform explicitly mentioned"],
  "content_themes": ["recurring topic or theme present across multiple pages"]
}}

Website content (labeled by page — each section starts with --- PAGE: path ---):
{brand_raw_context}

Extract the brand overview. Remember: null or [] is always better than a guess."""

        response = await execute_task(
            task_name="brand_overview_v3",
            input_data={"prompt": prompt},
            provider="claude",
            options={"model": "claude-3-haiku-20240307", "temperature": 0.1, "max_tokens": 2048}
        )
        if not response.success:
            logger.warning(f"Claude failed for stage2: {response.error}. Falling back to GPT-4o.")
            response = await execute_task(
                task_name="brand_overview_v3",
                input_data={"prompt": prompt},
                provider="openai",
                options={"model": "gpt-4o", "temperature": 0.1, "response_format": {"type": "json_object"}, "max_tokens": 2048}
            )

        if not response.success:
            raise RuntimeError(f"Stage 2 failed: {response.error}")

        parsed = BrandPipeline._extract_json(response.data)
        if not parsed or not isinstance(parsed, dict):
            logger.error(f"Stage 2 JSON parse failed. Raw response snippet: {str(response.data)[:500]}")
            profile = {}
        else:
            profile = parsed

        profile["website_url"] = url
        profile["created_at"] = datetime.utcnow()
        profile["job_id"] = job_id

        mongo_manager.brand_profiles.update_one(
            {"job_id": job_id},
            {"$set": profile},
            upsert=True
        )
        return profile

    @staticmethod
    async def stage3_topics(brand_profile: dict, brand_raw_context: str = "", job_id: str = "") -> list:
        """Stage 3: Topic Cluster Generation — driven by the rich brand overview"""

        # Helper: flatten fields that may be list-of-dicts or list-of-strings
        def _flatten(items: list | None, key: str = "") -> list[str]:
            if not items:
                return []
            result = []
            for item in items:
                if isinstance(item, dict):
                    val = str(item.get(key, "") or "")
                    if not val and item:
                        val = str(next(iter(item.values()), ""))
                    result.append(val)
                elif isinstance(item, str):
                    result.append(item)
            return [s for s in result if s]

        seed_topics: list[str] = []
        if brand_profile.get("product_category"):
            seed_topics.append(str(brand_profile["product_category"]))
        seed_topics.extend(_flatten(brand_profile.get("core_use_cases"), "use_case"))
        seed_topics.extend(_flatten(brand_profile.get("target_audience"), "segment"))
        seed_topics.extend(_flatten(brand_profile.get("key_features"), "feature"))
        seed_topics.extend(brand_profile.get("pain_points_solved") or [])
        seed_topics.extend(brand_profile.get("differentiators") or [])
        seed_topics.extend(brand_profile.get("content_themes") or [])
        # Deduplicate while preserving order
        seed_topics = list(dict.fromkeys(s.strip() for s in seed_topics if s.strip()))

        # Human-readable summaries for the prompt
        audience_summary = json.dumps(_flatten(brand_profile.get("target_audience"), "segment"))
        use_cases_summary = json.dumps(_flatten(brand_profile.get("core_use_cases"), "use_case"))
        features_summary = json.dumps(_flatten(brand_profile.get("key_features"), "feature"))

        prompt = f"""You are an SEO and AEO (Answer Engine Optimization) strategist. Given a comprehensive, evidence-based overview of a website, generate topic clusters that represent what this site's audience actively searches for in AI chatbots (ChatGPT, Gemini, Perplexity).

The site may be any kind of entity — a SaaS product, e-commerce store, agency, blog, community, personal brand, non-profit, or anything else. Adapt your topics accordingly.

Return a JSON object:
{{
  "topics": [
    {{
      "topic": "Topic name (3-6 words max)",
      "relevance": "primary | secondary",
      "customer_journey_stage": "awareness | consideration | decision",
      "description": "One sentence — why this topic matters for this site's audience"
    }}
  ]
}}

Rules:
- Generate exactly 30 topics
- ONLY generate topics grounded in the site's actual documented scope — use the overview as your ground truth
- Distribute journey stages evenly: 10 awareness, 10 consideration, 10 decision
- Topics must be things real people type into AI chatbots, NOT abstract SEO keywords
- Be specific: "best open-source recipe management apps" beats "recipes"
- No duplicate intent across topics
- Do NOT invent topics about things the site does not do or cover

Site overview (evidence-based):
- Name: {brand_profile.get('brand_name')}
- Category: {brand_profile.get('product_category')}
- Business model: {brand_profile.get('business_model')}
- Description: {brand_profile.get('description')}
- Target audience: {audience_summary}
- Core use cases: {use_cases_summary}
- Key features / offerings: {features_summary}
- Pain points solved: {json.dumps(brand_profile.get('pain_points_solved') or [])}
- Differentiators: {json.dumps(brand_profile.get('differentiators') or [])}
- Competitors: {json.dumps(brand_profile.get('competitors_mentioned') or [])}
- Integrations: {json.dumps(brand_profile.get('integrations_mentioned') or [])}
- Technology signals: {json.dumps(brand_profile.get('technology_signals') or [])}
- Content themes: {json.dumps(brand_profile.get('content_themes') or [])}

Seed signals derived from the overview:
{json.dumps(seed_topics)}

Generate exactly 30 highly specific, AEO-optimised topic clusters rooted in this site's actual scope."""

        response = await execute_task(
            task_name="brand_topics_v2",
            input_data={"prompt": prompt},
            provider="claude",
            options={"model": "claude-3-haiku-20240307", "temperature": 0.4, "max_tokens": 4096}
        )
        if not response.success:
            logger.warning(f"Claude failed for stage3: {response.error}. Falling back to GPT-4o.")
            response = await execute_task(
                task_name="brand_topics_v2",
                input_data={"prompt": prompt},
                provider="openai",
                options={"model": "gpt-4o", "temperature": 0.4, "response_format": {"type": "json_object"}}
            )
        
        if not response.success:
            raise RuntimeError(f"Stage 3 failed: {response.error}")
            
        parsed = BrandPipeline._extract_json(response.data)
        if parsed and isinstance(parsed, dict):
            topics_data = parsed.get("topics", [])
        elif parsed and isinstance(parsed, list):
            topics_data = parsed
        else:
            logger.error(f"Stage 3 JSON parse failed. Raw response snippet: {str(response.data)[:500]}")
            topics_data = []
            
        for t in topics_data:
            t["job_id"] = job_id
            t["source"] = "llm_generated"
            t["created_at"] = datetime.utcnow()
            
        if topics_data:
            mongo_manager.brand_topics.delete_many({"job_id": job_id})
            mongo_manager.brand_topics.insert_many(topics_data)
            
        return topics_data

    @staticmethod
    async def stage4_prompts(topics: list, brand_profile: dict, job_id: str) -> list:
        """Stage 4: Per-topic prompt generation — 15-20 individual prompts per topic."""

        def _flatten(items: list | None, key: str = "") -> list[str]:
            if not items:
                return []
            result = []
            for item in items:
                if isinstance(item, dict):
                    val = str(item.get(key, "") or "")
                    if not val and item:
                        val = str(next(iter(item.values()), ""))
                    result.append(val)
                elif isinstance(item, str):
                    result.append(item)
            return [s for s in result if s]

        brand_ctx = (
            f"Brand: {brand_profile.get('brand_name', '')}\n"
            f"Category: {brand_profile.get('product_category', '')}\n"
            f"One-liner: {brand_profile.get('one_liner', '')}\n"
            f"Core use cases: {', '.join(_flatten(brand_profile.get('core_use_cases'), 'use_case'))}\n"
            f"Target audience: {', '.join(_flatten(brand_profile.get('target_audience'), 'segment'))}\n"
            f"Competitors: {', '.join(_flatten(brand_profile.get('competitors_mentioned')))}"
        )

        async def _generate_for_topic(topic_doc: dict) -> tuple[str, list]:
            topic_name = topic_doc.get("topic", "")
            topic_desc = topic_doc.get("description", "")

            prompt_text = f"""You are an AEO (Answer Engine Optimization) strategist.
Generate 15 unbranded search prompts that a real user would type into ChatGPT, Gemini,
or Perplexity when looking for solutions related SPECIFICALLY to this topic:

TOPIC: {topic_name}
TOPIC CONTEXT: {topic_desc}

{brand_ctx}

Rules (strictly follow all):
1. NEVER include the brand name or domain in any prompt
2. ALL 15 prompts must be tightly focused on the topic "{topic_name}" — no unrelated themes
3. Each prompt must sound exactly like a real user typing into an AI chatbot
4. Cover all 4 customer journey stages across the 15 prompts:
   - Awareness (3-4): "What is...", "Why do I need...", "How does X work..."
   - Consideration (4-5): "What are the best...", "Which tool for...", "Compare X vs Y..."
   - Decision (4-5): "Best [product] for [use case]", "What should I look for in..."
   - Post Purchase (2): "How to get the most out of...", "Best practices for..."
5. Include these types: category_discovery, feature_based, comparison, use_case, problem_first, recommendation
6. Mix lengths: short (5-8 words), medium (10-15 words), long (15-25 words)
7. Prompts must reflect only the brand's actual capabilities — no invented features

Return a JSON object with a "prompts" array only, no preamble:
{{
  "prompts": [
    {{
      "prompt": "exact query string",
      "journey_stage": "awareness | consideration | decision | post_purchase",
      "prompt_type": "category_discovery | feature_based | comparison | use_case | problem_first | recommendation",
      "why_this_prompt": "one sentence — why this surfaces the brand"
    }}
  ]
}}

Generate exactly 15 prompts, all about: {topic_name}
"""
            res = await execute_task(
                task_name="brand_prompts_v3",
                input_data={"prompt": prompt_text},
                provider="claude",
                options={"model": "claude-3-haiku-20240307", "temperature": 0.5, "max_tokens": 3000}
            )
            if not res.success:
                logger.warning(f"Claude failed for topic '{topic_name}': {res.error}. Falling back to GPT-4o.")
                res = await execute_task(
                    task_name="brand_prompts_v3",
                    input_data={"prompt": prompt_text},
                    provider="openai",
                    options={"model": "gpt-4o", "temperature": 0.5, "response_format": {"type": "json_object"}, "max_tokens": 3000}
                )

            topic_prompts: list = []
            if res.success:
                parsed = BrandPipeline._extract_json(res.data)
                if parsed and isinstance(parsed, dict):
                    topic_prompts = parsed.get("prompts", [])
                elif parsed and isinstance(parsed, list):
                    topic_prompts = parsed
                else:
                    logger.error(f"Stage 4 JSON parse failed for topic '{topic_name}'. Snippet: {str(res.data)[:300]}")

            # Stamp topic on every prompt
            for p in topic_prompts:
                if isinstance(p, dict):
                    p["topic"] = topic_name

            return topic_name, [p for p in topic_prompts if isinstance(p, dict)]

        # Run all topics concurrently
        topic_results = await asyncio.gather(
            *[_generate_for_topic(t) for t in topics],
            return_exceptions=True
        )

        # Build grouped list and flat list simultaneously
        grouped: list[dict] = []   # [{topic, prompts: [...]}]
        all_flat: list[dict] = []

        for result in topic_results:
            if isinstance(result, Exception):
                logger.error(f"Topic prompt generation raised: {result}")
                continue
            topic_name, topic_prompts = result
            grouped.append({"topic": topic_name, "prompts": topic_prompts})
            all_flat.extend(topic_prompts)

        # Search-volume lookup for every prompt in parallel
        async def _fetch_sv(prompt_str: str) -> int | None:
            if not prompt_str:
                return None
            payload = [{
                "keywords": [prompt_str],
                "location_code": 2840,
                "language_code": "en"
            }]
            sv_res = await execute_task(
                task_name="brand_sv_lookup",
                input_data={"endpoint": "/keywords_data/google_ads/search_volume/live", "payload": payload},
                provider="dataforseo"
            )
            try:
                if sv_res.success and sv_res.data:
                    tasks = sv_res.data.get("tasks", [])
                    if tasks and tasks[0].get("result"):
                        return tasks[0]["result"][0].get("search_volume")
            except Exception as e:
                logger.warning(f"Failed to extract search volume for '{prompt_str}': {e}")
            return None

        sv_tasks = [_fetch_sv(p.get("prompt", "")) for p in all_flat]
        sv_results = await asyncio.gather(*sv_tasks, return_exceptions=True)

        for idx, p in enumerate(all_flat):
            sv = sv_results[idx]
            p["search_volume"] = (
                int(sv) if sv and not isinstance(sv, Exception) and isinstance(sv, (int, float)) and sv >= 10
                else None
            )
            p["job_id"] = job_id
            p["is_variant"] = False
            p["created_at"] = datetime.utcnow()

        if all_flat:
            mongo_manager.brand_prompts.delete_many({"job_id": job_id})
            mongo_manager.brand_prompts.insert_many(all_flat)

        # Return grouped so callers can render per-topic
        return grouped

    @staticmethod
    async def stage5_execution(prompts: list, brand_profile: dict, job_id: str) -> list:
        """Stage 5: AI Execution (Prompt → Gemini / GPT / Claude)"""
        semaphore = asyncio.Semaphore(10)
        
        async def _run_and_analyze(prompt_doc: dict, provider: str):
            async with semaphore:
                start = datetime.utcnow()
                # 1. Execute Prompt
                res = await execute_task(
                    task_name="ai_execution_v2",
                    input_data={"prompt": prompt_doc["prompt"]},
                    provider=provider,
                    options={"model": "gpt-4o" if provider=="openai" else ("gemini-1.5-pro" if provider=="google" else "claude-3-5-sonnet"), "temperature": 0.3, "max_tokens": 800}
                )
                latency = int((datetime.utcnow() - start).total_seconds() * 1000)
                
                full_response = res.data if res.success else ""
                
                # 2. Analyze Response
                analysis_prompt = f"""You are a brand visibility analyst. Analyze this AI response for brand presence signals.

Return JSON:
{{
  "brand_mentioned": true | false,
  "mention_type": "direct_name | product_category_leader | comparison | recommendation | not_mentioned",
  "mention_position": "early | middle | late | not_mentioned",
  "sentiment": "positive | neutral | negative | not_mentioned",
  "competitors_mentioned": ["competitor1", "competitor2"],
  "cited_sources": ["url1", "url2"],
  "visibility_score": 0
}}

Scoring guide:
- Direct name + positive + early position = 85-100
- Direct name + neutral + any position = 60-80 
- Category mentioned but not brand = 20-40
- Not mentioned at all = 0

Brand name: {brand_profile.get('brand_name')}
AI Response: {full_response}"""

                analysis_res = await execute_task(
                    task_name="ai_analysis_v2",
                    input_data={"prompt": analysis_prompt},
                    provider="openai",
                    options={"model": "gpt-4o-mini", "temperature": 0.1, "response_format": {"type": "json_object"}}
                )
                
                analysis_data = {}
                if analysis_res.success:
                    try:
                        analysis_data = json.loads(analysis_res.data)
                    except:
                        pass
                        
                result_doc = {
                    "job_id": job_id,
                    "prompt": prompt_doc["prompt"],
                    "model_name": provider,
                    "full_response_text": full_response,
                    "brand_mentioned": analysis_data.get("brand_mentioned", False),
                    "mention_type": analysis_data.get("mention_type", "not_mentioned"),
                    "mention_position": analysis_data.get("mention_position", "not_mentioned"),
                    "sentiment": analysis_data.get("sentiment", "not_mentioned"),
                    "competitors_mentioned": analysis_data.get("competitors_mentioned", []),
                    "cited_sources": analysis_data.get("cited_sources", []),
                    "visibility_score": analysis_data.get("visibility_score", 0),
                    "executed_at": start,
                    "latency_ms": latency
                }
                return result_doc

        providers = ["openai", "google", "anthropic"]
        tasks = []
        for p in prompts:
            for provider in providers:
                tasks.append(_run_and_analyze(p, provider))
                
        results = await asyncio.gather(*tasks, return_exceptions=True)
        valid_results = [r for r in results if not isinstance(r, Exception)]
        
        if valid_results:
            mongo_manager.prompt_results.delete_many({"job_id": job_id})
            mongo_manager.prompt_results.insert_many(valid_results)
            
        return valid_results

    @staticmethod
    async def stage6_scoring(job_id: str) -> dict:
        """Stage 6: Gap & Opportunity Scoring"""
        results = list(mongo_manager.prompt_results.find({"job_id": job_id}))
        prompts = list(mongo_manager.brand_prompts.find({"job_id": job_id}))
        
        # Calculate visibility per prompt
        prompt_scores = {}
        for r in results:
            p_text = r["prompt"]
            if p_text not in prompt_scores:
                prompt_scores[p_text] = {"scores": [], "competitors": set(), "brand_mentioned": False}
            prompt_scores[p_text]["scores"].append(r.get("visibility_score", 0))
            if r.get("competitors_mentioned"):
                prompt_scores[p_text]["competitors"].update(r["competitors_mentioned"])
            if r.get("brand_mentioned"):
                prompt_scores[p_text]["brand_mentioned"] = True
                
        for p in prompts:
            p_text = p["prompt"]
            if p_text in prompt_scores:
                avg_score = sum(prompt_scores[p_text]["scores"]) / len(prompt_scores[p_text]["scores"]) if prompt_scores[p_text]["scores"] else 0
                gap_flag = avg_score < 40
                opp_flag = bool(prompt_scores[p_text]["competitors"]) and not prompt_scores[p_text]["brand_mentioned"]
                
                mongo_manager.brand_prompts.update_one(
                    {"_id": p["_id"]},
                    {"$set": {"avg_visibility": avg_score, "gap_flag": gap_flag, "opportunity_flag": opp_flag}}
                )
                
        # Aggregate to topic level
        topics = list(mongo_manager.brand_topics.find({"job_id": job_id}))
        for t in topics:
            t_prompts = list(mongo_manager.brand_prompts.find({"job_id": job_id, "topic": t["topic"]}))
            if t_prompts:
                avg_topic_score = sum(p.get("avg_visibility", 0) for p in t_prompts) / len(t_prompts)
                mongo_manager.brand_topics.update_one(
                    {"_id": t["_id"]},
                    {"$set": {"topic_visibility_score": avg_topic_score, "needs_improvement": avg_topic_score < 35}}
                )
                
        return {"status": "completed"}

    @staticmethod
    async def run_full_pipeline(url: str, job_id: str):
        logger.info(f"Starting full pipeline for {url} (Job: {job_id})")
        context = await BrandPipeline.stage1_crawl(url, job_id)
        profile = await BrandPipeline.stage2_description(context, url, job_id)
        topics = await BrandPipeline.stage3_topics(profile, context, job_id)
        prompts = await BrandPipeline.stage4_prompts(topics, profile, job_id)
        results = await BrandPipeline.stage5_execution(prompts, profile, job_id)
        await BrandPipeline.stage6_scoring(job_id)
        logger.info(f"Pipeline completed for {url}")
        return profile

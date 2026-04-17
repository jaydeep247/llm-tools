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
    def _analyze_response_for_brand(
        response_text: str,
        brand_name: str,
        brand_domain: str,
        competitors: list,
    ) -> dict:
        """
        Locally detect brand + competitor mentions in an LLM response.
        No secondary AI call needed — reuses entity matching logic from module_F.

        Returns:
          brand_mentioned:       bool
          brand_mention_count:   int
          brand_rank:            int | None  (1-based, by first-occurrence order)
          brand_rank_out_of:     int         (total distinct brands mentioned)
          sentiment:             "positive" | "neutral" | "negative" | "not_mentioned"
          in_title:              bool
          visibility_score:      int  (0-100)
          all_mentioned_brands:  [{name, count}]  sorted by first occurrence
          competitors_mentioned: [{name, count}]  only those present
          _brand_first_pos:      int  (internal – used for mention_position calc)
        """
        from modules.module_F.competitor_ai_intelligence import (
            _make_entity_terms, _compile_patterns, _find_unique_spans,
            _estimate_sentiment, _detect_title_mention, _compute_citation_score,
            _extract_domain,
        )

        if not response_text:
            return {
                "brand_mentioned": False,
                "brand_mention_count": 0,
                "brand_rank": None,
                "brand_rank_out_of": 0,
                "sentiment": "not_mentioned",
                "in_title": False,
                "visibility_score": 0,
                "all_mentioned_brands": [],
                "competitors_mentioned": [],
                "_brand_first_pos": -1,
            }

        # Extract clean domain name from URL (e.g. "https://example.com" → "example.com")
        brand_domain_clean = _extract_domain(brand_domain) if brand_domain else ""

        # Build entity terms for brand (domain + friendly name as alias)
        brand_entity = _make_entity_terms(
            brand_domain_clean or brand_name,
            extra_terms=[brand_name] if brand_name and brand_name.strip().lower() != brand_domain_clean else None,
        )

        # Build entity terms for each competitor
        comp_entities = [
            _make_entity_terms(c.strip())
            for c in (competitors or [])
            if isinstance(c, str) and c.strip()
        ]

        all_entities = [brand_entity] + comp_entities
        text_lower = response_text.lower()

        # Find mentions for every entity
        entity_stats: list = []
        for entity in all_entities:
            patterns = _compile_patterns(entity.terms)
            spans = _find_unique_spans(text_lower, patterns)
            count = len(spans)
            first_pos = spans[0][0] if spans else -1
            entity_stats.append({
                "entity": entity,
                "display_name": entity.name,
                "count": count,
                "first_pos": first_pos,
            })

        # Brand is always index 0
        brand_stat = entity_stats[0]
        # Override display name with the friendlier brand_name if provided
        if brand_name:
            brand_stat["display_name"] = brand_name

        brand_mentioned = brand_stat["count"] > 0
        brand_mention_count = brand_stat["count"]
        brand_first_pos = brand_stat["first_pos"]

        # Competitors that actually appeared in the response
        comp_stats_present = [s for s in entity_stats[1:] if s["count"] > 0]

        # All mentioned brands sorted by first occurrence → determines rank
        all_mentioned = (
            ([brand_stat] if brand_mentioned else []) + comp_stats_present
        )
        all_mentioned.sort(key=lambda x: x["first_pos"])

        # Brand rank (1-based position in first-occurrence-sorted list)
        brand_rank = None
        if brand_mentioned:
            for i, b in enumerate(all_mentioned):
                if b is brand_stat:
                    brand_rank = i + 1
                    break

        brand_rank_out_of = len(all_mentioned)

        # Sentiment estimation around brand mentions
        sentiment_float = 0.0
        sentiment_label = "not_mentioned"
        if brand_mentioned:
            sentiment_float = _estimate_sentiment(
                response_text,
                brand_name,
                aliases=list(brand_entity.terms),
            )
            if sentiment_float > 0.15:
                sentiment_label = "positive"
            elif sentiment_float < -0.15:
                sentiment_label = "negative"
            else:
                sentiment_label = "neutral"

        # Title / heading detection
        in_title = False
        if brand_mentioned:
            in_title = _detect_title_mention(
                response_text, brand_name, aliases=list(brand_entity.terms)
            )

        # Visibility score (0-100) reusing module_F citation-score weights
        visibility_score = int(_compute_citation_score(
            citation_present=False,
            mention_present=brand_mentioned,
            mention_position=brand_rank,       # 1-based rank; None if not mentioned
            mention_sentiment=sentiment_float,
            mention_in_title=in_title,
        ))

        return {
            "brand_mentioned": brand_mentioned,
            "brand_mention_count": brand_mention_count,
            "brand_rank": brand_rank,
            "brand_rank_out_of": brand_rank_out_of,
            "sentiment": sentiment_label,
            "in_title": in_title,
            "visibility_score": visibility_score,
            "all_mentioned_brands": [
                {"name": b["display_name"], "count": b["count"]}
                for b in all_mentioned
            ],
            "competitors_mentioned": [
                {"name": s["display_name"], "count": s["count"]}
                for s in comp_stats_present
            ],
            "_brand_first_pos": brand_first_pos,
        }

    @staticmethod
    def _build_analysis_prompt(
        user_prompt: str,
        brand_name: str,
        brand_domain: str,
        competitors: list,
    ) -> tuple:
        """
        Returns (system_message, user_message).

        The system message instructs the AI to answer normally and then append a
        single-line JSON block at the very end — no secondary API call needed.
        """
        brand_label = brand_name or brand_domain or "the brand"
        competitors_str = json.dumps(competitors or [])
        system_msg = (
            "You are a helpful AI assistant. Answer every user question fully and accurately.\n\n"
            "MANDATORY OUTPUT FORMAT (must follow for every single response):\n"
            "1. Write your complete answer to the user's question.\n"
            "2. On the very last line of your response, write the word ANALYSIS: followed immediately "
            "by a single-line JSON object — no markdown fences, no extra text after it.\n\n"
            "Example final line (replace values with real data):\n"
            f'ANALYSIS: {{"brand_mentioned":false,"brand_mention_count":0,"brand_rank":null,'
            f'"mention_position":"not_mentioned","sentiment":"not_mentioned","in_title":false,'
            f'"all_mentioned_brands":[],"competitors_mentioned":[]}}\n\n'
            f'Brand to track: "{brand_label}" (domain: "{brand_domain}")\n'
            f'Competitors list: {competitors_str}\n\n'
            "Field definitions:\n"
            "  brand_mentioned       true if the brand appears anywhere in YOUR answer\n"
            "  brand_mention_count   total number of times the brand is mentioned\n"
            "  brand_rank            1-based position by first appearance among ALL brands (1=earliest), null if absent\n"
            "  mention_position      which third of your answer the brand first appears: early/middle/late/not_mentioned\n"
            "  sentiment             tone around the brand specifically: positive/negative/neutral/not_mentioned\n"
            "  in_title              true only if brand appears inside a ## heading or **bold** label\n"
            "  all_mentioned_brands  every brand/product/tool mentioned in your answer with rank and count\n"
            "  competitors_mentioned only brands from the Competitors list above that appeared in your answer\n"
            "IMPORTANT: The ANALYSIS: line must be the absolute last line. Do not add anything after it."
        )
        return system_msg, user_prompt

    @staticmethod
    def _parse_combined_response(
        raw: str,
        brand_name: str,
        brand_domain: str,
        competitors: list,
    ) -> tuple:
        """
        Split the combined LLM output into (answer_text, analysis_dict).

        The AI is instructed (via system message) to append a JSON line at the end.
        This method finds the last JSON object in the response that contains
        'brand_mentioned', strips it, and returns the clean answer text + parsed data.
        Falls back to local regex if the JSON is missing or malformed.
        """
        if not raw:
            fallback = BrandPipeline._analyze_response_for_brand("", brand_name, brand_domain, competitors)
            fallback["mention_position"] = "not_mentioned"
            return "", fallback

        # ── 1. Find the ANALYSIS: marker (last occurrence) ──────────────────────────
        # The system message tells every model to end with:
        #   ANALYSIS: {"brand_mentioned":..., ...}
        # Split on the last occurrence so prose in the answer can't confuse it.
        # _extract_json handles markdown fences + surrounding whitespace/prose.
        data = None
        answer_text = raw.strip()

        if "ANALYSIS:" in raw:
            parts = raw.rsplit("ANALYSIS:", 1)
            answer_text = parts[0].strip()
            data = BrandPipeline._extract_json(parts[1].strip())

        # Clean up any instruction artefacts some models echo back
        answer_text = re.sub(
            r"MANDATORY OUTPUT FORMAT.*$", "", answer_text, flags=re.DOTALL
        ).strip()

        if data and isinstance(data, dict) and "brand_mentioned" in data:
            brand_mentioned = bool(data.get("brand_mentioned", False))
            brand_mention_count = max(0, int(data.get("brand_mention_count") or 0))

            raw_rank = data.get("brand_rank")
            brand_rank: int | None = None
            if raw_rank is not None:
                try:
                    brand_rank = int(raw_rank)
                except (ValueError, TypeError):
                    brand_rank = None

            mention_position = data.get("mention_position") or "not_mentioned"
            if mention_position not in ("early", "middle", "late", "not_mentioned"):
                mention_position = "not_mentioned"
            if not brand_mentioned:
                mention_position = "not_mentioned"

            sentiment = data.get("sentiment") or "not_mentioned"
            if sentiment not in ("positive", "negative", "neutral", "not_mentioned"):
                sentiment = "not_mentioned" if not brand_mentioned else "neutral"

            in_title = bool(data.get("in_title", False))

            all_mentioned_brands: list = []
            for b in (data.get("all_mentioned_brands") or []):
                if isinstance(b, dict) and b.get("name"):
                    all_mentioned_brands.append({
                        "name": str(b["name"]),
                        "count": max(1, int(b.get("count") or 1)),
                    })

            brand_rank_out_of = len(all_mentioned_brands)

            competitors_mentioned: list = []
            for c in (data.get("competitors_mentioned") or []):
                if isinstance(c, dict) and c.get("name"):
                    competitors_mentioned.append({
                        "name": str(c["name"]),
                        "count": max(1, int(c.get("count") or 1)),
                    })

            from modules.module_F.competitor_ai_intelligence import _compute_citation_score
            sentiment_float = (
                1.0 if sentiment == "positive"
                else (-1.0 if sentiment == "negative" else 0.0)
            )
            visibility_score = int(_compute_citation_score(
                citation_present=False,
                mention_present=brand_mentioned,
                mention_position=brand_rank,
                mention_sentiment=sentiment_float,
                mention_in_title=in_title,
            ))

            _brand_first_pos = -1
            total_len = len(answer_text)
            if brand_mentioned and mention_position != "not_mentioned" and total_len > 0:
                if mention_position == "early":
                    _brand_first_pos = int(total_len * 0.10)
                elif mention_position == "middle":
                    _brand_first_pos = int(total_len * 0.50)
                elif mention_position == "late":
                    _brand_first_pos = int(total_len * 0.80)

            return answer_text, {
                "brand_mentioned": brand_mentioned,
                "brand_mention_count": brand_mention_count,
                "brand_rank": brand_rank,
                "brand_rank_out_of": brand_rank_out_of,
                "sentiment": sentiment,
                "in_title": in_title,
                "visibility_score": visibility_score,
                "all_mentioned_brands": all_mentioned_brands,
                "competitors_mentioned": competitors_mentioned,
                "_brand_first_pos": _brand_first_pos,
                "mention_position": mention_position,
            }

        # Fallback: local regex on the answer text
        logger.warning("Combined response JSON block missing or malformed, falling back to local regex")
        fallback = BrandPipeline._analyze_response_for_brand(
            answer_text, brand_name, brand_domain, competitors
        )
        mention_position = "not_mentioned"
        if fallback["brand_mentioned"] and answer_text:
            fp = fallback["_brand_first_pos"]
            tl = len(answer_text)
            if fp >= 0 and tl > 0:
                ratio = fp / tl
                mention_position = "early" if ratio < 0.33 else ("middle" if ratio < 0.66 else "late")
        fallback["mention_position"] = mention_position
        return answer_text, fallback

    # kept for backward-compat (module_F imports) — do not remove
    @staticmethod
    async def _ai_analyze_response_for_brand(
        response_text: str,
        brand_name: str,
        brand_domain: str,
        competitors: list,
    ) -> dict:
        """Deprecated — use _build_analysis_prompt + _parse_combined_response instead."""
        raise NotImplementedError("Use _build_analysis_prompt + _parse_combined_response instead")

    @staticmethod
    async def stage5_execution(prompts: list, brand_profile: dict, job_id: str) -> list:
        """Stage 5: LLM Execution — primary call includes brand analysis JSON block."""
        semaphore = asyncio.Semaphore(10)

        brand_name: str = brand_profile.get("brand_name") or ""
        brand_domain: str = brand_profile.get("website_url") or ""
        competitors: list = [
            c for c in (brand_profile.get("competitors_mentioned") or [])
            if isinstance(c, str) and c.strip()
        ]

        async def _run_prompt(prompt_doc: dict, provider: str):
            async with semaphore:
                start = datetime.utcnow()
                        # System message tells the AI to append a JSON line after its answer.
                # Providers: OpenAI reads system role in messages; Claude reads input_data["system"];
                # Gemini concatenates all message content — all three get the instruction.
                system_msg, user_msg = BrandPipeline._build_analysis_prompt(
                    prompt_doc["prompt"], brand_name, brand_domain, competitors
                )
                res = await execute_task(
                    task_name="ai_execution_v2",
                    input_data={
                        "messages": [
                            {"role": "system", "content": system_msg},
                            {"role": "user",   "content": user_msg},
                        ],
                        "system": system_msg,   # Claude dedicated system param
                    },
                    provider=provider,
                    options={
                        "model": "gpt-4o" if provider == "openai" else (
                            "gemini-2.0-flash" if provider == "gemini" else "claude-3-haiku-20240307"
                        ),
                        "temperature": 0.3,
                        "max_tokens": 1400,  # extra headroom for answer + JSON line
                        "skip_cache": True,  # never serve stale cached analysis
                    },
                )
                latency = int((datetime.utcnow() - start).total_seconds() * 1000)
                raw_response = res.data if res.success else ""

                # Parse answer text + brand analysis from the combined response
                full_response, analysis = BrandPipeline._parse_combined_response(
                    raw_response, brand_name, brand_domain, competitors
                )

                mention_position = analysis.pop("mention_position", "not_mentioned")

                return {
                    "job_id": job_id,
                    "prompt": prompt_doc["prompt"],
                    "model_name": provider,
                    "full_response_text": full_response,
                    # Brand presence fields
                    "brand_mentioned": analysis["brand_mentioned"],
                    "brand_mention_count": analysis["brand_mention_count"],
                    "brand_rank": analysis["brand_rank"],
                    "brand_rank_out_of": analysis["brand_rank_out_of"],
                    "mention_position": mention_position,
                    "sentiment": analysis["sentiment"],
                    "in_title": analysis["in_title"],
                    "visibility_score": analysis["visibility_score"],
                    # Competitor / multi-brand fields
                    "competitors_mentioned": analysis["competitors_mentioned"],
                    "all_mentioned_brands": analysis["all_mentioned_brands"],
                    "executed_at": start,
                    "latency_ms": latency,
                }

        providers = ["openai", "gemini", "claude"]
        tasks = [_run_prompt(p, provider) for p in prompts for provider in providers]
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

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 7: Unbranded Category Discovery
    # Ask LLMs which brands lead the category WITHOUT ever mentioning our brand.
    # This gives an organic, unbiased competitive landscape.
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def _build_discovery_prompts(brand_profile: dict) -> list:
        """Build 5 unbranded prompts that discover the competitive landscape."""
        product_category = (brand_profile.get("product_category") or "").strip()
        core_use_cases = brand_profile.get("core_use_cases") or []
        target_audience = brand_profile.get("target_audience") or []

        # Resolve audience string
        audience_str = ""
        if isinstance(target_audience, list):
            segs = []
            for item in target_audience[:2]:
                if isinstance(item, dict):
                    segs.append(str(item.get("segment") or ""))
                elif isinstance(item, str):
                    segs.append(item)
            audience_str = " and ".join(s for s in segs if s)
        elif isinstance(target_audience, str):
            audience_str = target_audience

        # Resolve primary use-case string
        use_case_str = ""
        if isinstance(core_use_cases, list) and core_use_cases:
            first = core_use_cases[0]
            use_case_str = str(first.get("use_case") or first) if isinstance(first, dict) else str(first)
        elif isinstance(core_use_cases, str):
            use_case_str = core_use_cases

        category = product_category or "software"
        audience = audience_str or "businesses"
        use_case = use_case_str or category

        return [
            f"What are the top {category} tools available today? List the most popular ones with brief descriptions.",
            f"Which {category} platforms are considered industry leaders? Rank them by adoption and capabilities.",
            f"What {category} solutions do most {audience} use? List the leading options.",
            f"Compare the best {category} software on the market. Which ones are considered the gold standard?",
            f"What are the most recommended tools for {use_case}? List the top solutions with their key strengths.",
        ]

    @staticmethod
    def _extract_brands_from_text(text: str) -> list:
        """
        Fallback: extract brand names from structured list text when LLM doesn't
        output a DISCOVERY: block.

        Handles patterns like:
          1. **Semrush** — description
          - Ahrefs: description
          ### Moz
          1. Google Search Console
        Returns [{name, rank}] in order of appearance.
        """
        # Patterns that signal a list item with a brand name
        _LIST_PATTERNS = [
            # numbered: "1. **BrandName**" or "1. BrandName"
            re.compile(r"^\s*\d+[\.\)]\s+\*{0,2}([A-Z][A-Za-z0-9 \.\+&]{1,50})\*{0,2}(?:\s*[-–:–]|\s*\(|\s*$)", re.MULTILINE),
            # bullet: "- **BrandName**" or "* BrandName"
            re.compile(r"^\s*[-\*]\s+\*{0,2}([A-Z][A-Za-z0-9 \.\+&]{1,50})\*{0,2}(?:\s*[-–:–]|\s*\(|\s*$)", re.MULTILINE),
            # markdown heading: "### BrandName" or "#### BrandName"
            re.compile(r"^#{1,4}\s+([A-Z][A-Za-z0-9 \.\+&]{1,50})\s*$", re.MULTILINE),
        ]
        seen: set = set()
        brands: list = []
        rank = 1
        for pattern in _LIST_PATTERNS:
            for m in pattern.finditer(text):
                name = m.group(1).strip()
                # Skip generic phrases
                if len(name) < 2 or name.lower() in {
                    "here", "some", "top", "best", "note", "also", "these",
                    "the", "this", "that", "both", "other", "each", "its",
                }:
                    continue
                key = name.lower()
                if key not in seen:
                    seen.add(key)
                    brands.append({"name": name, "rank": rank})
                    rank += 1
        return brands

    @staticmethod
    def _parse_discovery_response(raw_response: str) -> tuple:
        """
        Parse a discovery response. Tries two strategies:
          1. Look for a DISCOVERY: JSON block appended by the LLM (case-insensitive).
          2. Fallback: extract brand names from list structure in the answer text.

        Returns (answer_text, brands_list).
        """
        if not raw_response:
            return "", []

        # Strategy 1: DISCOVERY: JSON block (case-insensitive)
        discovery_match = re.search(r"DISCOVERY\s*:", raw_response, re.IGNORECASE)
        if discovery_match:
            split_pos = discovery_match.start()
            answer_text = raw_response[:split_pos].strip()
            discovery_raw = raw_response[discovery_match.end():].strip()
            try:
                data = BrandPipeline._extract_json(discovery_raw)
                brands_raw = (data or {}).get("brands") or []
                validated = []
                for b in brands_raw:
                    if isinstance(b, dict) and b.get("name"):
                        name = str(b["name"]).strip()
                        rank = b.get("rank")
                        try:
                            rank = int(rank)
                        except (ValueError, TypeError):
                            rank = None
                        if name:
                            validated.append({"name": name, "rank": rank})
                if validated:
                    return answer_text, validated
            except Exception:
                pass
            # JSON parse failed — fall through to text extraction on answer_text
            return answer_text, BrandPipeline._extract_brands_from_text(answer_text)

        # Strategy 2: No DISCOVERY block — extract from list structure
        return raw_response, BrandPipeline._extract_brands_from_text(raw_response)

    @staticmethod
    def _aggregate_discovery_results(results: list, brand_name: str) -> list:
        """
        Aggregate raw per-prompt/per-provider discovery results into a ranked
        competitive landscape list.

        Each entry: {name, mention_count, avg_rank, providers_mentioned, is_our_brand, organic_rank}
        """
        brand_stats: dict = {}

        for r in results:
            provider = str(r.get("model_name") or "")
            for b in (r.get("brands_discovered") or []):
                name = str(b.get("name") or "").strip()
                rank = b.get("rank")
                if not name:
                    continue
                if name not in brand_stats:
                    brand_stats[name] = {
                        "name": name,
                        "mention_count": 0,
                        "ranks": [],
                        "providers_mentioned": [],
                        "is_our_brand": False,
                    }
                brand_stats[name]["mention_count"] += 1
                if rank is not None:
                    brand_stats[name]["ranks"].append(rank)
                if provider and provider not in brand_stats[name]["providers_mentioned"]:
                    brand_stats[name]["providers_mentioned"].append(provider)

        # Mark our brand using name match
        if brand_name:
            bn_lower = brand_name.strip().lower()
            for name, stats in brand_stats.items():
                if name.strip().lower() == bn_lower or bn_lower in name.strip().lower():
                    stats["is_our_brand"] = True

        # Compute avg_rank and clean up
        landscape = []
        for stats in brand_stats.values():
            ranks = stats.pop("ranks", [])
            stats["avg_rank"] = round(sum(ranks) / len(ranks), 2) if ranks else None
            landscape.append(stats)

        # Sort: most mentioned first, then by avg_rank ascending (lower = better)
        landscape.sort(key=lambda x: (-x["mention_count"], x["avg_rank"] or 99))

        # Assign organic_rank position
        for i, entry in enumerate(landscape):
            entry["organic_rank"] = i + 1

        return landscape

    @staticmethod
    async def stage7_category_discovery(brand_profile: dict, job_id: str) -> list:
        """
        Stage 7: Unbranded Category Discovery.

        Sends 5 category-level prompts to GPT-4o, Gemini 1.5 Flash, and Claude 3 Haiku
        WITHOUT mentioning the brand name. Parses which brands each LLM organically
        recommends and at what rank. Stores raw responses + an aggregated
        competitive_landscape in MongoDB.

        Returns the competitive_landscape list.
        """
        brand_name = str(brand_profile.get("brand_name") or "").strip()
        discovery_prompts = BrandPipeline._build_discovery_prompts(brand_profile)

        system_msg = (
            "You are a market intelligence analyst providing objective, comprehensive analysis.\n"
            "Answer the user's question by listing specific product and company names.\n"
            "After your answer, append EXACTLY one line starting with 'DISCOVERY:' followed by JSON:\n"
            "DISCOVERY: {\"brands\": [{\"name\": \"BrandName\", \"rank\": 1}, {\"name\": \"Other\", \"rank\": 2}]}\n"
            "Rules for the DISCOVERY line:\n"
            "- List every brand/product name you mentioned, in order of prominence (rank 1 = most prominent)\n"
            "- Include only proper brand/product names, not generic category terms\n"
            "- Aim for 5-10 brands if the category has that many well-known players\n"
            "- The DISCOVERY line must be valid JSON on a single line at the very end"
        )

        semaphore = asyncio.Semaphore(6)

        async def _run_discovery(prompt: str, provider: str):
            async with semaphore:
                start = datetime.utcnow()
                try:
                    res = await execute_task(
                        task_name="ai_execution_v2",
                        input_data={
                            "messages": [
                                {"role": "system", "content": system_msg},
                                {"role": "user",   "content": prompt},
                            ],
                            "system": system_msg,
                        },
                        provider=provider,
                        options={
                            "model": (
                                "gpt-4o" if provider == "openai"
                                else "gemini-1.5-flash" if provider == "gemini"
                                else "claude-3-haiku-20240307"
                            ),
                            "temperature": 0.3,
                            "max_tokens": 1200,
                            "skip_cache": True,
                        },
                    )
                    raw = res.data if res.success else ""
                except Exception as exc:
                    logger.warning(f"Stage 7 discovery failed [{provider}]: {exc}")
                    return None

                latency = int((datetime.utcnow() - start).total_seconds() * 1000)
                answer_text, brands = BrandPipeline._parse_discovery_response(raw)

                return {
                    "job_id": job_id,
                    "prompt": prompt,
                    "model_name": provider,
                    "answer_text": answer_text,
                    "brands_discovered": brands,
                    "executed_at": start,
                    "latency_ms": latency,
                }

        providers = ["openai", "gemini", "claude"]
        tasks = [
            _run_discovery(prompt, provider)
            for prompt in discovery_prompts
            for provider in providers
        ]
        raw_results = await asyncio.gather(*tasks, return_exceptions=True)
        valid_results = [r for r in raw_results if r is not None and not isinstance(r, Exception)]

        # Persist raw discovery responses
        if valid_results:
            mongo_manager.brand_category_discovery.delete_many({"job_id": job_id})
            mongo_manager.brand_category_discovery.insert_many(valid_results)

        # Aggregate into competitive landscape
        competitive_landscape = BrandPipeline._aggregate_discovery_results(valid_results, brand_name)

        # Persist aggregated landscape (upsert)
        mongo_manager.brand_competitive_landscape.replace_one(
            {"job_id": job_id},
            {
                "job_id": job_id,
                "competitive_landscape": competitive_landscape,
                "total_discovery_prompts": len(discovery_prompts) * len(providers),
                "total_discovery_responses": len(valid_results),
                "created_at": datetime.utcnow(),
            },
            upsert=True,
        )

        logger.info(
            f"Stage 7 complete for job {job_id}: "
            f"{len(valid_results)} responses, {len(competitive_landscape)} brands discovered"
        )
        return competitive_landscape

    @staticmethod
    async def run_full_pipeline(url: str, job_id: str):
        logger.info(f"Starting full pipeline for {url} (Job: {job_id})")
        context = await BrandPipeline.stage1_crawl(url, job_id)
        profile = await BrandPipeline.stage2_description(context, url, job_id)
        topics = await BrandPipeline.stage3_topics(profile, context, job_id)
        prompts = await BrandPipeline.stage4_prompts(topics, profile, job_id)
        results = await BrandPipeline.stage5_execution(prompts, profile, job_id)
        await BrandPipeline.stage6_scoring(job_id)
        await BrandPipeline.stage7_category_discovery(profile, job_id)
        logger.info(f"Pipeline completed for {url}")
        return profile

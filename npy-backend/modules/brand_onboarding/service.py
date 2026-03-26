"""
Brand description generator service.

Fetches a website's HTML (from S3 or directly), converts it to plain text,
and uses OpenAI to produce a concise 3-4 line brand description suitable
for onboarding.  Stores the result in MongoDB for later retrieval.
"""

import logging
import re
from datetime import datetime

import aiohttp
from bs4 import BeautifulSoup

from orchestrator.checkpoint.executor import execute_task
from utils.mongo import mongo_manager
from utils.storage import load_raw_html

logger = logging.getLogger("brand_onboarding")

# Tags whose content is never useful for a brand description
_STRIP_TAGS = [
    "script", "style", "noscript", "svg", "iframe",
    "template", "nav", "footer", "header",
]

# Maximum characters of website text sent to the LLM prompt
_MAX_TEXT_CHARS = 12_000

_BRAND_DESCRIPTION_PROMPT = """Based on this website content:
{raw_crawled_text}

Write a 3-4 line brand description in third-person.
Cover: what the brand does, who they help, what services/products they offer, and their core goal/mission.

Use a factual, professional tone. No fluff.
Write it like a business directory listing."""


def _html_to_plain_text(html: str) -> str:
    """Strip HTML to readable plain text, removing non-content elements."""
    from bs4 import Comment

    soup = BeautifulSoup(html, "lxml")
    # Remove non-content tags
    for tag in soup.find_all(_STRIP_TAGS):
        tag.decompose()
    # Remove HTML comments
    for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
        comment.extract()
    text = soup.get_text(separator=" ")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:_MAX_TEXT_CHARS]


async def fetch_html(url: str) -> str:
    """Fetch raw HTML from a URL (same pattern as quick_start homepage fetch)."""
    full_url = url if url.startswith(("http://", "https://")) else f"https://{url}"
    timeout = aiohttp.ClientTimeout(total=30)
    headers = {"User-Agent": "Mozilla/5.0 (compatible; YogreetBot/1.0)"}

    async with aiohttp.ClientSession(headers=headers) as session:
        async with session.get(full_url, timeout=timeout, allow_redirects=True) as resp:
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status} fetching {full_url}")
            html = await resp.text(errors="replace")
            logger.info(f"Fetched {len(html)} bytes from {full_url}")
            return html


async def generate_brand_description(url: str, job_id: str | None = None) -> str:
    """
    End-to-end: fetch URL → HTML → plain text → ChatGPT → brand description.

    If *job_id* is provided the HTML is loaded from S3 first (already stored
    by the quick_start pipeline).  Falls back to a live HTTP fetch when the
    S3 object is not available yet.

    When *job_id* is given the generated description is also persisted to
    the ``module_e`` collection so the frontend can retrieve it later via
    ``get_stored_description(job_id)``.
    """
    html = ""

    # 1. Try S3 first when we know the job
    if job_id:
        try:
            html = await load_raw_html(job_id)
            if html:
                logger.info(f"Loaded HTML from S3 for job {job_id} ({len(html)} bytes)")
        except Exception as exc:
            logger.warning(f"S3 load failed for job {job_id}: {exc}")

    # 2. Fall back to live fetch
    if not html:
        html = await fetch_html(url)

    # 3. Convert to plain text
    plain_text = _html_to_plain_text(html)
    if not plain_text:
        raise RuntimeError("Could not extract any text from the website")

    # 4. Build prompt and call OpenAI via the unified orchestrator
    prompt = _BRAND_DESCRIPTION_PROMPT.format(raw_crawled_text=plain_text)

    response = await execute_task(
        task_name="brand_description",
        input_data={"prompt": prompt},
        provider="openai",
        options={
            "model": "gpt-4o-mini",
            "temperature": 0.4,
            "max_tokens": 300,
        },
    )

    if not response.success:
        raise RuntimeError(f"OpenAI call failed: {response.error}")

    description = (response.data or "").strip()
    if not description:
        raise RuntimeError("OpenAI returned an empty description")

    # 5. Persist to MongoDB when we have a job context
    if job_id:
        await _store_description(job_id, description)

    logger.info(f"Generated brand description for {url} ({len(description)} chars)")
    return description


async def _store_description(job_id: str, description: str) -> None:
    """Upsert ``brand_description`` into the ``module_e`` document for this job."""
    try:
        now = datetime.utcnow()
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "jobId": job_id,
                    "brand_description": description,
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        logger.info(f"Brand description stored in DB for job {job_id}")
    except Exception as exc:
        logger.error(f"Failed to store brand description for {job_id}: {exc}", exc_info=True)


async def get_stored_description(job_id: str) -> str | None:
    """Return the stored brand description for *job_id*, or ``None``."""
    try:
        doc = mongo_manager.module_e.find_one(
            {"jobId": job_id},
            {"brand_description": 1, "_id": 0},
        )
        if doc:
            return doc.get("brand_description")
    except Exception as exc:
        logger.error(f"Failed to read brand description for {job_id}: {exc}", exc_info=True)
    return None


async def get_stored_onboarding_data(job_id: str) -> dict | None:
    """Return all stored onboarding data for *job_id*, or ``None``."""
    try:
        doc = mongo_manager.module_e.find_one(
            {"jobId": job_id},
            {
                "brand_description": 1,
                "brand_topics_generated": 1,
                "brand_topics_selected": 1,
                "brand_prompts_generated": 1,
                "brand_prompts_selected": 1,
                "brand_prompt_results": 1,
                "_id": 0,
            },
        )
        if doc:
            return {
                "description": doc.get("brand_description"),
                "topics_generated": doc.get("brand_topics_generated", []),
                "topics_selected": doc.get("brand_topics_selected", []),
                "prompts_generated": doc.get("brand_prompts_generated", []),
                "prompts_selected": doc.get("brand_prompts_selected", []),
                "prompt_results": doc.get("brand_prompt_results", []),
            }
    except Exception as exc:
        logger.error(f"Failed to read onboarding data for {job_id}: {exc}", exc_info=True)
    return None


# ──────────────────────────────────────────────────────────────────────
# Brand Topics Generation
# ──────────────────────────────────────────────────────────────────────

_BRAND_TOPICS_PROMPT = """You are an expert brand strategist. Based on the following brand information, generate exactly 7 short topic phrases that a user of this brand would want to track in AI search results.

Brand Name: {brand_name}
Brand Website: {url}
Brand Description: {brand_description}

Each topic should be:
- A short phrase (5-10 words) describing a search intent or question area
- Relevant to what the brand's target audience would search for
- Focused on areas where the brand competes for visibility
- Written from the searcher's perspective, not the brand's

Return ONLY a JSON array of 7 strings. No numbering, no explanations, no markdown.
Example format: ["Topic one here", "Topic two here", "Topic three here"]"""


async def generate_brand_topics(
    url: str,
    brand_name: str,
    brand_description: str,
    job_id: str | None = None,
) -> list[str]:
    """
    Generate 7 AI-suggested topics based on brand info using OpenAI.
    Persists results to MongoDB when job_id is provided.
    """
    import json as _json

    prompt = _BRAND_TOPICS_PROMPT.format(
        brand_name=brand_name,
        url=url,
        brand_description=brand_description,
    )

    response = await execute_task(
        task_name="brand_topics",
        input_data={"prompt": prompt},
        provider="openai",
        options={
            "model": "gpt-4o-mini",
            "temperature": 0.7,
            "max_tokens": 500,
        },
    )

    if not response.success:
        raise RuntimeError(f"OpenAI call failed: {response.error}")

    raw = (response.data or "").strip()
    if not raw:
        raise RuntimeError("OpenAI returned empty topics response")

    # Parse the JSON array from the response
    try:
        topics = _json.loads(raw)
        if not isinstance(topics, list):
            raise ValueError("Response is not a list")
        topics = [str(t).strip() for t in topics if str(t).strip()]
    except (ValueError, _json.JSONDecodeError):
        # Try to extract lines if JSON parsing fails
        topics = [line.strip().strip('"').strip("'").lstrip("- ").strip()
                  for line in raw.split("\n") if line.strip()]
        topics = [t for t in topics if t and not t.startswith("[") and not t.startswith("]")]

    if not topics:
        raise RuntimeError("Could not parse topics from OpenAI response")

    # Persist when we have a job context
    if job_id:
        await _store_topics(job_id, topics)

    logger.info(f"Generated {len(topics)} topics for {brand_name}")
    return topics


async def _store_topics(job_id: str, topics: list[str]) -> None:
    """Store generated topics in the module_e document for this job."""
    try:
        now = datetime.utcnow()
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "brand_topics_generated": topics,
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        logger.info(f"Brand topics stored in DB for job {job_id}")
    except Exception as exc:
        logger.error(f"Failed to store brand topics for {job_id}: {exc}", exc_info=True)


async def save_brand_topics(job_id: str, selected_topics: list[str]) -> None:
    """Save the user's selected topics to MongoDB."""
    try:
        now = datetime.utcnow()
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "brand_topics_selected": selected_topics,
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        logger.info(f"Saved {len(selected_topics)} selected topics for job {job_id}")
    except Exception as exc:
        logger.error(f"Failed to save selected topics for {job_id}: {exc}", exc_info=True)
        raise


# ──────────────────────────────────────────────────────────────────────
# Brand Prompts Generation
# ──────────────────────────────────────────────────────────────────────

_BRAND_PROMPTS_PROMPT = """You are an expert at crafting search prompts for monitoring brand visibility in AI-generated responses.

Brand Name: {brand_name}
Brand Description: {brand_description}
Selected Topics: {selected_topics}

Generate exactly 10 search prompts that someone might type into an AI assistant (like ChatGPT, Perplexity, or Claude) related to the topics above. Each prompt should be a natural question or request that a real user would ask.

Distribute the prompts across these 5 types (roughly 2 per type):
- informational: Questions seeking knowledge or explanations
- commercial: Questions comparing products/services before a purchase decision
- comparative: Questions explicitly comparing brands or solutions
- transactional: Questions with intent to buy, sign up, or take action
- agent-style: Complex multi-step requests that an AI agent would handle

Return ONLY a valid JSON array of objects, each with "prompt" and "type" keys.
Example format: [{{"prompt": "What is the best tool for X?", "type": "informational"}}, {{"prompt": "Compare X vs Y for Z", "type": "comparative"}}]

No markdown, no explanations, no numbering. Just the JSON array."""


async def generate_brand_prompts(
    brand_name: str,
    brand_description: str,
    selected_topics: list[str],
    job_id: str | None = None,
) -> list[dict]:
    """
    Generate 10 AI prompts based on brand info and selected topics using OpenAI.
    Persists results to MongoDB when job_id is provided.
    """
    import json as _json

    prompt = _BRAND_PROMPTS_PROMPT.format(
        brand_name=brand_name,
        brand_description=brand_description,
        selected_topics=", ".join(selected_topics),
    )

    response = await execute_task(
        task_name="brand_prompts",
        input_data={"prompt": prompt},
        provider="openai",
        options={
            "model": "gpt-4o-mini",
            "temperature": 0.7,
            "max_tokens": 1500,
        },
    )

    if not response.success:
        raise RuntimeError(f"OpenAI call failed: {response.error}")

    raw = (response.data or "").strip()
    if not raw:
        raise RuntimeError("OpenAI returned empty prompts response")

    # Parse the JSON array from the response
    try:
        prompts = _json.loads(raw)
        if not isinstance(prompts, list):
            raise ValueError("Response is not a list")
        # Validate each item has prompt and type
        valid_types = {"informational", "commercial", "comparative", "transactional", "agent-style"}
        prompts = [
            {"prompt": str(p.get("prompt", "")).strip(), "type": str(p.get("type", "informational")).strip()}
            for p in prompts
            if isinstance(p, dict) and p.get("prompt")
        ]
        # Normalize types
        for p in prompts:
            if p["type"] not in valid_types:
                p["type"] = "informational"
    except (ValueError, _json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not parse prompts from OpenAI response: {exc}")

    if not prompts:
        raise RuntimeError("Could not parse any prompts from OpenAI response")

    # Persist when we have a job context
    if job_id:
        await _store_prompts(job_id, prompts)

    logger.info(f"Generated {len(prompts)} prompts for {brand_name}")
    return prompts


async def _store_prompts(job_id: str, prompts: list[dict]) -> None:
    """Store generated prompts in the module_e document for this job."""
    try:
        now = datetime.utcnow()
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "brand_prompts_generated": prompts,
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        logger.info(f"Brand prompts stored in DB for job {job_id}")
    except Exception as exc:
        logger.error(f"Failed to store brand prompts for {job_id}: {exc}", exc_info=True)


async def save_brand_prompts(job_id: str, selected_prompts: list[str]) -> None:
    """Save the user's selected prompts to MongoDB."""
    try:
        now = datetime.utcnow()
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "brand_prompts_selected": selected_prompts,
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        logger.info(f"Saved {len(selected_prompts)} selected prompts for job {job_id}")
    except Exception as exc:
        logger.error(f"Failed to save selected prompts for {job_id}: {exc}", exc_info=True)
        raise


# ──────────────────────────────────────────────────────────────────────
# Brand Prompt Execution & Visibility Analysis
# ──────────────────────────────────────────────────────────────────────

import asyncio
import json as _json_mod

_PROVIDERS = {
    "openai": {"model": "gpt-4o-mini"},
    "gemini": {"model": "gemini-2.0-flash"},
    "claude": {"model": "claude-3-haiku-20240307"},
}

_BRAND_ANALYSIS_PROMPT = """You are a brand visibility analyst. Your job is to analyze an AI-generated response and extract structured data about brand mentions.

User's original query: "{prompt}"

AI response to analyze:
\"\"\"
{response}
\"\"\"

Target brand: "{brand_name}"

Instructions:
1. Read the entire AI response carefully.
2. Identify EVERY company, brand, product, service, or platform name mentioned in the response. These are all potential competitors.
3. Determine if "{brand_name}" (case-insensitive) appears anywhere in the response.
4. If the brand is mentioned, determine its position: divide the response into thirds — if the brand first appears in the first third, position is "first"; second third is "middle"; last third is "last". If not mentioned at all, position is "not mentioned".
5. List ALL other brands/companies/products/services/platforms mentioned in the response EXCEPT "{brand_name}" itself. Include every single one, even if only mentioned briefly.

Return this exact JSON structure:
{{
  "brand_mentioned": true or false,
  "brand_name": "{brand_name}",
  "mention_position": "first" or "middle" or "last" or "not mentioned",
  "competitors_mentioned": ["Brand1", "Brand2", "Brand3"],
  "brand_visibility_score": 0-100
}}

Scoring guide for brand_visibility_score:
- 0: Brand not mentioned at all
- 1-25: Brand mentioned but negatively or as a minor alternative
- 26-50: Brand mentioned alongside many competitors without distinction
- 51-75: Brand mentioned prominently or recommended among top options
- 76-100: Brand is the primary recommendation or featured most prominently

IMPORTANT: competitors_mentioned must include EVERY brand/company/product name found in the response other than "{brand_name}". Do not leave it empty if other brands are mentioned."""


async def _execute_single_prompt_for_provider(
    prompt_text: str,
    provider: str,
    brand_name: str,
) -> dict:
    """Send a prompt to one LLM provider and analyze the response for brand visibility."""
    model = _PROVIDERS[provider]["model"]

    # Step 1: Get the LLM's response to the prompt
    try:
        gen_response = await execute_task(
            task_name="brand_prompt_execute",
            input_data={"messages": [{"role": "user", "content": prompt_text}]},
            provider=provider,
            options={"model": model, "temperature": 0.7, "max_tokens": 1500},
        )
        if not gen_response.success:
            return {"response": "", "analysis": None, "error": f"Generation failed: {gen_response.error}"}
        llm_response = (gen_response.data or "").strip()
    except Exception as exc:
        logger.error(f"Prompt execution failed for {provider}: {exc}")
        return {"response": "", "analysis": None, "error": str(exc)}

    # Step 2: Analyze the response for brand visibility (same provider self-analysis)
    analysis_prompt = _BRAND_ANALYSIS_PROMPT.format(
        prompt=prompt_text,
        response=llm_response[:8000],  # Truncate very long responses
        brand_name=brand_name,
    )
    try:
        analysis_response = await execute_task(
            task_name="brand_prompt_analyze",
            input_data={"messages": [{"role": "user", "content": analysis_prompt}]},
            provider="openai",  # Use OpenAI for consistent JSON parsing
            options={"model": "gpt-4o-mini", "temperature": 0.1, "max_tokens": 800, "response_format": {"type": "json_object"}},
        )
        if not analysis_response.success:
            return {"response": llm_response, "analysis": None, "error": f"Analysis failed: {analysis_response.error}"}

        raw_analysis = (analysis_response.data or "").strip()
        # Strip markdown code fences if present
        if raw_analysis.startswith("```"):
            raw_analysis = raw_analysis.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        analysis = _json_mod.loads(raw_analysis)
    except (_json_mod.JSONDecodeError, Exception) as exc:
        logger.error(f"Analysis parsing failed for {provider}: {exc}")
        return {"response": llm_response, "analysis": None, "error": f"Analysis parse error: {exc}"}

    return {"response": llm_response, "analysis": analysis, "error": None}


async def execute_brand_prompts(
    brand_name: str,
    prompts: list[dict],
    job_id: str | None = None,
) -> list[dict]:
    """
    Execute all prompts against GPT, Gemini, and Claude in parallel.
    For each response, analyze brand visibility.
    Returns a list of results per prompt.
    """
    semaphore = asyncio.Semaphore(10)  # Limit concurrent LLM calls

    async def _run_with_semaphore(prompt_text: str, provider: str) -> dict:
        async with semaphore:
            return await _execute_single_prompt_for_provider(prompt_text, provider, brand_name)

    # Parse all prompts upfront
    parsed_prompts = []
    for p in prompts:
        prompt_text = p.get("prompt", "") if isinstance(p, dict) else str(p)
        prompt_type = p.get("type", "informational") if isinstance(p, dict) else "informational"
        parsed_prompts.append((prompt_text, prompt_type))

    # Launch ALL prompt × provider combinations at once (e.g. 10 × 3 = 30 tasks)
    providers = list(_PROVIDERS.keys())
    all_tasks = []
    for prompt_text, _ in parsed_prompts:
        for provider in providers:
            all_tasks.append(_run_with_semaphore(prompt_text, provider))

    all_task_results = await asyncio.gather(*all_tasks, return_exceptions=True)

    # Reshape flat results back into per-prompt structure
    all_results = []
    idx = 0
    for prompt_text, prompt_type in parsed_prompts:
        prompt_result = {
            "prompt": prompt_text,
            "type": prompt_type,
            "results": {},
        }
        for provider in providers:
            result = all_task_results[idx]
            idx += 1
            if isinstance(result, Exception):
                prompt_result["results"][provider] = {
                    "response": "",
                    "analysis": None,
                    "error": str(result),
                }
            else:
                prompt_result["results"][provider] = result
        all_results.append(prompt_result)

    # Store results in MongoDB
    if job_id:
        await _store_prompt_results(job_id, all_results)

    logger.info(f"Executed {len(prompts)} prompts across {len(_PROVIDERS)} providers for brand '{brand_name}'")
    return all_results


async def _store_prompt_results(job_id: str, results: list[dict]) -> None:
    """Store prompt execution results in MongoDB."""
    try:
        now = datetime.utcnow()
        mongo_manager.module_e.update_one(
            {"jobId": job_id},
            {
                "$set": {
                    "brand_prompt_results": results,
                    "brand_prompt_results_at": now,
                    "updatedAt": now,
                },
                "$setOnInsert": {"createdAt": now},
            },
            upsert=True,
        )
        logger.info(f"Stored prompt results for job {job_id}")
    except Exception as exc:
        logger.error(f"Failed to store prompt results for {job_id}: {exc}", exc_info=True)


async def get_brand_prompt_results(job_id: str) -> list[dict] | None:
    """Retrieve stored prompt execution results for a job."""
    try:
        doc = mongo_manager.module_e.find_one(
            {"jobId": job_id},
            {"brand_prompt_results": 1, "_id": 0},
        )
        if doc:
            return doc.get("brand_prompt_results")
    except Exception as exc:
        logger.error(f"Failed to read prompt results for {job_id}: {exc}", exc_info=True)
    return None

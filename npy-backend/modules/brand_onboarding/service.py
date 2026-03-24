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

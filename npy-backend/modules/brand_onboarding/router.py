"""
FastAPI router for brand onboarding endpoints.

Provides HTTP endpoints that the Node.js backend can call during
onboarding to generate / retrieve an AI-generated brand description
and suggest brand-relevant topics for tracking.
"""

import logging
from typing import Optional, List, Any
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .service import (
    generate_brand_description,
    get_stored_description,
    get_stored_onboarding_data,
    generate_brand_topics,
    save_brand_topics,
    generate_brand_prompts,
    save_brand_prompts,
    execute_brand_prompts,
    get_brand_prompt_results,
)

logger = logging.getLogger("brand_onboarding")

router = APIRouter(prefix="/brand-onboarding", tags=["brand-onboarding"])


class BrandDescriptionRequest(BaseModel):
    url: str = Field(..., min_length=1, description="Website URL to generate description from")
    job_id: Optional[str] = Field(None, description="Job ID to load HTML from S3 and store result in DB")

    @field_validator("url")
    @classmethod
    def normalise_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            v = f"https://{v}"
        return v


class BrandDescriptionResponse(BaseModel):
    description: str
    profile: Optional[Any] = None


class BrandTopicsRequest(BaseModel):
    url: str = Field(..., min_length=1, description="Website URL")
    brand_name: str = Field(..., min_length=1, description="Brand name")
    brand_description: str = Field(..., min_length=1, description="AI-generated brand description")
    job_id: Optional[str] = Field(None, description="Job ID for persistence")

    @field_validator("url")
    @classmethod
    def normalise_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith(("http://", "https://")):
            v = f"https://{v}"
        return v


class BrandTopicsResponse(BaseModel):
    topics: List[str]


class SaveBrandTopicsRequest(BaseModel):
    job_id: str = Field(..., min_length=1, description="Job ID")
    selected_topics: List[str] = Field(..., min_length=1, description="User-selected topics")


class BrandPromptsRequest(BaseModel):
    brand_name: str = Field(..., min_length=1, description="Brand name")
    brand_description: str = Field(..., min_length=1, description="AI-generated brand description")
    selected_topics: List[str] = Field(..., min_length=1, description="User-selected topics")
    job_id: Optional[str] = Field(None, description="Job ID for persistence")


class GeneratedPrompt(BaseModel):
    prompt: str
    type: str
    journey_stage: str = ""


class TopicPrompts(BaseModel):
    topic: str
    prompts: List[GeneratedPrompt]


class BrandPromptsResponse(BaseModel):
    topics: List[TopicPrompts]


class SaveBrandPromptsRequest(BaseModel):
    job_id: str = Field(..., min_length=1, description="Job ID")
    selected_prompts: List[str] = Field(..., min_length=1, description="User-selected prompts")


@router.post("/describe", response_model=BrandDescriptionResponse)
async def describe_brand(body: BrandDescriptionRequest):
    """
    Fetch the website at `url`, extract text, and return a ChatGPT-generated
    3-4 line brand description instantly.

    When ``job_id`` is provided the HTML is read from S3 (already stored by
    the quick_start pipeline) and the result is persisted to MongoDB so it
    can be retrieved later via ``GET /brand-onboarding/description/{job_id}``.
    """
    try:
        result = await generate_brand_description(body.url, job_id=body.job_id)
        return BrandDescriptionResponse(description=result["description"], profile=result.get("profile"))
    except Exception as exc:
        logger.error(f"Brand description failed for {body.url}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=502,
            content={"error": str(exc)},
        )


@router.get("/description/{job_id}", response_model=BrandDescriptionResponse)
async def get_description(job_id: str):
    """
    Return the previously generated brand description for a job.
    Returns 404 when no description has been generated yet.
    """
    result = await get_stored_description(job_id)
    if result:
        return BrandDescriptionResponse(description=result["description"], profile=result.get("profile"))
    return JSONResponse(
        status_code=404,
        content={"error": "Brand description not found for this job"},
    )


@router.get("/data/{job_id}")
async def get_onboarding_data(job_id: str):
    """
    Return all stored onboarding data (description, topics, prompts) for a job.
    Returns 404 when no data has been stored yet.
    """
    data = await get_stored_onboarding_data(job_id)
    if data:
        return data
    return JSONResponse(
        status_code=404,
        content={"error": "No onboarding data found for this job"},
    )


@router.post("/topics", response_model=BrandTopicsResponse)
async def gen_topics(body: BrandTopicsRequest):
    """
    Generate 7-8 AI-suggested topics based on the brand's URL, name,
    and description.  Topics are short phrases that describe what the
    brand's audience might search for.
    """
    try:
        topics = await generate_brand_topics(
            url=body.url,
            brand_name=body.brand_name,
            brand_description=body.brand_description,
            job_id=body.job_id,
        )
        return BrandTopicsResponse(topics=topics)
    except Exception as exc:
        logger.error(f"Brand topics generation failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=502,
            content={"error": str(exc)},
        )


@router.post("/topics/save")
async def save_topics(body: SaveBrandTopicsRequest):
    """
    Save the user's selected tracking topics for a job.
    """
    try:
        await save_brand_topics(body.job_id, body.selected_topics)
        return {"success": True}
    except Exception as exc:
        logger.error(f"Save brand topics failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": str(exc)},
        )


@router.post("/prompts", response_model=BrandPromptsResponse)
async def gen_prompts(body: BrandPromptsRequest):
    """
    Generate 9-10 AI prompts based on the user's selected topics,
    categorized by prompt type (informational, commercial, comparative,
    transactional, agent-style).
    """
    try:
        topic_groups = await generate_brand_prompts(
            brand_name=body.brand_name,
            brand_description=body.brand_description,
            selected_topics=body.selected_topics,
            job_id=body.job_id,
        )
        return BrandPromptsResponse(
            topics=[
                TopicPrompts(
                    topic=g["topic"],
                    prompts=[GeneratedPrompt(**p) for p in g["prompts"]],
                )
                for g in topic_groups
            ]
        )
    except Exception as exc:
        logger.error(f"Brand prompts generation failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=502,
            content={"error": str(exc)},
        )


@router.post("/prompts/save")
async def save_prompts(body: SaveBrandPromptsRequest):
    """
    Save the user's selected prompts for a job.
    """
    try:
        await save_brand_prompts(body.job_id, body.selected_prompts)
        return {"success": True}
    except Exception as exc:
        logger.error(f"Save brand prompts failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": str(exc)},
        )


# ──────────────────────────────────────────────────────────────────────
# Prompt Execution & Brand Visibility Analysis
# ──────────────────────────────────────────────────────────────────────


class ExecuteBrandPromptsRequest(BaseModel):
    brand_name: str = Field(..., min_length=1, description="Brand name to track visibility for")
    prompts: List[GeneratedPrompt] = Field(..., min_length=1, description="Prompts to execute")
    job_id: Optional[str] = Field(None, description="Job ID for persistence")


@router.post("/prompts/execute")
async def execute_prompts(body: ExecuteBrandPromptsRequest):
    """
    Execute all prompts against GPT, Gemini, and Claude.
    Analyzes each response for brand visibility and stores results.
    """
    try:
        prompts_as_dicts = [{"prompt": p.prompt, "type": p.type} for p in body.prompts]
        results = await execute_brand_prompts(
            brand_name=body.brand_name,
            prompts=prompts_as_dicts,
            job_id=body.job_id,
        )
        return {"results": results}
    except Exception as exc:
        logger.error(f"Prompt execution failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=502,
            content={"error": str(exc)},
        )


@router.get("/prompts/results/{job_id}")
async def get_prompt_results(job_id: str):
    """
    Retrieve stored prompt execution & visibility results for a job.
    """
    results = await get_brand_prompt_results(job_id)
    if results is not None:
        return {"results": results}
    return JSONResponse(
        status_code=404,
        content={"error": "No prompt results found for this job"},
    )

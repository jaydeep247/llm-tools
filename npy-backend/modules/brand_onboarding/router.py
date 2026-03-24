"""
FastAPI router for brand onboarding endpoints.

Provides HTTP endpoints that the Node.js backend can call during
onboarding to generate / retrieve an AI-generated brand description.
"""

import logging
from typing import Optional
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .service import generate_brand_description, get_stored_description

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
        description = await generate_brand_description(body.url, job_id=body.job_id)
        return BrandDescriptionResponse(description=description)
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
    description = await get_stored_description(job_id)
    if description:
        return BrandDescriptionResponse(description=description)
    return JSONResponse(
        status_code=404,
        content={"error": "Brand description not found for this job"},
    )

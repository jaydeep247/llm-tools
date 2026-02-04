"""
AI Citation Ranking Router (Module E)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from app.services.module_E.ai_ranking_service import AIRankingService

router = APIRouter()
service = AIRankingService()


class RankingAnalysisRequest(BaseModel):
    url: str
    prompts: Optional[List[str]] = None
    location: Optional[str] = None
    topic_override: Optional[str] = None


@router.post("/api/aeo/ranking-analysis")
async def ranking_analysis(request: RankingAnalysisRequest):
    """
    Analyze AI citation ranking: position per prompt, percentile rank, model-wise comparison.
    Uses DataForSEO LLM Responses API (ChatGPT, Claude, Gemini).
    If prompts is empty, auto-generates from page content (topic, audience, location).
    Supports optional location and topic_override.
    """
    try:
        if not request.url:
            raise HTTPException(status_code=400, detail="url is required")

        prompts = [p.strip() for p in (request.prompts or []) if p.strip()][:5]
        generated_prompts = None

        if not prompts:
            prompts = await service.generate_prompts_from_url(
                request.url,
                location_override=request.location,
                topic_override=request.topic_override,
                custom_prompts=None,
            )
            generated_prompts = prompts

        if not prompts:
            raise HTTPException(
                status_code=400,
                detail="Could not generate prompts from page. Provide prompts manually.",
            )

        result = await service.analyze_ranking(
            url=request.url,
            prompts=prompts,
            generated_prompts=generated_prompts,
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

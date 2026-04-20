"""
HTTP API for Module E Ask AI — same pattern as Module C / D / F routers.
"""

import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter
from fastapi import Query
from pydantic import BaseModel, Field

logger = logging.getLogger("module_e_http")

router = APIRouter(prefix="/module-e", tags=["module-e"])


class ConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class ModuleEAskAIRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1, max_length=8000)
    job_id: Optional[str] = None
    conversation_history: Optional[List[ConversationTurn]] = None


class SuggestedQuestionsRequest(BaseModel):
    project_id: str = Field(..., min_length=1)


class PerceptionRunRequest(BaseModel):
    job_id: str = Field(..., min_length=1)
    brand_name: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=1)
    market: str = Field(default="US")
    language: str = Field(default="English")
    properties: Optional[List[str]] = None
    models: Optional[List[str]] = None


@router.post("/ask-ai")
async def module_e_ask_ai_endpoint(body: ModuleEAskAIRequest) -> Dict[str, Any]:
    from modules.module_E.module_e_ask_ai import ask_module_e_ai

    history: Optional[List[Dict[str, str]]] = None
    if body.conversation_history:
        history = [{"role": t.role, "content": t.content} for t in body.conversation_history]

    result = await ask_module_e_ai(
        project_id=body.project_id.strip(),
        question=body.question.strip(),
        job_id=body.job_id.strip() if body.job_id else None,
        conversation_history=history,
    )
    return result


@router.post("/ask-ai/suggested-questions")
async def module_e_suggested_questions_endpoint(
    body: SuggestedQuestionsRequest,
) -> Dict[str, Any]:
    from modules.module_E.module_e_ask_ai import get_suggested_questions

    questions = get_suggested_questions(project_id=body.project_id.strip())
    return {"questions": questions}


@router.post("/perception/run")
async def run_perception_endpoint(body: PerceptionRunRequest) -> Dict[str, Any]:
    from modules.module_E.perception_analysis import run_perception_analysis

    return run_perception_analysis(
        job_id=body.job_id.strip(),
        brand_name=body.brand_name.strip(),
        domain=body.domain.strip(),
        market=(body.market or "US").strip(),
        language=(body.language or "English").strip(),
        properties=body.properties,
        models=body.models,
    )


@router.get("/perception")
async def get_perception_endpoint(job_id: str = Query(..., min_length=1)) -> Dict[str, Any]:
    from modules.module_E.perception_analysis import get_perception_analysis

    return get_perception_analysis(job_id=job_id.strip())


@router.get("/perception-sources")
async def get_perception_sources_endpoint(
    job_id: str = Query(..., min_length=1),
    customer_root_domain: str = Query(..., min_length=1, description="Root domain (used for Owned/Third-party filter)"),
    search: str = Query("", description="Free-text search for domain or URL"),
    llm: str = Query("All Models", description="All Models | ChatGPT | Gemini | Claude | or exact model_version"),
    property: str = Query("All Properties", description="All Properties | Pricing | Data Security | Integrations | ..."),
    type: str = Query("all", description="all | owned | third-party"),
    date_from: str | None = Query(None, description="ISO date or datetime, inclusive"),
    date_to: str | None = Query(None, description="ISO date or datetime, inclusive"),
    limit_domains: int = Query(200, ge=1, le=1000),
) -> Dict[str, Any]:
    from modules.module_E.perception_sources import get_perception_sources

    return get_perception_sources(
        job_id=job_id.strip(),
        customer_root_domain=customer_root_domain.strip(),
        search=search,
        llm=llm,
        property_filter=property,
        type_filter=type,  # validated in module
        date_from=date_from,
        date_to=date_to,
        limit_domains=limit_domains,
    )


@router.get("/perception-sources-overview")
async def get_perception_sources_overview_endpoint(
    job_id: str = Query(..., min_length=1),
    customer_root_domain: str = Query(..., min_length=1, description="Root domain (used for Owned/Third-party filter)"),
    llm: str = Query("All Models"),
    property: str = Query("All Topics"),
    type: str = Query("all"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    top_n_domains: int = Query(7, ge=1, le=20),
) -> Dict[str, Any]:
    from modules.module_E.perception_sources_overview import get_perception_sources_overview

    return get_perception_sources_overview(
        job_id=job_id.strip(),
        customer_root_domain=customer_root_domain.strip(),
        llm=llm,
        property_filter=property,
        type_filter=type,
        date_from=date_from,
        date_to=date_to,
        top_n_domains=top_n_domains,
    )


@router.get("/perception-sources/responses")
async def get_perception_source_responses_endpoint(
    job_id: str = Query(..., min_length=1),
    domain: str = Query(..., min_length=1),
    customer_root_domain: str = Query(..., min_length=1),
    llm: str = Query("All Models"),
    property: str = Query("All Properties"),
    type: str = Query("all"),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    limit: int = Query(250, ge=1, le=2000),
) -> Dict[str, Any]:
    from modules.module_E.perception_sources import get_perception_source_responses

    return get_perception_source_responses(
        job_id=job_id.strip(),
        domain=domain.strip(),
        customer_root_domain=customer_root_domain.strip(),
        llm=llm,
        property_filter=property,
        type_filter=type,  # validated in module
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
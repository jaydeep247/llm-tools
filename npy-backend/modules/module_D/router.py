"""
HTTP API for Module D Ask AI — called by nnode-backend (same pattern as Module F).
"""

import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger("module_d_http")

router = APIRouter(prefix="/module-d", tags=["module-d"])


class ConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class ModuleDAskAIRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1, max_length=8000)
    job_id: Optional[str] = None
    conversation_history: Optional[List[ConversationTurn]] = None


class SuggestedQuestionsRequest(BaseModel):
    project_id: str = Field(..., min_length=1)


@router.post("/ask-ai")
async def module_d_ask_ai_endpoint(body: ModuleDAskAIRequest) -> Dict[str, Any]:
    from modules.module_D.module_d_ask_ai import ask_module_d_ai

    history: Optional[List[Dict[str, str]]] = None
    if body.conversation_history:
        history = [{"role": t.role, "content": t.content} for t in body.conversation_history]

    result = await ask_module_d_ai(
        project_id=body.project_id.strip(),
        question=body.question.strip(),
        job_id=body.job_id.strip() if body.job_id else None,
        conversation_history=history,
    )
    return result


@router.post("/ask-ai/suggested-questions")
async def module_d_suggested_questions_endpoint(
    body: SuggestedQuestionsRequest,
) -> Dict[str, Any]:
    from modules.module_D.module_d_ask_ai import get_suggested_questions

    questions = get_suggested_questions(project_id=body.project_id.strip())
    return {"questions": questions}
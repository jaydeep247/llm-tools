"""
HTTP API for Module F Ask AI — called by nnode-backend (same pattern as brand-onboarding).
"""

import logging
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

logger = logging.getLogger("module_f_http")


router = APIRouter(prefix="/module-f", tags=["module-f"])


class ConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class ModuleFAskAIRequest(BaseModel):
    project_id: str = Field(..., min_length=1)
    question: str = Field(..., min_length=1, max_length=8000)
    job_id: Optional[str] = None
    conversation_history: Optional[List[ConversationTurn]] = None


@router.post("/ask-ai")
async def module_f_ask_ai_endpoint(body: ModuleFAskAIRequest) -> Dict[str, Any]:
    from modules.module_F.module_f_ask_ai import ask_module_f_ai

    history: Optional[List[Dict[str, str]]] = None
    if body.conversation_history:
        history = [{"role": t.role, "content": t.content} for t in body.conversation_history]

    result = await ask_module_f_ai(
        project_id=body.project_id.strip(),
        question=body.question.strip(),
        job_id=body.job_id.strip() if body.job_id else None,
        conversation_history=history,
    )
    return result

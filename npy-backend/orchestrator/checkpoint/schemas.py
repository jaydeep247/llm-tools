from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, Literal
from datetime import datetime

class TaskRequest(BaseModel):
    """
    Standardized request format for ANY task execution.
    """
    task_name: str = Field(..., description="Unique identifier for the task (e.g., 'sentiment_analysis')")
    input_data: Dict[str, Any] = Field(..., description="The actual data payload for the task")
    provider: Literal["openai", "gemini", "claude", "dataforseo"] = Field(..., description="The specific provider to execute this task with")
    options: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional execution parameters (e.g., model version, max_tokens)")

class TaskResponse(BaseModel):
    """
    Standardized response format from ANY task execution.
    """
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict, description="Metadata like execution time, tokens used, provider version")
    cached: bool = Field(False, description="Whether this result came from the cache")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ProviderConfig(BaseModel):
    """
    Configuration for a specific provider adapter.
    """
    api_key: str
    model: Optional[str] = None
    timeout: int = 30
    retries: int = 3

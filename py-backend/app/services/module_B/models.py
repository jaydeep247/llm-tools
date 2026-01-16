from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum

class ComplexityLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"

class ExtractHtmlRequest(BaseModel):
    url: str
    final_url: str
    status_code: int
    headers: Dict[str, Any] = {}
    html: str
    fetched_at: str
    lang_guess: str = ""

class ContentMetrics(BaseModel):
    """Enhanced metrics for content analysis"""
    difficulty_score: float = Field(default=0.0, ge=0, le=100, description="Content difficulty score (0-100)")
    complexity_level: ComplexityLevel = Field(default=ComplexityLevel.LOW, description="Content complexity level")
    ai_generation_feasibility: float = Field(default=0.0, ge=0, le=100, description="AI generation feasibility score (0-100)")
    
class Keyword(BaseModel):
    text: str
    score: float
    freq: int = 0
    intent: str = "informational"
    similarity: Optional[float] = None
    prompt_count: int = 0
    relevance_score: float = 0.0
    diversity_score: float = 0.0
    # New metrics
    difficulty_score: Optional[float] = Field(default=None, ge=0, le=100)
    complexity_level: Optional[ComplexityLevel] = None
    ai_generation_feasibility: Optional[float] = Field(default=None, ge=0, le=100)

class TreeNode(BaseModel):
    text: str
    score: float
    children: List['TreeNode'] = []

class ExtractResponse(BaseModel):
    url: str
    language: str
    parent: Optional[Keyword] = None
    children: List[Keyword] = []
    tree: Optional[TreeNode] = None
    keywords: List[Keyword] = []
    debug: Optional[Dict[str, Any]] = None

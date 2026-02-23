from enum import Enum
from typing import Any, Dict, List, Optional

from bs4 import BeautifulSoup
from langdetect import DetectorFactory, LangDetectException, detect
from pydantic import BaseModel, Field


DetectorFactory.seed = 42


class ComplexityLevel(str, Enum):
    LOW = "Low"
    MEDIUM = "Medium"
    HIGH = "High"


class ContentMetrics(BaseModel):
    difficulty_score: float = Field(default=0.0, ge=0, le=100)
    complexity_level: ComplexityLevel = Field(default=ComplexityLevel.LOW)
    ai_generation_feasibility: float = Field(default=0.0, ge=0, le=100)


class Keyword(BaseModel):
    text: str
    score: float
    freq: int = 0
    intent: str = "informational"
    similarity: Optional[float] = None
    prompt_count: int = 0
    relevance_score: float = 0.0
    diversity_score: float = 0.0
    difficulty_score: Optional[float] = Field(default=None, ge=0, le=100)
    complexity_level: Optional[ComplexityLevel] = None
    ai_generation_feasibility: Optional[float] = Field(default=None, ge=0, le=100)


STOPWORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "is",
    "are",
    "was",
    "were",
    "be",
    "this",
    "that",
    "these",
    "those",
    "it",
    "as",
    "from",
    "can",
    "will",
    "your",
    "our",
    "their",
}


def safe_detect_language(text: str, lang_guess: str) -> str:
    if lang_guess:
        return lang_guess
    if not text or len(text) < 20:
        return "en"
    try:
        return detect(text)
    except LangDetectException:
        return "en"


def tokenize(text: str) -> List[str]:
    tokens: List[str] = []
    current: List[str] = []
    for ch in text:
        if ch.isalnum() or ch in {"-", "_"}:
            current.append(ch.lower())
        else:
            if current:
                token = "".join(current)
                current = []
                tokens.append(token)
    if current:
        tokens.append("".join(current))
    return tokens


def calculate_content_metrics(
    score: float,
    relevance_score: float,
    diversity_score: float,
    prompt_count: int,
    word_count: int,
) -> ContentMetrics:
    base_score = max(0.0, min(10.0, score))
    rel = max(0.0, min(100.0, relevance_score)) / 100.0
    div = max(0.0, min(100.0, diversity_score)) / 100.0
    difficulty = (1.0 - base_score / 10.0) * 40.0 + rel * 25.0 + div * 20.0 + min(
        prompt_count / 20.0, 1.0
    ) * 10.0
    if word_count == 1 and base_score < 5.0:
        difficulty += 5.0
    difficulty = max(0.0, min(100.0, difficulty))
    if word_count <= 1:
        complexity = ComplexityLevel.LOW
    elif word_count == 2:
        complexity = ComplexityLevel.MEDIUM if div > 0.5 else ComplexityLevel.LOW
    elif word_count == 3:
        complexity = ComplexityLevel.HIGH if div > 0.6 else ComplexityLevel.MEDIUM
    else:
        complexity = ComplexityLevel.HIGH if div > 0.5 else ComplexityLevel.MEDIUM
    ai_feasibility = base_score / 10.0 * 35.0 + rel * 30.0 + (1.0 - div) * 20.0
    if prompt_count > 0:
        ai_feasibility += min(prompt_count / 10.0, 1.0) * 10.0
    if word_count <= 3:
        ai_feasibility += 5.0
    ai_feasibility = max(0.0, min(100.0, ai_feasibility))
    return ContentMetrics(
        difficulty_score=round(difficulty, 1),
        complexity_level=complexity,
        ai_generation_feasibility=round(ai_feasibility, 1),
    )


def extract_keywords_from_html(
    html: str,
    url: str,
    final_url: str,
    lang_guess: str = "",
) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)
    language = safe_detect_language(text, lang_guess)
    tokens = tokenize(text)
    filtered_tokens: List[str] = []
    for t in tokens:
        if len(t) < 3:
            continue
        if t.isdigit():
            continue
        if t in STOPWORDS:
            continue
        filtered_tokens.append(t)
    if not filtered_tokens:
        return {
            "url": final_url or url,
            "language": language,
            "parent": None,
            "children": [],
            "tree": None,
            "keywords": [],
            "debug": {
                "total_tokens": len(tokens),
                "filtered_tokens": 0,
            },
        }
    freq_map: Dict[str, int] = {}
    for t in filtered_tokens:
        freq_map[t] = freq_map.get(t, 0) + 1
    total_words = len(filtered_tokens)
    keyword_items: List[Keyword] = []
    for word, freq in freq_map.items():
        base_score = float(freq) ** 0.8
        if base_score < 0.5:
            continue
        density = (freq / max(1, total_words)) * 100.0
        if density > 5.0:
            continue
        relevance_score = min(100.0, base_score * 10.0)
        prompt_count = max(1, int(freq * 1.5))
        diversity_score = min(100.0, 60.0 + len(word.split("-")) * 5.0)
        metrics = calculate_content_metrics(
            score=base_score,
            relevance_score=relevance_score,
            diversity_score=diversity_score,
            prompt_count=prompt_count,
            word_count=len(word.split("-")),
        )
        keyword_items.append(
            Keyword(
                text=word,
                score=round(base_score, 2),
                freq=freq,
                intent="informational",
                similarity=None,
                prompt_count=prompt_count,
                relevance_score=round(relevance_score, 1),
                diversity_score=round(diversity_score, 1),
                difficulty_score=metrics.difficulty_score,
                complexity_level=metrics.complexity_level,
                ai_generation_feasibility=metrics.ai_generation_feasibility,
            )
        )
    keyword_items.sort(key=lambda k: k.score, reverse=True)
    top_keywords = keyword_items[:30]
    parent_kw: Optional[Keyword] = top_keywords[0] if top_keywords else None
    parent_dict: Optional[Dict[str, Any]] = parent_kw.dict() if parent_kw else None
    keyword_dicts: List[Dict[str, Any]] = [k.dict() for k in top_keywords]
    return {
        "url": final_url or url,
        "language": language,
        "parent": parent_dict,
        "children": [],
        "tree": None,
        "keywords": keyword_dicts,
        "debug": {
            "total_tokens": len(tokens),
            "filtered_tokens": len(filtered_tokens),
            "unique_keywords": len(freq_map),
            "top_keywords_count": len(top_keywords),
            "parent_selected": parent_kw.text if parent_kw else None,
        },
    }


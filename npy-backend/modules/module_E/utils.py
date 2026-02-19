import re
from typing import Dict, Any

def count_syllables(word: str) -> int:
    """Simple syllable counter."""
    word = word.lower()
    vowels = "aeiouy"
    syllable_count = 0
    previous_was_vowel = False
    
    for char in word:
        is_vowel = char in vowels
        if is_vowel and not previous_was_vowel:
            syllable_count += 1
        previous_was_vowel = is_vowel
    
    if word.endswith('e'):
        syllable_count -= 1
    
    return max(1, syllable_count)

def calculate_difficulty_score(text: str) -> float:
    """Calculates content difficulty score (0-100)."""
    if not text or len(text.strip()) == 0:
        return 0.0
    
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if not sentences:
        return 0.0
    
    total_words = sum(len(s.split()) for s in sentences)
    avg_sentence_length = total_words / len(sentences) if sentences else 0
    sentence_score = min((avg_sentence_length / 30.0) * 100, 100)
    
    words = re.findall(r'\b\w+\b', text.lower())
    if not words:
        return 0.0
    
    complex_word_count = sum(1 for w in words if count_syllables(w) >= 3)
    complex_word_ratio = complex_word_count / len(words)
    word_complexity_score = min(complex_word_ratio * 200, 100)
    
    technical_indicators = len(re.findall(r'\b[A-Z]{2,}\b', text))
    technical_score = min((technical_indicators / len(sentences)) * 50, 100) if sentences else 0
    
    difficulty = (
        sentence_score * 0.4 +
        word_complexity_score * 0.4 +
        technical_score * 0.2
    )
    
    return round(min(max(difficulty, 0), 100), 2)

def calculate_complexity_level(difficulty_score: float, content_length: int = 0) -> str:
    """Determines complexity level ("Low", "Medium", "High")."""
    if difficulty_score < 30:
        base_level = "Low"
    elif difficulty_score < 60:
        base_level = "Medium"
    else:
        base_level = "High"
    
    if content_length > 10000 and base_level != "High":
        levels = ["Low", "Medium", "High"]
        return levels[levels.index(base_level) + 1]
    
    return base_level

def calculate_ai_generation_feasibility(text: str) -> float:
    """Calculates AI generation feasibility (0-100)."""
    if not text or len(text.strip()) < 50:
        return 0.0
    
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    
    list_indicators = len(re.findall(r'^\s*[-•*\d]+\.?\s+', text, re.MULTILINE))
    heading_indicators = len(re.findall(r'^#{1,6}\s+|\n[A-Z][^.!?]+\n', text))
    structure_indicator_score = min((list_indicators + heading_indicators) * 5, 100)
    
    sentence_starts = [s.split()[0] if s.split() else "" for s in sentences]
    start_pattern_variety = len(set(sentence_starts)) / len(sentences) if sentences else 1
    repetition_score = (1 - start_pattern_variety) * 100
    
    question_count = len(re.findall(r'\?', text))
    qa_score = min((question_count / len(sentences)) * 200, 100) if sentences else 0
    
    paragraph_count = len([p for p in text.split('\n\n') if p.strip()])
    organization_score = min(paragraph_count * 10, 100)
    
    feasibility = (
        structure_indicator_score * 0.3 +
        repetition_score * 0.2 +
        qa_score * 0.25 +
        organization_score * 0.25
    )
    
    return round(min(max(feasibility, 0), 100), 2)

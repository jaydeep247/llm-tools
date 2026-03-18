import re
from typing import Dict, Any

def count_word_syllables(word: str) -> int:
    """
    Count syllables in a single word (simplified algorithm).
    Ported from node-backend readabilityAnalyzer.ts
    """
    word = word.lower()
    if len(word) <= 3:
        return 1
    
    # Remove silent 'e' at the end
    word = re.sub(r'(?:[^laeiouy]es|ed|[^laeiouy]e)$', '', word)
    
    # Remove leading 'y' (for syllable counting purposes)
    word = re.sub(r'^y', '', word)
    
    # Count vowel groups
    matches = re.findall(r'[aeiouy]{1,2}', word)
    syllables = len(matches) if matches else 1
    
    return max(1, syllables)

def count_total_syllables(text: str) -> int:
    """
    Count total syllables in text.
    """
    if not text:
        return 0
    
    # Extract only letters to form words
    words = re.findall(r'[a-z]+', text.lower())
    return sum(count_word_syllables(word) for word in words)

def analyze_readability(text: str, sentence_count: int, word_count: int) -> Dict[str, Any]:
    """
    Calculate Flesch Reading Ease and Flesch-Kincaid Grade Level.

    sentence_count and word_count must already be computed via the
    SF-compatible methodology (caller responsibility).
    """
    if word_count == 0:
        return {
            "fleschReadingEase": 0,
            "fleschKincaidGrade": 0,
            "readabilityLevel": "N/A"
        }
    
    # Treat 0 sentences as 1 to avoid division by zero
    if sentence_count == 0:
        sentence_count = 1
        
    syllable_count = count_total_syllables(text)
    
    # Flesch Reading Ease
    # Formula: 206.835 - 1.015 * (total words / total sentences) - 84.6 * (total syllables / total words)
    asl = word_count / sentence_count
    asw = syllable_count / word_count
    
    fre_score = 206.835 - (1.015 * asl) - (84.6 * asw)
    fre_score = max(0, min(100, round(fre_score, 1)))
    
    # Flesch-Kincaid Grade Level
    # Formula: 0.39 * (total words / total sentences) + 11.8 * (total syllables / total words) - 15.59
    fk_grade = (0.39 * asl) + (11.8 * asw) - 15.59
    fk_grade = max(0, round(fk_grade, 1))
    
    # Determine level
    if fre_score >= 90: level = "Very Easy"
    elif fre_score >= 80: level = "Easy"
    elif fre_score >= 70: level = "Fairly Easy"
    elif fre_score >= 60: level = "Standard"
    elif fre_score >= 50: level = "Fairly Difficult"
    elif fre_score >= 30: level = "Difficult"
    else: level = "Very Difficult"
    
    return {
        "fleschReadingEase": fre_score,
        "fleschKincaidGrade": fk_grade,
        "readabilityLevel": level
    }

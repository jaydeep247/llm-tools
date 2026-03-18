"""
Content Quality Metrics
Includes Readability (Flesch Reading Ease) and Spelling/Grammar Checks.
Ported from node-backend/src/helpers/module_A/contentAnalysis/readabilityAnalyzer.ts
and spellGrammarChecker.ts
"""

import re
from typing import Dict, Any, List, Optional

# ==========================================
# Readability Analyzer
# ==========================================

def count_word_syllables(word: str) -> int:
    """
    Count syllables in a single word (simplified algorithm).
    """
    word = word.lower()
    if len(word) <= 3:
        return 1
        
    # Remove silent 'e' at the end
    word = re.sub(r'(?:[^laeiouy]es|ed|[^laeiouy]e)$', '', word)
    
    # Remove trailing 'y'
    word = re.sub(r'^y', '', word)
    
    # Count vowel groups
    matches = re.findall(r'[aeiouy]{1,2}', word)
    return max(1, len(matches))

def count_total_syllables(text: str) -> int:
    """
    Count total syllables in text.
    """
    if not text:
        return 0
        
    words = re.findall(r'[a-z]+', text.lower())
    total_syllables = 0
    
    for word in words:
        total_syllables += count_word_syllables(word)
        
    return total_syllables

def calculate_flesch_reading_ease(text: str, sentence_count: int, word_count: int) -> float:
    """
    Calculate Flesch Reading Ease score.
    Formula: 206.835 - 1.015 * (total words / total sentences) - 84.6 * (total syllables / total words)
    
    NOTE: sentence_count and word_count should be computed using the
    Screaming-Frog-compatible methodology (sentence boundaries split on
    terminal punctuation + whitespace + uppercase letter).
    """
    if not text or not text.strip():
        return 0.0
    if word_count == 0:
        return 0.0
        
    actual_sentence_count = sentence_count
    if actual_sentence_count == 0:
        actual_sentence_count = 1
            
    syllable_count = count_total_syllables(text)
    
    avg_sentence_length = word_count / actual_sentence_count
    avg_syllables_per_word = syllable_count / word_count
    
    score = 206.835 - (1.015 * avg_sentence_length) - (84.6 * avg_syllables_per_word)
    
    # Clamp between 0 and 100
    return max(0.0, min(100.0, round(score, 2)))

def get_readability_level(score: float) -> str:
    """
    Get readability level description.
    """
    if score >= 90: return 'Very Easy'
    if score >= 80: return 'Easy'
    if score >= 70: return 'Fairly Easy'
    if score >= 60: return 'Standard'
    if score >= 50: return 'Fairly Difficult'
    if score >= 30: return 'Difficult'
    return 'Very Difficult' # 0-29

# ==========================================
# Spelling & Grammar Checker
# ==========================================

COMMON_MISSPELLINGS = {
    'teh': 'the', 'adn': 'and', 'waht': 'what', 'thier': 'their',
    'recieve': 'receive', 'occured': 'occurred', 'seperate': 'separate',
    'definately': 'definitely', 'occassion': 'occasion', 'accomodate': 'accommodate',
    'acheive': 'achieve', 'beleive': 'believe', 'wierd': 'weird',
    'untill': 'until', 'sucessful': 'successful', 'neccessary': 'necessary',
    'occassionally': 'occasionally', 'recomend': 'recommend', 'begining': 'beginning',
    'refered': 'referred', 'prefered': 'preferred', 'occuring': 'occurring',
    'enviroment': 'environment', 'arguement': 'argument', 'maintainance': 'maintenance',
    'existance': 'existence', 'appearence': 'appearance', 'persistant': 'persistent',
    'independant': 'independent', 'goverment': 'government', 'calender': 'calendar',
    'tommorrow': 'tomorrow', 'pharaoh': 'pharaoh'
}

GRAMMAR_PATTERNS = [
    (r'\b(he|she|it)\s+(are|were)\b', 'Subject-verb disagreement'),
    (r'\b(they|we|you)\s+(is|was)\b', 'Subject-verb disagreement'),
    (r'\b(don\'t|doesn\'t|didn\'t|won\'t|can\'t|couldn\'t|shouldn\'t|wouldn\'t)\s+(no|nothing|nobody|never|none)\b', 'Double negative'),
    (r'\b(should|could|would)\s+of\b', 'Should use "have"'),
    (r'\bits\'\s', 'Invalid form "its\'"'),
    (r'\byour\s+(going|doing|being|coming|running)\b', 'Should use "you\'re"'),
    (r'\bthere\s+(going|doing|being|coming|running)\b', 'Should use "they\'re"'),
    (r'\bbetter\s+then\b', 'Should use "than"'),
    (r'\bworse\s+then\b', 'Should use "than"'),
    (r'\bthe\s+affect\s+of\b', 'Should use "effect"'),
    (r'\bdon\'t\s+loose\b', 'Should use "lose"'),
    (r'\ba\s+[aeiou]', 'Should use "an"'),
    (r'\ban\s+[bcdfghjklmnpqrstvwxyz]', 'Should use "a"')
]

def check_spelling(text: str) -> int:
    """Check text for spelling errors based on common list."""
    words = re.findall(r'[a-z\'\-]+', text.lower())
    error_count = 0
    for word in words:
        if word in COMMON_MISSPELLINGS:
            error_count += 1
    return error_count

def check_grammar(text: str) -> int:
    """Check text for grammar errors based on regex patterns."""
    error_count = 0
    for pattern, _ in GRAMMAR_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        error_count += len(matches)
    return error_count

def analyze_content_quality(text: str, sentence_count: int, word_count: int) -> Dict[str, Any]:
    """
    Analyze content quality: Readability, Spelling, Grammar.
    
    sentence_count and word_count must already be computed via the
    SF-compatible methodology (caller responsibility).
    """
    flesch_score = calculate_flesch_reading_ease(text, sentence_count, word_count)
    readability = get_readability_level(flesch_score)
    
    spelling_errors = check_spelling(text)
    grammar_errors = check_grammar(text)
    
    avg_words = round(word_count / sentence_count, 2) if sentence_count > 0 else 0
    
    return {
        'flesch_reading_ease_score': flesch_score,
        'readability': readability,
        'spelling_errors': spelling_errors,
        'grammar_errors': grammar_errors,
        'average_words_per_sentence': avg_words
    }

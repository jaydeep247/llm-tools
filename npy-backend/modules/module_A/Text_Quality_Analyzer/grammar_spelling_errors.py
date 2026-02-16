import re
from typing import Dict, Any, List

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

def analyze_spelling_and_grammar(text: str) -> Dict[str, Any]:
    """
    Analyze text for spelling and grammar errors.
    """
    if not text or not text.strip():
        return {
            "spellingErrors": 0,
            "grammarErrors": 0,
            "qualityLevel": "excellent"
        }
    
    # 1. Spelling Check
    words = re.findall(r'[a-z\'\-]+', text.lower())
    spelling_errors = 0
    for word in words:
        if word in COMMON_MISSPELLINGS:
            spelling_errors += 1
            
    # 2. Grammar Check
    grammar_errors = 0
    for pattern, _ in GRAMMAR_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        grammar_errors += len(matches)
        
    # 3. Quality Level
    total_errors = spelling_errors + grammar_errors
    if total_errors == 0: level = "excellent"
    elif total_errors <= 2: level = "good"
    elif total_errors <= 5: level = "fair"
    else: level = "poor"
    
    return {
        "spellingErrors": spelling_errors,
        "grammarErrors": grammar_errors,
        "qualityLevel": level
    }

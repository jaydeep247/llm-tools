import re
from typing import Dict, Any

def analyze_tone_style(text: str) -> Dict[str, Any]:
    """
    Analyze text tone and style consistency.
    """
    if not text or not text.strip():
        return {
            "tone": "Neutral",
            "style": "Standard",
            "formalityScore": 50
        }
    
    text_lower = text.lower()
    
    # 1. Formality Heuristic
    # Formal indicators: complex conjunctions, lack of contractions, passive voice (simple)
    formal_words = {'furthermore', 'nevertheless', 'consequently', 'therefore', 'subsequently'}
    informal_words = {'awesome', 'cool', 'stuff', 'totally', 'basically', 'just', 'maybe'}
    contractions = ["don't", "can't", "won't", "it's", "i'm", "you're"]
    
    words = set(re.findall(r'\b\w+\b', text_lower))
    
    formal_count = len(formal_words.intersection(words))
    informal_count = len(informal_words.intersection(words))
    contraction_count = sum(text_lower.count(c) for c in contractions)
    
    formality_score = 50 + (formal_count * 5) - (informal_count * 5) - (contraction_count * 2)
    formality_score = max(0, min(100, round(formality_score, 1)))
    
    # Tone label
    if formality_score > 70: tone = "Formal"
    elif formality_score < 40: tone = "Informal"
    else: tone = "Professional"
    
    # Style consistency (heuristic: sentence length variance check again)
    # If variety is too low or too high, it might be inconsistent
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if len(sentences) > 3:
        lengths = [len(s.split()) for s in sentences]
        avg = sum(lengths) / len(lengths)
        variance = sum((l - avg)**2 for l in lengths) / len(lengths)
        style_consistency = "High" if 15 < variance < 60 else "Moderate"
    else:
        style_consistency = "N/A"
        
    return {
        "tone": tone,
        "styleConsistency": style_consistency,
        "formalityScore": formality_score
    }

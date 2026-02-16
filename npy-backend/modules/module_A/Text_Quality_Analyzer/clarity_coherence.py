import re
from typing import Dict, Any

def analyze_clarity_coherence(text: str) -> Dict[str, Any]:
    """
    Analyze text clarity and coherence.
    """
    if not text or not text.strip():
        return {
            "clarityScore": 0,
            "coherenceScore": 0,
            "complexityLevel": "N/A"
        }
    
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    if not sentences:
        return {"clarityScore": 50, "coherenceScore": 50, "complexityLevel": "Low"}
    
    # 1. Clarity Score (based on sentence length variation - low variation is usually clearer)
    lengths = [len(s.split()) for s in sentences]
    avg_len = sum(lengths) / len(lengths)
    variance = sum((l - avg_len)**2 for l in lengths) / len(lengths)
    
    # Heuristic: extreme variance or extreme length reduces clarity
    clarity = 100 - (abs(avg_len - 15) * 2) - (min(20, variance / 10))
    clarity = max(0, min(100, round(clarity, 1)))
    
    # 2. Coherence Score (based on transition words)
    transitions = {
        'however', 'therefore', 'consequently', 'furthermore', 'moreover',
        'initially', 'subsequently', 'finally', 'additionally', 'similarly',
        'nevertheless', 'nonetheless', 'contrastingly', 'consequently'
    }
    words = set(re.findall(r'\b\w+\b', text.lower()))
    found_transitions = transitions.intersection(words)
    coherence = (len(found_transitions) / 5) * 100 # Assuming 5 transitions is "good"
    coherence = max(0, min(100, round(coherence, 1)))
    
    #Complexity Level
    if avg_len > 25: comp = "Highly Complex"
    elif avg_len > 18: comp = "Complex"
    elif avg_len > 12: comp = "Moderate"
    else: comp = "Simple"
    
    return {
        "clarityScore": clarity,
        "coherenceScore": coherence,
        "complexityLevel": comp
    }

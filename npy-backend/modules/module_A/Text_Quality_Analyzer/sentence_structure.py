import re
from typing import Dict, Any, List

def analyze_sentence_structure(text: str, sentence_count: int, word_count: int) -> Dict[str, Any]:
    """
    Analyze sentence length and complexity.
    """
    if sentence_count == 0 or word_count == 0:
        return {
            "averageSentenceLength": 0,
            "sentenceComplexity": "N/A",
            "longSentences": 0
        }
    
    avg_len = round(word_count / sentence_count, 1)
    
    # Split sentences to analyze individual length
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]
    long_sentences = 0
    complexity_sum = 0
    
    for sentence in sentences:
        words = sentence.split()
        length = len(words)
        if length > 25:
            long_sentences += 1
        
        # Simple complexity heuristic: commas and semicolons
        punctuation_count = sentence.count(',') + sentence.count(';')
        complexity_sum += (length / 10) + punctuation_count
        
    avg_complexity = round(complexity_sum / len(sentences), 1) if sentences else 0
    
    # Determine complexity label
    if avg_complexity > 5: complexity = "High"
    elif avg_complexity > 3: complexity = "Medium"
    else: complexity = "Low"
    
    return {
        "averageSentenceLength": avg_len,
        "sentenceComplexity": complexity,
        "longSentences": long_sentences
    }

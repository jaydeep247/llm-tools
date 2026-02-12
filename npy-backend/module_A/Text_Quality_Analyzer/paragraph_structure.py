from typing import Dict, Any

def analyze_paragraph_structure(word_count: int, paragraph_count: int) -> Dict[str, Any]:
    """
    Analyze paragraph count and average length.
    """
    if paragraph_count == 0:
        return {
            "paragraphCount": 0,
            "averageParagraphLength": 0
        }
    
    avg_len = round(word_count / paragraph_count, 1)
    
    return {
        "paragraphCount": paragraph_count,
        "averageParagraphLength": avg_len
    }

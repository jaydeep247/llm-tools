import re
from typing import Dict, Any, List, Optional

def normalize_text(text: str) -> str:
    """Normalize text for analysis."""
    return re.sub(r'[^\w\s]', ' ', text.lower()).strip()

def calculate_keyword_usage(text: str, title: str, keyword: Optional[str] = None) -> Dict[str, Any]:
    """
    Calculate keyword density and relevance.
    """
    norm_text = normalize_text(text)
    words = norm_text.split()
    total_words = len(words)
    
    if total_words == 0:
        return {
            "keywordDensity": 0,
            "relevanceScore": 0,
            "topKeywords": []
        }
    
    # 1. Keyword Density (if keyword provided)
    density = 0
    if keyword:
        norm_keyword = normalize_text(keyword)
        k_words = norm_keyword.split()
        if len(k_words) == 1:
            count = words.count(k_words[0])
        else:
            count = 0
            k_len = len(k_words)
            for i in range(len(words) - k_len + 1):
                if words[i:i+k_len] == k_words:
                    count += 1
        density = round((count / total_words) * 100, 2)
        
    # 2. Relevance Score (heuristic based on title words in text)
    norm_title = normalize_text(title)
    title_words = set(w for w in norm_title.split() if len(w) > 3)
    relevant_count = sum(1 for w in words if w in title_words)
    relevance_score = round((relevant_count / total_words) * 100, 1) if title_words else 50
    
    # 3. Simple Top Keywords (excluding tiny words)
    stop_words = {'the', 'and', 'with', 'this', 'that', 'from', 'your', 'have', 'will'}
    freq = {}
    for w in words:
        if len(w) >= 3 and w not in stop_words:
            freq[w] = freq.get(w, 0) + 1
    
    top_keywords = sorted(freq.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "keywordDensity": density,
        "relevanceScore": min(100, relevance_score * 2), # Scale for better visibility
        "topKeywords": [k for k, v in top_keywords]
    }

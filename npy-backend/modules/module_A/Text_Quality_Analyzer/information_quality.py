from typing import Dict, Any, List

def analyze_information_quality(text: str, heading_count: int) -> Dict[str, Any]:
    """
    Analyze missing or weak information.
    Ported from AIAnalyzer.ts depth/breadth logic.
    """
    content_length = len(text)
    
    # 1. Depth Score (heuristics)
    depth_score = 0
    if content_length > 2000: depth_score += 45
    elif content_length > 1000: depth_score += 30
    elif content_length > 500: depth_score += 20
    else: depth_score += 10
    
    if heading_count > 5: depth_score += 25
    elif heading_count > 2: depth_score += 15
    else: depth_score += 5
    
    # 2. Breadth Score (heuristics)
    # Looking for a variety of topics (headings generally indicate topics)
    breadth_score = min(100, heading_count * 15)
    
    # 3. Completeness Score
    completeness = round((depth_score + breadth_score) / 2, 1)
    
    # Missing or Weak Info detection
    missing_info = []
    if content_length < 300: missing_info.append("Short content length")
    if heading_count < 2: missing_info.append("Lack of subheadings")
    if completeness < 30: missing_info.append("Low overall information depth")
    
    return {
        "depthScore": min(100, depth_score),
        "breadthScore": min(100, breadth_score),
        "completenessScore": completeness,
        "isWeakContent": len(missing_info) > 0,
        "weakContentReasons": missing_info
    }

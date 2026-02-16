from typing import Dict, Any

def calculate_text_ratio(html_content: str, visible_text: str) -> Dict[str, Any]:
    """
    Calculate text-to-html ratio.
    """
    html_size = len(html_content.encode('utf-8'))
    text_size = len(visible_text.encode('utf-8'))
    
    ratio = (text_size / html_size * 100) if html_size > 0 else 0
    
    return {
        "textToHtmlRatio": round(ratio, 2),
        "contentSizeBytes": text_size,
        "totalSizeBytes": html_size
    }

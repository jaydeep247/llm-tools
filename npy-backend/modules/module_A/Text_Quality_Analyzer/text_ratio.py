from typing import Dict, Any

def calculate_text_ratio(html_content: str, visible_text: str, raw_html_size: int = 0) -> Dict[str, Any]:
    """
    Calculate text-to-html ratio.
    
    Args:
        html_content: The decoded HTML string (used only as fallback for size).
        visible_text: Visible text extracted via SF-compatible methodology.
        raw_html_size: Raw response body size in bytes (``len(response.body)``).
                       When provided, this is used as the denominator to match
                       Screaming Frog's ratio calculation.  Falls back to
                       ``len(html_content.encode('utf-8'))`` when 0.
    """
    if raw_html_size <= 0:
        raw_html_size = len(html_content.encode('utf-8'))
    text_size = len(visible_text.encode('utf-8'))
    
    ratio = (text_size / raw_html_size * 100) if raw_html_size > 0 else 0
    
    return {
        "textToHtmlRatio": round(ratio, 2),
        "contentSizeBytes": text_size,
        "totalSizeBytes": raw_html_size
    }

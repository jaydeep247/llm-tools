import re
from typing import Dict, Any
from bs4 import BeautifulSoup, Comment

def calculate_text_ratio(html_content: str, visible_text: str = "", raw_html_size: int = 0) -> Dict[str, Any]:
    """
    Calculate text-to-html ratio.
    """
    if raw_html_size <= 0:
        raw_html_size = len(html_content.encode('utf-8'))
        
    work = BeautifulSoup(html_content, 'lxml')
    # Remove script, style, footer
    for tag in work(["script", "style", "footer"]):
        tag.decompose()
        
    texts = "".join(filter(lambda x: not isinstance(x, Comment), work.find_all(string=True)))
    text_size = len(re.sub(r'\s+', ' ', texts).strip())
    
    ratio = (text_size / len(html_content) * 100) if len(html_content) > 0 else 0
    
    return {
        "textToHtmlRatio": round(ratio, 2),
        "contentSizeBytes": text_size,
        "totalSizeBytes": len(html_content)
    }

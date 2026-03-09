"""
Heading Extractor
Extracts heading structure: H1-H6 tags with full nested text and structure
"""

from scrapy.http import Response
from typing import Dict, Any, List


class HeadingExtractor:
    """Extracts heading structure"""
    
    @staticmethod
    def _get_full_text(selector) -> str:
        """Get full inner text of an element including nested elements."""
        texts = selector.css('::text').getall()
        raw = ' '.join(t.strip() for t in texts if t.strip())
        # Collapse multiple spaces (from adjacent text nodes)
        import re
        return re.sub(r'\s+', ' ', raw).strip()
    
    @staticmethod
    def extract(response: Response) -> Dict[str, Any]:
        """
        Extract heading tags with full inner text (handles nested elements like <h1><span>Text</span></h1>)
        Also extracts heading_structure: ordered list of all headings with level and text.
        
        Args:
            response: Scrapy response object
            
        Returns:
            Dictionary of heading fields
        """
        result = {}
        heading_structure = []
        
        for level in range(1, 7):
            tag = f'h{level}'
            elements = response.css(tag)
            texts = []
            for el in elements:
                full_text = HeadingExtractor._get_full_text(el)
                if full_text:
                    texts.append(full_text)
                    heading_structure.append({
                        'level': level,
                        'tag': tag,
                        'text': full_text,
                    })
            result[f'{tag}_tags'] = texts
        
        result['heading_structure'] = heading_structure
        return result

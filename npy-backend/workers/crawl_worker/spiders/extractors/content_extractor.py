"""
Content Extractor
Extracts content metrics: word count, sentence count, text-to-HTML ratio
"""

from scrapy.http import Response
from typing import Dict, Any
import re


class ContentExtractor:
    """Extracts content analysis fields"""
    
    @staticmethod
    def extract(response: Response) -> Dict[str, Any]:
        """
        Extract content metrics
        
        Args:
            response: Scrapy response object
            
        Returns:
            Dictionary of content fields
        """
        # Get visible text (excluding script, style tags)
        body_text = response.css('body ::text').getall()
        visible_text = ' '.join([t.strip() for t in body_text if t.strip()])
        
        # Word count
        words = visible_text.split()
        word_count = len(words)
        
        # Sentence count (simple approximation)
        sentences = re.split(r'[.!?]+', visible_text)
        sentence_count = len([s for s in sentences if s.strip()])
        
        # Paragraph count
        paragraphs = response.css('p::text').getall()
        paragraph_count = len([p for p in paragraphs if p.strip()])
        
        # Text-to-HTML ratio
        html_size = len(response.text)
        text_size = len(visible_text)
        text_to_html_ratio = round((text_size / html_size) * 100, 2) if html_size > 0 else 0
        
        return {
            'word_count': word_count,
            'sentence_count': sentence_count,
            'paragraph_count': paragraph_count,
            'text_to_html_ratio': text_to_html_ratio,
        }

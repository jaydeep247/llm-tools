"""
Content Extractor
Extracts content metrics: word count, sentence count, text-to-HTML ratio
Uses Screaming Frog compatible methodology for visible text extraction.
"""

from scrapy.http import Response
from typing import Dict, Any
import re
from bs4 import BeautifulSoup


# Tags whose entire subtree should be excluded from visible text
_STRIP_TAGS = {'script', 'style', 'noscript', 'svg', 'iframe'}


class ContentExtractor:
    """Extracts content analysis fields"""

    @staticmethod
    def _extract_visible_text(html: str) -> str:
        """
        Extract visible text from HTML, excluding script/style/noscript/svg.
        Matches Screaming Frog methodology: rendered text only.
        """
        soup = BeautifulSoup(html, 'lxml')
        for tag in soup.find_all(_STRIP_TAGS):
            tag.decompose()
        text = soup.get_text(separator=' ')
        # Collapse whitespace
        return re.sub(r'\s+', ' ', text).strip()

    @staticmethod
    def extract(response: Response) -> Dict[str, Any]:
        """
        Extract content metrics

        Args:
            response: Scrapy response object

        Returns:
            Dictionary of content fields
        """
        visible_text = ContentExtractor._extract_visible_text(response.text)

        # Word count – split on whitespace
        words = visible_text.split()
        word_count = len(words)

        # Sentence count (Screaming Frog compatible: split on sentence-ending punctuation)
        sentences = re.split(r'(?<=[.!?])\s+', visible_text)
        sentence_count = len([s for s in sentences if s.strip()])

        # Paragraph count
        paragraphs = response.css('p')
        paragraph_count = len([p for p in paragraphs if p.css('::text').get()])

        # Text-to-HTML ratio (text bytes / html bytes * 100)
        html_size = len(response.text.encode('utf-8'))
        text_size = len(visible_text.encode('utf-8'))
        text_to_html_ratio = round((text_size / html_size) * 100, 2) if html_size > 0 else 0

        return {
            'word_count': word_count,
            'sentence_count': sentence_count,
            'paragraph_count': paragraph_count,
            'text_to_html_ratio': text_to_html_ratio,
        }

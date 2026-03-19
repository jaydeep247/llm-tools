"""
Content Extractor
Extracts content metrics: word count, sentence count, text-to-HTML ratio
Uses Screaming Frog compatible methodology for visible text extraction.
"""

from scrapy.http import Response
from typing import Dict, Any
import re
from bs4 import BeautifulSoup, Comment


# Tags whose entire subtree is never rendered or should be excluded from content area
_STRIP_TAGS = {'script', 'style', 'noscript', 'svg', 'iframe', 'template', 'nav', 'footer'}

BLOCK_ELEMENTS = {
    'address', 'article', 'aside', 'blockquote', 'canvas', 'dd', 'div', 'dl', 'dt',
    'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'header', 'hr', 'li', 'main', 'nav', 'noscript', 'ol', 'p', 'pre', 'section', 'table', 'tfoot', 'ul', 'video',
    'tr', 'td', 'th', 'br'
}

class ContentExtractor:
    """Extracts content analysis fields"""

    @staticmethod
    def _get_block_text(element) -> str:
        texts = []
        for child in getattr(element, 'children', []):
            if isinstance(child, str):
                texts.append(child)
            else:
                is_block = getattr(child, 'name', '') in BLOCK_ELEMENTS
                if is_block:
                    texts.append('\n')
                texts.append(ContentExtractor._get_block_text(child))
                if is_block:
                    texts.append('\n')
        return ''.join(texts)

    @staticmethod
    def _clean_soup(html: str) -> BeautifulSoup:
        """
        Parse HTML and remove non-content elements.
        Screaming Frog does NOT consider visibility (like display:none).
        """
        soup = BeautifulSoup(html, 'lxml')

        # 0. Remove HTML comments
        for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
            comment.extract()

        # 1. Remove non-rendered tag subtrees
        for tag in soup.find_all(_STRIP_TAGS):
            tag.decompose()

        return soup

    @staticmethod
    def _extract_visible_text(html: str) -> str:
        """Return flat (whitespace-collapsed) visible text for word counting."""
        soup = ContentExtractor._clean_soup(html)
        text = soup.get_text(separator=' ')
        return re.sub(r'\s+', ' ', text).strip()

    @staticmethod
    def _extract_block_text(html: str) -> str:
        """Return newline-separated visible text for sentence counting.

        Each block-level element boundary maps to a newline so that
        headings, list items, and paragraphs are treated as separate
        sentence segments — matching Screaming Frog's methodology.
        """
        soup = ContentExtractor._clean_soup(html)
        if soup.body:
            return ContentExtractor._get_block_text(soup.body)
        return ContentExtractor._get_block_text(soup)

    @staticmethod
    def _count_sentences(block_text: str) -> int:
        """
        Count sentences from block-aware text (newline-separated).

        Each non-empty text block contributes at least one sentence.
        Terminal punctuation groups (`[.!?]+`) within a block add
        additional sentence breaks, matching Screaming Frog's
        Flesch-Kincaid methodology.
        """
        if not block_text or not block_text.strip():
            return 0
        if '\n' in block_text:
            count = 0
            for line in block_text.split('\n'):
                line = line.strip()
                if not line:
                    continue
                chunks = [c for c in re.split(r'[.!?]+', line) if c.strip()]
                count += max(1, len(chunks))
            return max(1, count)
        chunks = [c for c in re.split(r'[.!?]+', block_text) if c.strip()]
        return max(1, len(chunks))

    @staticmethod
    def extract(response: Response) -> Dict[str, Any]:
        """
        Extract content metrics

        Args:
            response: Scrapy response object

        Returns:
            Dictionary of content fields
        """
        # Parse and clean once, then derive both text forms
        soup = ContentExtractor._clean_soup(response.text)

        if soup.body:
            block_text = ContentExtractor._get_block_text(soup.body)
        else:
            block_text = ContentExtractor._get_block_text(soup)
            
        flat_text = re.sub(r'\s+', ' ', block_text).strip()

        # Word count – split on whitespace (Screaming Frog methodology)
        words = flat_text.split()
        word_count = len(words)

        # Sentence count (block-aware, SF-compatible)
        sentence_count = ContentExtractor._count_sentences(block_text)

        # Paragraph count
        paragraphs = response.css('p')
        paragraph_count = len([p for p in paragraphs if p.css('::text').get()])

        # Text-to-HTML ratio
        # Screaming Frog text ratio uses ALL body text (does not exclude nav/footer)
        # but does exclude script, style, noscript
        ratio_soup = BeautifulSoup(response.text, 'lxml')
        for el in ratio_soup(["script", "style", "noscript"]):
            el.extract()
        if ratio_soup.body:
            body_text = ratio_soup.body.get_text(separator=' ')
        else:
            body_text = ratio_soup.get_text(separator=' ')
        body_text_normalized = re.sub(r'\s+', ' ', body_text).strip()

        raw_html_size = len(response.body)
        text_size = len(body_text_normalized.encode('utf-8'))
        text_to_html_ratio = round((text_size / raw_html_size) * 100, 2) if raw_html_size > 0 else 0

        return {
            'word_count': word_count,
            'sentence_count': sentence_count,
            'paragraph_count': paragraph_count,
            'text_to_html_ratio': text_to_html_ratio,
        }

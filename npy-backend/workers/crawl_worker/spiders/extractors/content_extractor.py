"""
Content Extractor
Extracts content metrics: word count, sentence count, text-to-HTML ratio
Uses Screaming Frog compatible methodology for visible text extraction.
"""

from scrapy.http import Response
from typing import Dict, Any
import re
from bs4 import BeautifulSoup, Comment


# Tags whose entire subtree is never rendered (Screaming Frog strips these)
_STRIP_TAGS = {'script', 'style', 'noscript', 'svg', 'iframe', 'template'}

# CSS classes that hide content visually (screen-reader / accessibility text)
_HIDDEN_CLASSES = re.compile(
    r'\b(?:screen-reader-text|sr-only|visually-hidden|'
    r'visually-hidden-focusable|elementor-screen-only|'
    r'clip-text|assistive-text|offscreen-text)\b',
    re.IGNORECASE,
)


class ContentExtractor:
    """Extracts content analysis fields"""

    @staticmethod
    def _clean_soup(html: str) -> BeautifulSoup:
        """
        Parse HTML and remove all non-visible content.

        Strips:
        - Non-rendered elements (script, style, noscript, svg, iframe, template)
        - HTML comments
        - Elements hidden via inline style (display:none, visibility:hidden)
        - Elements with the HTML5 ``hidden`` attribute
        - Elements marked ``aria-hidden="true"``
        - Elements with common visually-hidden CSS classes
        """
        soup = BeautifulSoup(html, 'lxml')

        # 0. Remove HTML comments (BS4 includes them in get_text by default)
        for comment in soup.find_all(string=lambda s: isinstance(s, Comment)):
            comment.extract()

        # 1. Remove non-rendered tag subtrees
        for tag in soup.find_all(_STRIP_TAGS):
            tag.decompose()

        # 2. Remove elements hidden via inline CSS
        for tag in soup.find_all(style=True):
            style = (getattr(tag, 'attrs', None) or {}).get('style', '').lower().replace(' ', '')
            if 'display:none' in style or 'visibility:hidden' in style:
                tag.decompose()

        # 3. Remove HTML5 hidden attribute
        for tag in soup.find_all(attrs={'hidden': True}):
            tag.decompose()

        # 4. Remove aria-hidden="true"
        for tag in soup.find_all(attrs={'aria-hidden': 'true'}):
            tag.decompose()

        # 5. Remove elements with visually-hidden CSS classes
        for tag in soup.find_all(class_=_HIDDEN_CLASSES):
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
        return soup.get_text(separator='\n')

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

        count = 0
        for line in block_text.split('\n'):
            line = line.strip()
            if not line:
                continue
            # Number of sentence-ending punctuation groups in this line
            endings = len(re.findall(r'[.!?]+', line))
            # Each text block is at least 1 sentence; more if it has
            # terminal punctuation within it.
            count += max(1, endings)

        return max(1, count)

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

        block_text = soup.get_text(separator='\n')
        flat_text = re.sub(r'\s+', ' ', block_text).strip()

        # Word count – split on whitespace (Screaming Frog methodology)
        words = flat_text.split()
        word_count = len(words)

        # Sentence count (block-aware, SF-compatible)
        sentence_count = ContentExtractor._count_sentences(block_text)

        # Paragraph count
        paragraphs = response.css('p')
        paragraph_count = len([p for p in paragraphs if p.css('::text').get()])

        # Text-to-HTML ratio (text bytes / raw body bytes * 100)
        # Use len(response.body) for the denominator – this is the actual
        # uncompressed HTML size, matching Screaming Frog's "Size (bytes)".
        raw_html_size = len(response.body)
        text_size = len(flat_text.encode('utf-8'))
        text_to_html_ratio = round((text_size / raw_html_size) * 100, 2) if raw_html_size > 0 else 0

        return {
            'word_count': word_count,
            'sentence_count': sentence_count,
            'paragraph_count': paragraph_count,
            'text_to_html_ratio': text_to_html_ratio,
        }

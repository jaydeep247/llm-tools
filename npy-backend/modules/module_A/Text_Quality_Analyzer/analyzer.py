from typing import Dict, Any, Optional
from bs4 import BeautifulSoup, Comment
import re

# Import sub-modules
from .readability_score import analyze_readability
from .grammar_spelling_errors import analyze_spelling_and_grammar
from .sentence_structure import analyze_sentence_structure
from .paragraph_structure import analyze_paragraph_structure
from .keyword_usage import calculate_keyword_usage
from .clarity_coherence import analyze_clarity_coherence
from .duplicate_detection import analyze_duplication
from .tone_style import analyze_tone_style
from .text_ratio import calculate_text_ratio
from .information_quality import analyze_information_quality

# Tags whose subtree is never visible
_STRIP_TAGS = ['script', 'style', 'noscript', 'svg', 'iframe', 'template']

# CSS classes that hide content visually (screen-reader / accessibility text)
_HIDDEN_CLASSES = re.compile(
    r'\b(?:screen-reader-text|sr-only|visually-hidden|'
    r'visually-hidden-focusable|elementor-screen-only|'
    r'clip-text|assistive-text|offscreen-text)\b',
    re.IGNORECASE,
)


class TextQualityAnalyzer:
    """
    Orchestrates all text quality analysis metrics.
    """
    
    @staticmethod
    def _clean_soup(soup: BeautifulSoup) -> BeautifulSoup:
        """Remove all non-visible content (SF-compatible)."""
        for c in soup.find_all(string=lambda s: isinstance(s, Comment)):
            c.extract()

        for el in soup(_STRIP_TAGS):
            el.decompose()

        for el in soup.find_all(style=True):
            style = (getattr(el, 'attrs', None) or {}).get('style', '').lower().replace(' ', '')
            if 'display:none' in style or 'visibility:hidden' in style:
                el.decompose()

        for el in soup.find_all(attrs={'hidden': True}):
            el.decompose()

        for el in soup.find_all(attrs={'aria-hidden': 'true'}):
            el.decompose()

        for el in soup.find_all(class_=_HIDDEN_CLASSES):
            el.decompose()

        return soup

    @staticmethod
    def extract_visible_text(soup: BeautifulSoup) -> str:
        """Extract visible text from BeautifulSoup (SF-compatible)."""
        soup = TextQualityAnalyzer._clean_soup(soup)
        text = soup.get_text(separator=' ')
        return re.sub(r'\s+', ' ', text).strip()

    @staticmethod
    def _count_sentences(block_text: str) -> int:
        """Count sentences from block-aware text (newline-separated)."""
        if not block_text or not block_text.strip():
            return 0
        if '\n' in block_text:
            count = 0
            for line in block_text.split('\n'):
                line = line.strip()
                if not line:
                    continue
                endings = len(re.findall(r'[.!?]+', line))
                count += max(1, endings)
            return max(1, count)
        count = len(re.findall(r'[.!?]+', block_text))
        return max(1, count)

    @staticmethod
    def analyze(html_content: str, url: str, title: str, 
               word_count: int, sentence_count: int, paragraph_count: int, heading_count: int,
               target_keyword: Optional[str] = None) -> Dict[str, Any]:
        """
        Run all analysis modules and return consolidated results.
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        cleaned = TextQualityAnalyzer._clean_soup(soup)

        block_text = cleaned.get_text(separator='\n')
        visible_text = re.sub(r'\s+', ' ', block_text).strip()

        # Derive word/sentence counts from the SAME text used for analysis
        # to keep Flesch formula inputs self-consistent.
        local_words = visible_text.split()
        local_word_count = len(local_words)
        local_sentence_count = TextQualityAnalyzer._count_sentences(block_text)
        
        results = {}
        
        # 1. Readability Score (use text-consistent counts)
        results['readability'] = analyze_readability(visible_text, local_sentence_count, local_word_count)
        
        # 2. Grammar and Spelling Errors
        results['grammar_spelling'] = analyze_spelling_and_grammar(visible_text)
        
        # 3. Sentence Length / Complexity
        results['sentence_structure'] = analyze_sentence_structure(visible_text, local_sentence_count, local_word_count)
        
        # 4. Paragraph Structure
        results['paragraph_structure'] = analyze_paragraph_structure(local_word_count, paragraph_count)
        
        # 5. Keyword Usage
        results['keyword_usage'] = calculate_keyword_usage(visible_text, title, target_keyword)
        
        # 6. Clarity and Coherence
        results['clarity_coherence'] = analyze_clarity_coherence(visible_text)
        
        # 7. Content Duplication
        results['duplication'] = analyze_duplication(visible_text)
        
        # 8. Tone and Style Consistency
        results['tone_style'] = analyze_tone_style(visible_text)
        
        # 9. Text Ratio
        results['text_ratio'] = calculate_text_ratio(html_content, visible_text)
        
        # 10. Missing or Weak Information
        results['information_quality'] = analyze_information_quality(visible_text, heading_count)
        
        return results

# Singleton instance
analyzer = TextQualityAnalyzer()

from typing import Dict, Any, Optional
from bs4 import BeautifulSoup
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

class TextQualityAnalyzer:
    """
    Orchestrates all text quality analysis metrics.
    """
    
    @staticmethod
    def extract_visible_text(soup: BeautifulSoup) -> str:
        """Extract visible text from BeautifulSoup."""
        # Remove unwanted tags
        for el in soup(['script', 'style', 'noscript']):
            el.decompose()
        
        # Simple text extraction
        text = soup.get_text(separator=' ')
        return re.sub(r'\s+', ' ', text).strip()

    @staticmethod
    def analyze(html_content: str, url: str, title: str, 
               word_count: int, sentence_count: int, paragraph_count: int, heading_count: int,
               target_keyword: Optional[str] = None) -> Dict[str, Any]:
        """
        Run all analysis modules and return consolidated results.
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        visible_text = TextQualityAnalyzer.extract_visible_text(soup)

        # Derive word/sentence counts from the SAME text used for analysis
        # to keep Flesch formula inputs self-consistent.
        local_words = visible_text.split()
        local_word_count = len(local_words)
        local_sentences = [s for s in re.split(r'(?<=[.!?])\s+', visible_text) if s.strip()]
        local_sentence_count = max(len(local_sentences), 1)
        
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

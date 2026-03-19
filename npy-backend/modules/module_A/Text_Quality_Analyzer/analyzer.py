from typing import Dict, Any, Optional
from bs4 import BeautifulSoup, Comment
import re
from modules.module_A.Wordcount_analysis.wordcount_extractor import _clean_soup, _get_block_text, extract_visible_text, get_sentence_count

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


    def analyze(self, html_content: str, url: str, title: str, 
                word_count: Optional[int] = None, sentence_count: Optional[int] = None, paragraph_count: int = 0, heading_count: int = 0,
                target_keyword: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze content quality. Supports pre-calculated word and sentence counts
        to ensure Flesch score uses exactly the same metrics reported elsewhere.
        """
        soup = BeautifulSoup(html_content, 'lxml')
        
        # Use centralized extraction logic that matches SF
        work = _clean_soup(soup)
        body = work.body if work.body else work
        block_text = _get_block_text(body)
        visible_text = extract_visible_text(soup)
        
        # Determine exact word and sentence counts for Flesch consistency
        # SF splits words by non-word chars
        words_list = [w for w in re.split(r'\W+', visible_text) if w]
        local_word_count = word_count if word_count is not None else len(words_list)
        local_sentence_count = sentence_count if sentence_count is not None else get_sentence_count('', block_text)
        
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
        # Text Ratio should NOT exclude nav/footer
        # text_ratio module now handles its own extraction logic
        results['text_ratio'] = calculate_text_ratio(html_content)
        
        # 10. Missing or Weak Information
        results['information_quality'] = analyze_information_quality(visible_text, heading_count)
        
        return results

    def extract_metrics(self, html: str, word_count: Optional[int] = None, sentence_count: Optional[int] = None) -> Dict[str, Any]:
        """Extract all metrics safely from HTML."""
        if not html:
            return {}
            
        try:
            soup = BeautifulSoup(html, 'lxml')
            
            # Use module_A's text extraction logic which excludes nav/footer
            work = _clean_soup(soup)
            
            # Generate block text for accurate sentence counting
            body = work.body if work.body else work
            block_text = _get_block_text(body)
            
            # Word Count is based on visible text
            visible_text = extract_visible_text(soup)
            
            return self.analyze(
                html_content=html,
                url="",
                title="",
                word_count=word_count,
                sentence_count=sentence_count
            )
            
        except Exception as e:
            return {"error": str(e)}



# Singleton instance
analyzer = TextQualityAnalyzer()

import re
import hashlib
from typing import Dict, List, Any, Optional, Set
from bs4 import BeautifulSoup, Comment
from urllib.parse import urlparse

def extract_visible_text(soup: BeautifulSoup) -> str:
    """
    Extract visible text from BeautifulSoup object, ignoring hidden elements, scripts, styles.
    """
    # Create a copy to avoid mutating original
    temp_soup = BeautifulSoup(str(soup), 'html.parser')
    
    # Remove script, style, noscript, etc.
    for element in temp_soup(["script", "style", "noscript", "header", "footer", "nav", "aside"]):
        element.decompose()
        
    # Remove elements with hidden styles in style attribute
    for element in temp_soup.find_all(style=True):
        style = element.get('style', '').lower()
        if 'display:none' in style or 'display: none' in style or \
           'visibility:hidden' in style or 'visibility: hidden' in style:
            element.decompose()
            
    # Remove elements with aria-hidden="true"
    for element in temp_soup.find_all(attrs={"aria-hidden": "true"}):
        element.decompose()

    # Get text
    text = temp_soup.get_text(separator=' ')
    
    # Clean whitespace
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    text = ' '.join(chunk for chunk in chunks if chunk)
    
    return text

def normalize_text(text: str) -> str:
    """
    Normalize text for word counting (lowercase, remove punctuation).
    """
    # Replace non-alphanumeric with spaces
    text = re.sub(r'[^\w\s]', ' ', text.lower())
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def tokenize_words(text: str) -> List[str]:
    """
    Tokenize text into words.
    """
    return [w for w in text.split() if w.strip()]

def get_sentence_count(text: str) -> int:
    """
    Extract sentence count using delimiters.
    """
    if not text.strip():
        return 0
    sentences = re.split(r'[.!?]+', text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences and text.strip():
        return 1
    return len(sentences)

def get_paragraph_count(soup: BeautifulSoup) -> int:
    """
    Count paragraphs with substantial text.
    """
    p_tags = soup.find_all('p')
    count = 0
    for p in p_tags:
        if p.get_text().strip():
            count += 1
            
    if count == 0:
        # Fallback to divs with substantial text
        div_tags = soup.find_all('div')
        for div in div_tags:
            text = div.get_text().strip()
            if len(tokenize_words(text)) >= 20:
                count += 1
                
    if count == 0:
        visible_text = extract_visible_text(soup)
        if visible_text.strip():
            count = 1
            
    return count

def calculate_keyword_density(text: str, keyword: Optional[str]) -> Optional[float]:
    """
    Calculate keyword density (0-100).
    """
    if not keyword or not keyword.strip():
        return None
    
    norm_text = normalize_text(text)
    words = tokenize_words(norm_text)
    if not words:
        return 0.0
    
    norm_keyword = normalize_text(keyword)
    keyword_words = tokenize_words(norm_keyword)
    if not keyword_words:
        return 0.0
    
    count = 0
    if len(keyword_words) == 1:
        target = keyword_words[0]
        count = words.count(target)
    else:
        # Multi-word sliding window
        target_len = len(keyword_words)
        for i in range(len(words) - target_len + 1):
            if words[i:i+target_len] == keyword_words:
                count += 1
                
    density = (count / len(words)) * 100
    return round(density, 2)

def detect_thin_content(visible_word_count: int, unique_word_count: int) -> Dict[str, Any]:
    """
    Detect thin content based on word count and uniqueness.
    """
    if visible_word_count < 250:
        return {"thinContent": True, "thinContentReason": "Low word count"}
    
    if visible_word_count > 0:
        uniqueness_ratio = unique_word_count / visible_word_count
        if uniqueness_ratio < 0.3:
            return {"thinContent": True, "thinContentReason": "Low uniqueness"}
            
    return {"thinContent": False, "thinContentReason": None}

def extract_section_mapping(soup: BeautifulSoup) -> Dict[str, int]:
    """
    Map words to specific sections identified by headers.
    """
    # Simple implementation: find headers and collect text until next header
    mapping = {}
    headers = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    
    if not headers:
        text = extract_visible_text(soup)
        wc = len(tokenize_words(text))
        if wc > 0:
            mapping["Main Content"] = wc
        return mapping

    # Process each header
    for i, h in enumerate(headers):
        h_text = h.get_text().strip()
        if not h_text:
            continue
        
        # Collect text from next siblings until next header
        section_text = [h_text]
        for sibling in h.next_siblings:
            if sibling.name in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']:
                break
            if hasattr(sibling, 'get_text'):
                section_text.append(sibling.get_text())
                
        wc = len(tokenize_words(' '.join(section_text)))
        mapping[h_text] = wc
        
    return mapping

def generate_content_hash(text: str) -> str:
    """
    Generates an MD5 hash of normalized content.
    """
    norm = re.sub(r'\s+', ' ', text.lower()).strip()
    return hashlib.md5(norm.encode('utf-8')).hexdigest()

def detect_intent(visible_text: str, url: str) -> str:
    """
    Simple intent detection: Informational (Blog) vs Transactional (Product).
    Ported from SergeService.ts detectIntent logic.
    """
    text_lower = visible_text.lower()
    url_lower = url.lower()
    
    blog_indicators = ['blog', 'guide', 'how to', 'tips', 'what is', 'learn', 'explained', 'definition']
    product_indicators = ['product', 'pricing', 'plans', 'buy', 'order', 'shop', 'deal', 'coupon', 'price']
    
    is_blog = any(ind in text_lower for ind in blog_indicators) or '/blog/' in url_lower or 'blog.' in url_lower
    is_product = any(ind in text_lower for ind in product_indicators) or '/product' in url_lower or '/pricing' in url_lower
    
    if is_blog and not is_product:
        return "blog"
    if is_product and not is_blog:
        return "product"
    return "general"

def extract_wordcount_analysis(html_content: str, url: str, target_keyword: Optional[str] = None) -> Dict[str, Any]:
    """
    Comprehensive wordcount analysis.
    """
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Total Word Count (all text except script/style/noscript)
    temp_soup = BeautifulSoup(html_content, 'html.parser')
    for el in temp_soup(["script", "style", "noscript"]):
        el.decompose()
    total_text = temp_soup.get_text()
    total_word_count = len(tokenize_words(total_text))
    
    # Visible Word Count
    visible_text = extract_visible_text(soup)
    visible_words = tokenize_words(visible_text)
    visible_word_count = len(visible_words)
    
    # Unique Word Count
    unique_words = set(tokenize_words(normalize_text(visible_text)))
    unique_word_count = len(unique_words)
    
    # Text-to-HTML Ratio
    html_size = len(html_content.encode('utf-8'))
    visible_text_size = len(visible_text.encode('utf-8'))
    ratio = (visible_text_size / html_size * 100) if html_size > 0 else 0
    
    # Sentence and Paragraph counts
    sentence_count = get_sentence_count(visible_text)
    paragraph_count = get_paragraph_count(soup)
    
    # Averages
    avg_sentence_len = round(visible_word_count / sentence_count, 2) if sentence_count > 0 else 0
    avg_paragraph_len = round(visible_word_count / paragraph_count, 2) if paragraph_count > 0 else 0
    
    # Keyword Density
    density = calculate_keyword_density(visible_text, target_keyword)
    
    # Thin Content
    thin_check = detect_thin_content(visible_word_count, unique_word_count)
    
    # Section Mapping
    section_mapping = extract_section_mapping(soup)
    section_breakdown = {k: round((v / visible_word_count * 100), 2) for k, v in section_mapping.items()} if visible_word_count > 0 else {}
    
    # Heading mapping (level prefixed)
    heading_mapping = {}
    for h in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
        level = h.name.upper()
        h_text = h.get_text().strip()
        if h_text:
            key = f"{level}: {h_text}"
            # find words until next h of same or higher level
            words = []
            for s in h.next_siblings:
                if s.name and re.match(r'^h[1-6]$', s.name.lower()):
                    if int(s.name[1]) <= int(h.name[1]):
                        break
                if hasattr(s, 'get_text'):
                    words.append(s.get_text())
            heading_mapping[key] = len(tokenize_words(' '.join(words)))

    # Content Type Distribution
    content_type = detect_intent(visible_text, url)
    
    return {
        "totalWordCount": max(total_word_count, visible_word_count),
        "visibleWordCount": visible_word_count,
        "uniqueWordCount": unique_word_count,
        "textToHtmlRatio": round(ratio, 2),
        "sentenceCount": sentence_count,
        "paragraphCount": paragraph_count,
        "averageSentenceLength": avg_sentence_len,
        "averageParagraphLength": avg_paragraph_len,
        "keywordDensity": density,
        "thinContent": thin_check["thinContent"],
        "thinContentReason": thin_check["thinContentReason"],
        "duplicateContent": False, # Requires session
        "duplicateWithUrls": [], # Requires session
        "sectionWordCountMapping": section_mapping,
        "sectionWordCountBreakdown": section_breakdown,
        "headingWordCountMapping": heading_mapping,
        "wordCountDistribution": {
            "contentType": content_type,
            "isBlog": content_type == "blog",
            "isProduct": content_type == "product"
        }
    }

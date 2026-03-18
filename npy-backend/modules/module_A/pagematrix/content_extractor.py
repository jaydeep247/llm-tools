from bs4 import BeautifulSoup, Comment
import re
import json

# Tags whose subtree is never visible
_STRIP_TAGS = ['script', 'style', 'noscript', 'svg', 'iframe', 'template']

# CSS classes that hide content visually (screen-reader / accessibility text)
_HIDDEN_CLASSES = re.compile(
    r'\b(?:screen-reader-text|sr-only|visually-hidden|'
    r'visually-hidden-focusable|elementor-screen-only|'
    r'clip-text|assistive-text|offscreen-text)\b',
    re.IGNORECASE,
)


def _clean_soup(soup: BeautifulSoup) -> BeautifulSoup:
    """Remove all non-visible content from a soup copy (SF-compatible)."""
    work = BeautifulSoup(str(soup), 'lxml')

    for c in work.find_all(string=lambda s: isinstance(s, Comment)):
        c.extract()

    for element in work(_STRIP_TAGS):
        element.extract()

    for element in work.find_all(style=True):
        style = (getattr(element, 'attrs', None) or {}).get('style', '').lower().replace(' ', '')
        if 'display:none' in style or 'visibility:hidden' in style:
            element.extract()

    for element in work.find_all(attrs={'hidden': True}):
        element.extract()

    for element in work.find_all(attrs={'aria-hidden': 'true'}):
        element.extract()

    for element in work.find_all(class_=_HIDDEN_CLASSES):
        element.extract()

    return work


def extract_visible_text(soup: BeautifulSoup) -> str:
    """Extract visible text (SF-compatible). Returns flat string."""
    work = _clean_soup(soup)
    text = work.get_text(separator=' ')
    return re.sub(r'\s+', ' ', text).strip()


def count_sentences_sf(text: str, block_text: str = '') -> int:
    """Count sentences using SF-compatible block-aware methodology."""
    source = block_text if block_text else text
    if not source or not source.strip():
        return 0
    if '\n' in source:
        count = 0
        for line in source.split('\n'):
            line = line.strip()
            if not line:
                continue
            endings = len(re.findall(r'[.!?]+', line))
            count += max(1, endings)
        return max(1, count)
    count = len(re.findall(r'[.!?]+', source))
    return max(1, count)

def normalize_text(text: str) -> str:
    """
    Normalize text for word counting.
    """
    text = text.lower()
    text = re.sub(r'[^\w\s]', ' ', text) # Replace punctuation with spaces
    text = re.sub(r'\s+', ' ', text) # Normalize whitespace
    return text.strip()

def tokenize_words(text: str) -> list:
    """
    Tokenize text into words.
    """
    return [w for w in text.split() if w]

def extract_word_count(soup: BeautifulSoup, target_keyword: str = None) -> dict:
    """
    Extract comprehensive word count analysis.
    """
    # We need a copy because we're going to strip elements
    # copy.copy() is shallow, so we parse string again for deep copy equivalent
    soup_clone = BeautifulSoup(str(soup), 'lxml')
    
    # 1. Total Word Count (all text except script/style)
    for element in soup_clone(['script', 'style', 'noscript']):
        element.extract()
    total_text = soup_clone.get_text(separator=' ')
    total_words = tokenize_words(total_text)
    total_word_count = len(total_words)
    
    # 2. Visible Word Count
    # Reset clone for visible text extraction
    soup_visible = BeautifulSoup(str(soup), 'lxml')
    work = _clean_soup(soup_visible)
    block_text = work.get_text(separator='\n')
    visible_text = re.sub(r'\s+', ' ', block_text).strip()
    visible_words = tokenize_words(normalize_text(visible_text))
    visible_word_count = len(visible_words)
    
    # 3. Unique Word Count
    unique_word_count = len(set(visible_words))
    
    # 4. Text to HTML Ratio
    html_content = str(soup)
    html_size = len(html_content.encode('utf-8'))
    text_size = len(visible_text.encode('utf-8'))
    text_to_html_ratio = round((text_size / html_size) * 100, 2) if html_size > 0 else 0
    
    # 5. Sentence Count (SF-compatible block-aware)
    sentence_count = count_sentences_sf(visible_text, block_text=block_text)
        
    # 6. Paragraph Count
    # Count <p> tags with text
    soup_p = BeautifulSoup(str(soup), 'lxml')
    paragraphs = soup_p.find_all('p')
    paragraph_count = 0
    for p in paragraphs:
        if p.get_text().strip():
            paragraph_count += 1
            
    # Fallback to divs if no p tags
    if paragraph_count == 0:
        divs = soup_p.find_all('div')
        for div in divs:
            # Simple heuristic: div with > 20 words is a paragraph
            if len(tokenize_words(div.get_text())) >= 20:
                paragraph_count += 1
                
    if paragraph_count == 0 and visible_word_count > 0:
        paragraph_count = 1
        
    # Averages
    avg_sentence_length = round(visible_word_count / sentence_count, 2) if sentence_count > 0 else 0
    avg_paragraph_length = round(visible_word_count / paragraph_count, 2) if paragraph_count > 0 else 0
    
    # Keyword Density
    keyword_density = None
    if target_keyword:
        target_words = tokenize_words(normalize_text(target_keyword))
        if target_words:
            if len(target_words) == 1:
                # Single word
                count = visible_words.count(target_words[0])
            else:
                # Phrase (simple sliding window)
                count = 0
                k_len = len(target_words)
                for i in range(len(visible_words) - k_len + 1):
                    if visible_words[i:i+k_len] == target_words:
                        count += 1
            
            if visible_word_count > 0:
                keyword_density = round((count / visible_word_count) * 100, 2)
            else:
                keyword_density = 0
                
    # Thin content
    thin_content = False
    thin_content_reason = None
    
    if visible_word_count < 250:
        thin_content = True
        thin_content_reason = 'Low word count'
    elif visible_word_count > 0:
        uniqueness = unique_word_count / visible_word_count
        if uniqueness < 0.3:
            thin_content = True
            thin_content_reason = 'Low uniqueness'
            
    return {
        'totalWordCount': total_word_count,
        'visibleWordCount': visible_word_count,
        'uniqueWordCount': unique_word_count,
        'textToHtmlRatio': text_to_html_ratio,
        'sentenceCount': sentence_count,
        'paragraphCount': paragraph_count,
        'averageSentenceLength': avg_sentence_length,
        'averageParagraphLength': avg_paragraph_length,
        'keywordDensity': keyword_density,
        'thinContent': thin_content,
        'thinContentReason': thin_content_reason
    }

def extract_tables(soup: BeautifulSoup) -> dict:
    """
    Extract HTML tables info.
    """
    tables_info = []
    
    for idx, table in enumerate(soup.find_all('table')):
        headers = []
        rows_data = []
        
        # Extract headers
        thead = table.find('thead')
        if thead:
            for th in thead.find_all(['th', 'td']):
                headers.append(th.get_text().strip())
        
        # Extract rows
        tbody = table.find('tbody')
        rows = tbody.find_all('tr') if tbody else table.find_all('tr')
        
        # If no explicit headers yet, check first row
        start_idx = 0
        if not headers and rows:
            first_row = rows[0]
            if first_row.find('th'):
                for th in first_row.find_all(['th', 'td']):
                    headers.append(th.get_text().strip())
                start_idx = 1
        
        for row in rows[start_idx:]:
            cells = [cell.get_text().strip() for cell in row.find_all(['td', 'th'])]
            if any(cells): # Skip empty rows
                rows_data.append(cells)
                
        row_count = len(rows_data)
        col_count = len(headers) if headers else (len(rows_data[0]) if rows_data else 0)
        
        has_data = row_count > 0
        has_headers = len(headers) > 0
        is_structured = has_headers and has_data and col_count > 1
        
        if row_count > 0 and col_count > 0:
             tables_info.append({
                'index': idx,
                'rowCount': row_count,
                'columnCount': col_count,
                'hasHeaders': has_headers,
                'hasData': has_data,
                'isStructured': is_structured,
                'headers': headers if headers else None,
                # 'data': rows_data, # Omit full data to save space if needed
                'caption': table.find('caption').get_text().strip() if table.find('caption') else None
             })
             
    meaningful_tables = [t for t in tables_info if t['rowCount'] >= 2 and t['columnCount'] >= 2]
    
    return {
        'tables': tables_info,
        'tableCount': len(tables_info),
        'meaningfulTableCount': len(meaningful_tables),
        'hasTables': len(tables_info) > 0
    }

def extract_faqs(soup: BeautifulSoup) -> dict:
    """
    Extract FAQ information using multiple signals.
    """
    faq_pairs = []
    methods = []
    
    # 1. Schema
    scripts = soup.find_all('script', attrs={'type': 'application/ld+json'})
    found_schema = False
    
    for script in scripts:
        if not script.string: continue
        try:
            data = json.loads(script.string)
            schemas = data if isinstance(data, list) else [data]
            
            for schema in schemas:
                if schema.get('@type') == 'FAQPage':
                    found_schema = True
                    methods.append('schema')
                    for item in schema.get('mainEntity', []):
                        if item.get('@type') == 'Question':
                            q = item.get('name')
                            a = item.get('acceptedAnswer', {}).get('text')
                            if q and a:
                                faq_pairs.append({
                                    'question': q,
                                    'answer': a,
                                    'source': 'schema'
                                })
        except:
            pass
            
    # 2. HTML Heuristics (simplified compared to Node.js version)
    # Looking for class="faq" or similar
    if not found_schema:
        # Simple heuristic check
        faq_elements = soup.select('.faq, #faq, .accordion')
        if faq_elements:
             methods.append('heuristic')
             # Not implementing full extraction for heuristic to keep it simple for now
             # Just signaling that heuristics were found
            
    return {
        'hasFaqs': len(faq_pairs) > 0,
        'faqCount': len(faq_pairs),
        'faqPairs': faq_pairs, # Only schema pairs populated robustly
        'detectionMethod': ', '.join(set(methods)) if methods else 'none'
    }

def extract_amp_links(soup: BeautifulSoup) -> str:
    """Extract AMP HTML link."""
    link = soup.find('link', attrs={'rel': 'amphtml'})
    return link.get('href', '').strip() if link else None

def extract_mobile_alternate(soup: BeautifulSoup) -> str:
    """Extract mobile alternate link."""
    # <link rel="alternate" media="..." href="...">
    links = soup.find_all('link', attrs={'rel': 'alternate'})
    for link in links:
        media = link.get('media', '').lower()
        href = link.get('href', '').strip()
        if href and ('max-width' in media or 'handheld' in media or 'mobile' in media):
            return href
    return None

from bs4 import BeautifulSoup, Comment
import re
import json

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

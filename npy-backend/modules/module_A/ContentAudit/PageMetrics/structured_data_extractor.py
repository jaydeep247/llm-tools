import json
from bs4 import BeautifulSoup
from typing import List, Dict, Any, Optional

def extract_structured_data(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """
    Extract structured data (JSON-LD) from a page.
    """
    structured_data_items = []
    
    # Extract JSON-LD
    scripts = soup.find_all('script', attrs={'type': 'application/ld+json'})
    for script in scripts:
        try:
            content = script.string
            if content:
                data = json.loads(content)
                structured_data_items.append({
                    'type': 'json-ld',
                    'schemaType': data.get('@type') or data.get('type'),
                    'data': data
                })
        except:
            # Invalid JSON or parsing error, skip silently
            pass
            
    # TODO: Extract Microdata and RDFa (if needed)
    
    return structured_data_items

def identify_structured_data_types(structured_data_items: List[Dict[str, Any]]) -> List[str]:
    """
    Identify unique types of structured data present on the page.
    """
    types = set()
    for item in structured_data_items:
        schema_type = item.get('schemaType')
        if schema_type:
            if isinstance(schema_type, list):
                types.update(schema_type)
            else:
                types.add(schema_type)
    return list(types)

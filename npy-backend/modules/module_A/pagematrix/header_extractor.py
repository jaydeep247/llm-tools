from bs4 import BeautifulSoup, Tag
from typing import List, Dict, Any, Optional

def generate_simple_xpath(element: Tag) -> str:
    """
    Generate a simple XPath for an element.
    Note: This is a simplified version.
    """
    components = []
    child = element
    for parent in child.parents:
        siblings = parent.find_all(child.name, recursive=False)
        count = len(siblings)
        if count > 1:
            index = siblings.index(child) + 1
            components.append(f"{child.name}[{index}]")
        else:
            components.append(child.name)
        child = parent
        if parent.name == 'html':
            break
            
    components.reverse()
    return "/" + "/".join(components)

def build_header_structure(soup: BeautifulSoup) -> List[Dict[str, Any]]:
    """
    Build hierarchical header structure.
    """
    structure = []
    
    # Find all heading tags in document order
    headings = soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    
    for heading in headings:
        tag_name = heading.name.lower()
        level = int(tag_name[1])
        text = heading.get_text().strip()
        xpath = generate_simple_xpath(heading)
        
        structure.append({
            'level': level,
            'text': text,
            'xpath': xpath,
            'tag': tag_name
        })
        
    return structure

def detect_header_issues(structure: List[Dict[str, Any]]) -> List[str]:
    """
    Detect header structure issues.
    """
    issues = []
    
    if not structure:
        issues.append('No heading tags found on page')
        return issues
    
    # Check if first heading is H1
    if structure[0]['level'] != 1:
        issues.append('First heading should be H1')
        
    # Check for skipped heading levels
    for i in range(1, len(structure)):
        prev_level = structure[i-1]['level']
        curr_level = structure[i]['level']
        
        if curr_level > prev_level + 1:
            issues.append(f"Skipped heading level: H{prev_level} followed by H{curr_level}")
            
    # Check for multiple H1s
    h1_count = len([h for h in structure if h['level'] == 1])
    if h1_count > 1:
        issues.append(f"Multiple H1 tags found ({h1_count}). Should have only one H1 per page.")
        
    # Check for empty headings
    empty_headings = [h for h in structure if not h['text']]
    if empty_headings:
        issues.append(f"{len(empty_headings)} empty heading tag(s) found")
        
    return issues

def extract_headers(soup: BeautifulSoup) -> Dict[str, Any]:
    """
    Extract all heading tags and analyze structure.
    """
    # Extract H1-H6 tags text
    h1_tags = [h.get_text().strip() for h in soup.find_all('h1')]
    h2_tags = [h.get_text().strip() for h in soup.find_all('h2')]
    h3_tags = [h.get_text().strip() for h in soup.find_all('h3')]
    h4_tags = [h.get_text().strip() for h in soup.find_all('h4')]
    h5_tags = [h.get_text().strip() for h in soup.find_all('h5')]
    h6_tags = [h.get_text().strip() for h in soup.find_all('h6')]
    
    has_multiple_h1 = len(h1_tags) > 1
    
    # Build header structure
    header_structure = build_header_structure(soup)
    
    # Detect issues
    issues = detect_header_issues(header_structure)
    
    return {
        'h1Tags': h1_tags,
        'hasMultipleH1': has_multiple_h1,
        'h2Tags': h2_tags,
        'h3Tags': h3_tags,
        'h4Tags': h4_tags,
        'h5Tags': h5_tags,
        'h6Tags': h6_tags,
        'headerStructure': header_structure,
        'headerIssues': issues,
        'isValidStructure': len(issues) == 0
    }

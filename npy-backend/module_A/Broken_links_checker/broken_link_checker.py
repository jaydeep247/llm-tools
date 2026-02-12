from typing import Dict, List, Any, Optional

def is_broken_link(status_code: int) -> bool:
    """
    Check if a status code indicates a broken link.
    """
    return status_code == 404 or status_code == 410 or status_code >= 500 or status_code == 0

def get_error_type(status_code: int) -> Optional[str]:
    """
    Determine the error type based on status code.
    """
    if status_code == 404: return 'not_found'
    if status_code == 410: return 'gone'
    if 500 <= status_code < 600: return 'server_error'
    if status_code == 0: return 'timeout'
    return None

def get_error_message(status_code: int) -> str:
    """
    Get human-readable error message.
    """
    messages = {
        0: 'Timeout or unreachable',
        404: 'Page not found',
        410: 'Page gone (permanently removed)',
        500: 'Internal server error',
        502: 'Bad gateway',
        503: 'Service unavailable',
        504: 'Gateway timeout'
    }
    
    if status_code in messages:
        return messages[status_code]
    
    if 500 <= status_code < 600:
        return f'Server error ({status_code})'
    
    return f'HTTP error {status_code}'

def analyze_broken_links(links: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze a list of link statuses and identify broken ones.
    Input links list element: {'url': str, 'status_code': int, 'is_internal': bool}
    """
    broken_links = []
    
    for link in links:
        sc = link.get('status_code', 200)
        if is_broken_link(sc):
            broken_links.append({
                'url': link['url'],
                'statusCode': sc,
                'isBroken': True,
                'errorType': get_error_type(sc),
                'errorMessage': get_error_message(sc),
                'isInternal': link.get('is_internal', False)
            })
            
    internal_broken = [l for l in broken_links if l['isInternal']]
    external_broken = [l for l in broken_links if not l['isInternal']]
    
    return {
        'totalBrokenLinks': len(broken_links),
        'brokenInternalLinks': len(internal_broken),
        'brokenExternalLinks': len(external_broken),
        'brokenLinksList': broken_links,
        'summary': {
            'notFound': len([l for l in broken_links if l['errorType'] == 'not_found']),
            'gone': len([l for l in broken_links if l['errorType'] == 'gone']),
            'serverError': len([l for l in broken_links if l['errorType'] == 'server_error']),
            'timeout': len([l for l in broken_links if l['errorType'] == 'timeout']),
        }
    }

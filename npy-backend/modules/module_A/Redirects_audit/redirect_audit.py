from typing import Dict, List, Any, Optional
from urllib.parse import urlparse, urljoin

def normalize_url_for_comparison(url: str) -> Dict[str, str]:
    """
    Normalize URL for comparison (trailing slashes, www, protocol).
    """
    try:
        parsed = urlparse(url.lower())
        hostname = parsed.netloc
        if hostname.startswith('www.'):
            hostname = hostname[4:]
            
        path = parsed.path
        if path != '/' and path.endswith('/'):
            path = path[:-1]
        if not path:
            path = '/'
            
        return {
            'protocol': parsed.scheme,
            'hostname': hostname,
            'path': path,
            'query': parsed.query
        }
    except:
        return {'protocol': '', 'hostname': url.lower(), 'path': '/', 'query': ''}

def compare_urls(url1: str, url2: str) -> bool:
    """
    Compare two URLs with flexible matching.
    """
    if not url1 or not url2:
        return False
        
    n1 = normalize_url_for_comparison(url1)
    n2 = normalize_url_for_comparison(url2)
    
    return n1['hostname'] == n2['hostname'] and n1['path'] == n2['path']

def analyze_redirects(hops: List[Dict[str, Any]], canonical_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyze redirect hops.
    Each hop: {'url': str, 'status_code': int, 'headers': dict}
    """
    if not hops:
        return {
            'hasRedirect': False,
            'chainLength': 0,
            'isBroken': False,
            'overallStatus': 'ok'
        }

    chain = []
    has_301 = False
    has_302 = False
    has_307 = False
    
    for hop in hops:
        sc = hop.get('status_code', 200)
        chain.append({
            'url': hop['url'],
            'statusCode': sc,
            'redirectType': str(sc) if 300 <= sc < 400 else None
        })
        if sc == 301: has_301 = True
        elif sc == 302: has_302 = True
        elif sc == 307: has_307 = True

    final_hop = hops[-1]
    final_url = final_hop['url']
    final_sc = final_hop.get('status_code', 0)
    
    # Check for loop
    visited = set()
    has_loop = False
    for hop in hops:
        if hop['url'] in visited:
            has_loop = True
            break
        visited.add(hop['url'])

    # Canonical alignment
    alignment = 'not_found'
    if canonical_url:
        if compare_urls(final_url, canonical_url):
            alignment = 'match'
        else:
            alignment = 'mismatch'

    status = 'ok'
    issues = []
    if len(chain) > 2:
        issues.append(f"Redirect chain detected: {len(chain)-1} hops")
        status = 'warning'
    if has_loop:
        issues.append("Redirect loop detected")
        status = 'error'
    if final_sc >= 400:
        issues.append(f"Broken redirect: Final URL returns {final_sc}")
        status = 'error'

    return {
        'originalUrl': hops[0]['url'] if hops else '',
        'finalUrl': final_url,
        'finalStatusCode': final_sc,
        'has301Redirect': has_301,
        'has302Redirect': has_302,
        'has307Redirect': has_307,
        'redirectChain': chain,
        'chainLength': len(chain) - 1,
        'hasRedirectChain': len(chain) > 2,
        'hasRedirectLoop': has_loop,
        'isBrokenRedirect': final_sc >= 400,
        'canonicalAlignment': alignment,
        'overallStatus': status,
        'issues': issues
    }

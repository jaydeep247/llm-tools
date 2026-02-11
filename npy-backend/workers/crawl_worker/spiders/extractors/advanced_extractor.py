"""
Advanced Extractor
Extracts advanced SEO fields: meta keywords, HTTP headers, structured data, etc.
"""

from scrapy.http import Response
from typing import Dict, Any, List
import json
from urllib.parse import urlparse


class AdvancedExtractor:
    """Extracts advanced SEO and technical fields"""
    
    @staticmethod
    def extract(response: Response) -> Dict[str, Any]:
        """
        Extract advanced fields from page
        
        Args:
            response: Scrapy response object
            
        Returns:
            Dictionary of advanced fields
        """
        fields = {}
        
        # Meta Keywords
        meta_keywords = response.css('meta[name="keywords"]::attr(content)').get()
        fields['meta_keywords'] = meta_keywords or ''
        fields['meta_keywords_length'] = len(meta_keywords) if meta_keywords else 0
        
        # Meta Refresh
        meta_refresh = response.css('meta[http-equiv="refresh"]::attr(content)').get()
        fields['meta_refresh'] = meta_refresh or ''
        
        # Viewport
        viewport = response.css('meta[name="viewport"]::attr(content)').get()
        fields['viewport'] = viewport or ''
        
        # HTTP Headers
        fields['x_robots_tag'] = response.headers.get('X-Robots-Tag', b'').decode('utf-8', errors='ignore')
        
        # Parse Link header for rel=next/prev
        link_header = response.headers.get('Link', b'').decode('utf-8', errors='ignore')
        fields['http_rel_next'] = AdvancedExtractor._parse_link_header(link_header, 'next')
        fields['http_rel_prev'] = AdvancedExtractor._parse_link_header(link_header, 'prev')
        
        # Last Modified
        fields['last_modified'] = response.headers.get('Last-Modified', b'').decode('utf-8', errors='ignore')
        
        # Cookies
        set_cookie = response.headers.get('Set-Cookie', b'').decode('utf-8', errors='ignore')
        fields['cookies'] = set_cookie
        
        # HTTP Version (from response meta if available)
        fields['http_version'] = 'HTTP/1.1'  # Default, Scrapy doesn't expose this easily
        
        # amphtml Link
        amphtml_link = response.css('link[rel="amphtml"]::attr(href)').get()
        fields['amphtml_link'] = response.urljoin(amphtml_link) if amphtml_link else ''
        
        # Mobile Alternate Link
        mobile_link = response.css('link[media*="handheld"]::attr(href), link[rel="alternate"][media*="mobile"]::attr(href)').get()
        fields['mobile_alternate_link'] = response.urljoin(mobile_link) if mobile_link else ''
        
        # Structured Data (JSON-LD)
        structured_data = AdvancedExtractor._extract_structured_data(response)
        fields['has_structured_data'] = len(structured_data) > 0
        fields['structured_data_types'] = structured_data
        fields['structured_data_count'] = len(structured_data)
        
        # Table Count
        tables = response.css('table')
        fields['table_count'] = len(tables)
        
        # FAQ Detection
        faq_data = AdvancedExtractor._detect_faq(response)
        fields['has_faq'] = faq_data['has_faq']
        fields['faq_count'] = faq_data['count']
        
        # AMP Detection
        fields['is_amp'] = AdvancedExtractor._is_amp_page(response)
        
        # Mixed Content Detection
        mixed_content = AdvancedExtractor._detect_mixed_content(response)
        fields['has_mixed_content'] = mixed_content['has_mixed']
        fields['mixed_content_urls'] = mixed_content['urls']
        
        # Redirect Info (from meta if available)
        fields['redirect_url'] = response.meta.get('redirect_urls', [''])[-1] if response.meta.get('redirect_urls') else ''
        fields['redirect_type'] = ''  # Will be populated by middleware if redirect occurred
        
        # Page Sizes
        fields['page_size_bytes'] = len(response.body)
        fields['html_size_bytes'] = len(response.text.encode('utf-8'))
        
        return fields
    
    @staticmethod
    def _parse_link_header(link_header: str, rel_type: str) -> str:
        """Parse Link header for specific rel type"""
        if not link_header:
            return ''
        
        # Simple parser for Link header
        # Format: <url>; rel="next", <url2>; rel="prev"
        parts = link_header.split(',')
        for part in parts:
            if f'rel="{rel_type}"' in part or f"rel='{rel_type}'" in part:
                # Extract URL between < and >
                if '<' in part and '>' in part:
                    url = part[part.index('<')+1:part.index('>')]
                    return url
        return ''
    
    @staticmethod
    def _extract_structured_data(response: Response) -> List[str]:
        """Extract structured data types from JSON-LD"""
        types = []
        
        # JSON-LD
        json_ld_scripts = response.css('script[type="application/ld+json"]::text').getall()
        for script in json_ld_scripts:
            try:
                data = json.loads(script)
                if isinstance(data, dict) and '@type' in data:
                    types.append(data['@type'])
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and '@type' in item:
                            types.append(item['@type'])
            except json.JSONDecodeError:
                pass
        
        return types
    
    @staticmethod
    def _detect_faq(response: Response) -> Dict[str, Any]:
        """Detect FAQ sections"""
        # Check for FAQ schema
        json_ld_scripts = response.css('script[type="application/ld+json"]::text').getall()
        faq_count = 0
        
        for script in json_ld_scripts:
            try:
                data = json.loads(script)
                if isinstance(data, dict):
                    if data.get('@type') == 'FAQPage':
                        faq_count = len(data.get('mainEntity', []))
                        return {'has_faq': True, 'count': faq_count}
                elif isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict) and item.get('@type') == 'FAQPage':
                            faq_count = len(item.get('mainEntity', []))
                            return {'has_faq': True, 'count': faq_count}
            except json.JSONDecodeError:
                pass
        
        # Check for common FAQ patterns in HTML
        faq_elements = response.css('[class*="faq"], [id*="faq"], [class*="FAQ"], [id*="FAQ"]')
        if faq_elements:
            # Count question elements
            questions = response.css('[class*="question"], [itemprop="question"], dt')
            return {'has_faq': True, 'count': len(questions)}
        
        return {'has_faq': False, 'count': 0}
    
    @staticmethod
    def _is_amp_page(response: Response) -> bool:
        """Check if page is AMP"""
        # Check for AMP HTML attribute
        if response.css('html[amp], html[⚡]'):
            return True
        
        # Check for AMP script
        if response.css('script[src*="ampproject.org"]'):
            return True
        
        return False
    
    @staticmethod
    def _detect_mixed_content(response: Response) -> Dict[str, Any]:
        """Detect mixed content (HTTP resources on HTTPS page)"""
        if not response.url.startswith('https://'):
            return {'has_mixed': False, 'urls': []}
        
        mixed_urls = []
        
        # Check images
        img_srcs = response.css('img::attr(src)').getall()
        for src in img_srcs:
            if src.startswith('http://'):
                mixed_urls.append(src)
        
        # Check scripts
        script_srcs = response.css('script::attr(src)').getall()
        for src in script_srcs:
            if src.startswith('http://'):
                mixed_urls.append(src)
        
        # Check stylesheets
        css_hrefs = response.css('link[rel="stylesheet"]::attr(href)').getall()
        for href in css_hrefs:
            if href.startswith('http://'):
                mixed_urls.append(href)
        
        # Check iframes
        iframe_srcs = response.css('iframe::attr(src)').getall()
        for src in iframe_srcs:
            if src.startswith('http://'):
                mixed_urls.append(src)
        
        return {
            'has_mixed': len(mixed_urls) > 0,
            'urls': mixed_urls[:10]  # Limit to first 10
        }

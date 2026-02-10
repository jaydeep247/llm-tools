"""
Basic Field Extractor
Extracts basic page fields: URL, title, meta description, status code, etc.
"""

from scrapy.http import Response
from typing import Dict, Any, Optional
import hashlib
from datetime import datetime


class BasicExtractor:
    """Extracts basic page fields"""
    
    @staticmethod
    def extract(response: Response, start_time: float) -> Dict[str, Any]:
        """
        Extract basic page fields
        
        Args:
            response: Scrapy response object
            start_time: Request start timestamp
            
        Returns:
            Dictionary of basic fields
        """
        # Calculate response time
        response_time = int((datetime.now().timestamp() - start_time) * 1000)
        
        # Extract title
        title = response.css('title::text').get()
        if title:
            title = title.strip()
        else:
            title = ''
        
        # Extract meta description
        meta_description = response.css('meta[name="description"]::attr(content)').get()
        if meta_description:
            meta_description = meta_description.strip()
        else:
            meta_description = ''
        
        # Content type
        content_type = response.headers.get('Content-Type', b'').decode('utf-8', errors='ignore')
        
        # Calculate content hash
        body_text = response.css('body ::text').getall()
        visible_text = ' '.join([t.strip() for t in body_text if t.strip()])
        normalized_text = visible_text.lower().replace('  ', ' ').strip()
        content_hash = hashlib.sha256(normalized_text.encode()).hexdigest()
        
        return {
            'url': response.url,
            'title': title,
            'title_length': len(title),
            'meta_description': meta_description,
            'description_length': len(meta_description),
            'status_code': response.status,
            'response_time': response_time,
            'content_type': content_type,
            'content_hash': content_hash,
            'timestamp': datetime.now().isoformat(),
        }

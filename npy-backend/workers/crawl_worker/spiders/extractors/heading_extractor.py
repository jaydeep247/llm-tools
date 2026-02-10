"""
Heading Extractor
Extracts heading structure: H1-H6 tags
"""

from scrapy.http import Response
from typing import Dict, Any, List


class HeadingExtractor:
    """Extracts heading structure"""
    
    @staticmethod
    def extract(response: Response) -> Dict[str, Any]:
        """
        Extract heading tags
        
        Args:
            response: Scrapy response object
            
        Returns:
            Dictionary of heading fields
        """
        return {
            'h1_tags': [h.strip() for h in response.css('h1::text').getall() if h.strip()],
            'h2_tags': [h.strip() for h in response.css('h2::text').getall() if h.strip()],
            'h3_tags': [h.strip() for h in response.css('h3::text').getall() if h.strip()],
            'h4_tags': [h.strip() for h in response.css('h4::text').getall() if h.strip()],
            'h5_tags': [h.strip() for h in response.css('h5::text').getall() if h.strip()],
            'h6_tags': [h.strip() for h in response.css('h6::text').getall() if h.strip()],
        }

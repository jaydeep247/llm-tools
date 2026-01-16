"""
Mock DataForSEO Client for Testing Without Subscription
Use this when you don't have Backlinks API subscription
"""

from typing import Dict, Any, Optional
import random


class MockDataForSEOClient:
    """Mock client that returns demo data for testing"""
    
    def __init__(self, username: Optional[str] = None, password: Optional[str] = None):
        """Initialize mock client"""
        self.username = username or "demo"
        self.password = password or "demo"
    
    def get_all_backlinks(
        self,
        target: str,
        mode: str = 'as_is',
        backlinks_status_type: str = 'live',
        include_subdomains: bool = True,
        include_indirect_links: bool = True,
        exclude_internal_backlinks: bool = True,
        rank_scale: str = 'one_thousand',
        max_results: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Return mock backlink data for testing
        """
        
        # Generate realistic-looking mock data
        num_backlinks = random.randint(50, 500)
        num_domains = random.randint(20, 100)
        
        # Mock sample backlinks
        mock_backlinks = []
        mock_domains = [
            "example-blog.com",
            "tech-news-site.com",
            "industry-magazine.com",
            "partner-website.com",
            "directory-site.com",
            "review-platform.com",
            "news-portal.com",
            "business-blog.com",
            "marketing-hub.com",
            "seo-resource.com"
        ]
        
        for i in range(min(num_domains, len(mock_domains))):
            domain = mock_domains[i]
            mock_backlinks.append({
                'domain_from': domain,
                'url_from': f'https://{domain}/article-{i+1}',
                'url_to': f'https://{target}/page',
                'dofollow': random.choice([True, True, True, False]),  # 75% dofollow
                'domain_from_rank': random.randint(10, 90),
                'page_from_rank': random.randint(20, 95),
                'rank': random.randint(30, 95),
                'backlink_spam_score': random.randint(0, 15),
                'domain_from_ip': f'192.168.{random.randint(1, 255)}.{random.randint(1, 255)}',
                'anchor': random.choice(['Click here', 'Read more', 'Visit site', target, '']),
                'item_type': random.choice(['anchor', 'image', 'link', 'redirect']),
                'is_new': random.random() < 0.1,  # 10% new
                'is_lost': False,
                'is_broken': random.random() < 0.05,  # 5% broken
                'tld_from': domain.split('.')[-1],
                'domain_from_country': random.choice(['US', 'GB', 'CA', 'AU', 'IN']),
                'domain_from_platform_type': [random.choice(['blog', 'cms', 'ecommerce', 'news'])]
            })
        
        # Calculate metrics
        dofollow_count = sum(1 for bl in mock_backlinks if bl['dofollow'])
        nofollow_count = len(mock_backlinks) - dofollow_count
        
        return {
            'success': True,
            'backlinks': mock_backlinks,
            'total_count': num_backlinks,
            'fetched_count': len(mock_backlinks),
            'pages_fetched': 1,
            'metrics': {
                'total_backlinks': len(mock_backlinks),
                'dofollow_count': dofollow_count,
                'nofollow_count': nofollow_count,
                'dofollow_percentage': round((dofollow_count / len(mock_backlinks)) * 100, 2) if mock_backlinks else 0,
                'unique_domains': num_domains,
                'unique_ips': num_domains - 5,  # Some shared IPs
                'avg_domain_rank': round(random.uniform(40, 70), 2),
                'avg_page_rank': round(random.uniform(50, 75), 2),
                'avg_backlink_rank': round(random.uniform(45, 72), 2),
                'avg_spam_score': round(random.uniform(2, 10), 2),
                'new_backlinks': random.randint(1, 10),
                'lost_backlinks': random.randint(0, 5),
                'broken_backlinks': random.randint(0, 3),
                'link_types': {
                    'anchor': dofollow_count,
                    'image': random.randint(5, 15),
                    'link': random.randint(3, 10),
                    'redirect': random.randint(1, 5)
                },
                'top_anchors': {
                    target: random.randint(10, 30),
                    'Click here': random.randint(5, 15),
                    'Read more': random.randint(3, 10),
                    'Visit site': random.randint(2, 8)
                },
                'top_referring_domains': {domain: random.randint(1, 5) for domain in mock_domains[:10]},
                'quality_score': round(random.uniform(60, 85), 2)
            }
        }


# Instructions for using mock client:
"""
To use mock data instead of real API calls:

1. In competitor_analysis.py, replace:
   from app.services.dataforseo_client import DataForSEOClient
   
   with:
   from app.services.dataforseo_client_mock import MockDataForSEOClient as DataForSEOClient

2. Restart backend

3. All backlink data will now be demo data for testing

4. When you get real Backlinks API subscription, switch back to real client
"""


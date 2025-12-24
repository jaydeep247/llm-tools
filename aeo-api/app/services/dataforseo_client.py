"""
DataForSEO REST Client
Handles API communication with DataForSEO
"""

from http.client import HTTPSConnection
from base64 import b64encode
from json import loads, dumps
import os
from typing import Dict, Any, Optional


class DataForSEOClient:
    """REST client for DataForSEO API"""
    
    domain = "api.dataforseo.com"
    
    def __init__(self, username: Optional[str] = None, password: Optional[str] = None):
        """
        Initialize the DataForSEO client
        
        Args:
            username: DataForSEO API username (defaults to env var DATAFORSEO_USERNAME)
            password: DataForSEO API password (defaults to env var DATAFORSEO_PASSWORD)
        """
        self.username = username or os.getenv('DATAFORSEO_USERNAME', '')
        self.password = password or os.getenv('DATAFORSEO_PASSWORD', '')
        
        if not self.username or not self.password:
            raise ValueError(
                "DataForSEO credentials not provided. "
                "Set DATAFORSEO_USERNAME and DATAFORSEO_PASSWORD environment variables "
                "or pass them to the constructor."
            )
    
    def request(self, path: str, method: str, data: Optional[Any] = None) -> Dict[str, Any]:
        """
        Make a request to the DataForSEO API
        
        Args:
            path: API endpoint path
            method: HTTP method (GET or POST)
            data: Request data (for POST requests)
            
        Returns:
            API response as dictionary
        """
        connection = HTTPSConnection(self.domain)
        try:
            base64_bytes = b64encode(
                f"{self.username}:{self.password}".encode("ascii")
            ).decode("ascii")
            headers = {
                'Authorization': f'Basic {base64_bytes}',
                'Content-Encoding': 'gzip'
            }
            connection.request(method, path, headers=headers, body=data)
            response = connection.getresponse()
            return loads(response.read().decode())
        finally:
            connection.close()
    
    def get(self, path: str) -> Dict[str, Any]:
        """Make a GET request"""
        return self.request(path, 'GET')
    
    def post(self, path: str, data: Any) -> Dict[str, Any]:
        """Make a POST request"""
        if isinstance(data, str):
            data_str = data
        else:
            data_str = dumps(data)
        return self.request(path, 'POST', data_str)
    
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
        Fetch ALL backlinks for a domain with automatic pagination
        
        Args:
            target: domain, subdomain or webpage to get backlinks for
            mode: results grouping type (as_is, one_per_domain, one_per_anchor)
            backlinks_status_type: what backlinks to return (all, live, lost)
            include_subdomains: whether to include subdomains
            include_indirect_links: whether to include indirect links
            exclude_internal_backlinks: whether to exclude internal backlinks
            rank_scale: scale for rank values (one_hundred, one_thousand)
            max_results: maximum number of results to fetch (None = fetch all)
            
        Returns:
            Dict containing all backlinks data with aggregated metrics
        """
        
        all_backlinks = []
        search_after_token = None
        total_count = 0
        page_count = 0
        
        # Base request payload
        base_payload = {
            "target": target,
            "mode": mode,
            "backlinks_status_type": backlinks_status_type,
            "include_subdomains": include_subdomains,
            "include_indirect_links": include_indirect_links,
            "exclude_internal_backlinks": exclude_internal_backlinks,
            "rank_scale": rank_scale,
            "limit": 1000  # Maximum allowed per request
        }
        
        try:
            while True:
                page_count += 1
                
                # Create payload for this request
                payload = [base_payload.copy()]
                
                # Add search_after_token if this is a subsequent request
                if search_after_token:
                    payload[0]["search_after_token"] = search_after_token
                
                # Make API request
                response = self.post('/v3/backlinks/backlinks/live', payload)
                
                # Check for errors
                if response.get('status_code') != 20000:
                    error_msg = response.get('status_message', 'Unknown error')
                    return {
                        'success': False,
                        'error': f'DataForSEO API error: {error_msg}',
                        'backlinks': [],
                        'total_count': 0
                    }
                
                # Extract results
                tasks = response.get('tasks', [])
                if not tasks or not tasks[0].get('result'):
                    break
                
                result = tasks[0]['result'][0]
                items = result.get('items', [])
                
                # Store total count from first request
                if page_count == 1:
                    total_count = result.get('total_count', 0)
                
                # Add backlinks to our list
                all_backlinks.extend(items)
                
                # Check if we should continue
                if max_results and len(all_backlinks) >= max_results:
                    all_backlinks = all_backlinks[:max_results]
                    break
                
                # Get token for next request
                search_after_token = result.get('search_after_token')
                
                # Break if no more results or no token
                if not search_after_token or len(items) == 0:
                    break
                
                # Break if we've fetched all available results
                if len(all_backlinks) >= total_count:
                    break
            
            # Aggregate metrics
            metrics = self._aggregate_backlink_metrics(all_backlinks)
            
            return {
                'success': True,
                'target': target,
                'backlinks': all_backlinks,
                'total_count': total_count,
                'fetched_count': len(all_backlinks),
                'pages_fetched': page_count,
                'metrics': metrics,
                'mode': mode,
                'backlinks_status_type': backlinks_status_type
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': f'Failed to fetch backlinks: {str(e)}',
                'backlinks': all_backlinks,
                'total_count': total_count,
                'fetched_count': len(all_backlinks)
            }
    
    def _aggregate_backlink_metrics(self, backlinks: list) -> Dict[str, Any]:
        """
        Aggregate metrics from backlinks data
        
        Args:
            backlinks: list of backlink objects
            
        Returns:
            Dict containing aggregated metrics
        """
        if not backlinks:
            return {
                'total_backlinks': 0,
                'dofollow_count': 0,
                'nofollow_count': 0,
                'dofollow_percentage': 0.0,
                'unique_domains': 0,
                'unique_ips': 0,
                'avg_domain_rank': 0.0,
                'avg_page_rank': 0.0,
                'avg_backlink_rank': 0.0,
                'avg_spam_score': 0.0,
                'new_backlinks': 0,
                'lost_backlinks': 0,
                'broken_backlinks': 0,
                'link_types': {},
                'top_anchors': {},
                'top_referring_domains': {},
                'quality_score': 0.0
            }
        
        # Initialize counters
        dofollow_count = 0
        nofollow_count = 0
        domains = set()
        ips = set()
        domain_ranks = []
        page_ranks = []
        backlink_ranks = []
        new_count = 0
        lost_count = 0
        broken_count = 0
        link_types = {}
        anchors = {}
        referring_domains = {}
        spam_scores = []
        
        for backlink in backlinks:
            # Dofollow/Nofollow
            if backlink.get('dofollow', False):
                dofollow_count += 1
            else:
                nofollow_count += 1
            
            # Unique domains and IPs
            domain = backlink.get('domain_from') or ''
            if domain:
                domains.add(domain)
                # Count backlinks per domain
                referring_domains[domain] = referring_domains.get(domain, 0) + 1
            
            ip = backlink.get('domain_from_ip') or ''
            if ip:
                ips.add(ip)
            
            # Ranks
            domain_rank = backlink.get('domain_from_rank', 0)
            if domain_rank:
                domain_ranks.append(domain_rank)
            
            page_rank = backlink.get('page_from_rank', 0)
            if page_rank:
                page_ranks.append(page_rank)
            
            bl_rank = backlink.get('rank', 0)
            if bl_rank:
                backlink_ranks.append(bl_rank)
            
            # Spam score
            spam_score = backlink.get('backlink_spam_score', 0)
            if spam_score is not None:
                spam_scores.append(spam_score)
            
            # Status
            if backlink.get('is_new', False):
                new_count += 1
            if backlink.get('is_lost', False):
                lost_count += 1
            if backlink.get('is_broken', False):
                broken_count += 1
            
            # Link types
            item_type = backlink.get('item_type', 'unknown')
            link_types[item_type] = link_types.get(item_type, 0) + 1
            
            # Anchors - handle None values properly
            anchor = backlink.get('anchor')
            if anchor:
                anchor = str(anchor).strip()
                if anchor:
                    anchors[anchor] = anchors.get(anchor, 0) + 1
        
        # Calculate averages
        avg_domain_rank = sum(domain_ranks) / len(domain_ranks) if domain_ranks else 0
        avg_page_rank = sum(page_ranks) / len(page_ranks) if page_ranks else 0
        avg_backlink_rank = sum(backlink_ranks) / len(backlink_ranks) if backlink_ranks else 0
        avg_spam_score = sum(spam_scores) / len(spam_scores) if spam_scores else 0
        
        # Get top anchors (top 10)
        top_anchors = dict(sorted(anchors.items(), key=lambda x: x[1], reverse=True)[:10])
        
        # Get top referring domains (top 20)
        top_referring = dict(sorted(referring_domains.items(), key=lambda x: x[1], reverse=True)[:20])
        
        return {
            'total_backlinks': len(backlinks),
            'dofollow_count': dofollow_count,
            'nofollow_count': nofollow_count,
            'dofollow_percentage': round((dofollow_count / len(backlinks)) * 100, 2) if backlinks else 0,
            'unique_domains': len(domains),
            'unique_ips': len(ips),
            'avg_domain_rank': round(avg_domain_rank, 2),
            'avg_page_rank': round(avg_page_rank, 2),
            'avg_backlink_rank': round(avg_backlink_rank, 2),
            'avg_spam_score': round(avg_spam_score, 2),
            'new_backlinks': new_count,
            'lost_backlinks': lost_count,
            'broken_backlinks': broken_count,
            'link_types': link_types,
            'top_anchors': top_anchors,
            'top_referring_domains': top_referring,
            'quality_score': self._calculate_backlink_quality_score({
                'dofollow_percentage': (dofollow_count / len(backlinks)) * 100 if backlinks else 0,
                'avg_domain_rank': avg_domain_rank,
                'avg_spam_score': avg_spam_score,
                'broken_percentage': (broken_count / len(backlinks)) * 100 if backlinks else 0
            })
        }
    
    def _calculate_backlink_quality_score(self, metrics: Dict[str, float]) -> float:
        """
        Calculate overall backlink quality score (0-100)
        
        Args:
            metrics: dict with dofollow_percentage, avg_domain_rank, avg_spam_score, broken_percentage
            
        Returns:
            Quality score from 0-100
        """
        # Weight factors
        dofollow_weight = 0.25
        rank_weight = 0.40
        spam_weight = 0.25
        broken_weight = 0.10
        
        # Normalize and calculate component scores
        dofollow_score = min(metrics.get('dofollow_percentage', 0), 100)
        rank_score = min((metrics.get('avg_domain_rank', 0) / 1000) * 100, 100)  # Assuming 1000 scale
        spam_score = max(100 - metrics.get('avg_spam_score', 0), 0)  # Lower spam = higher score
        broken_score = max(100 - metrics.get('broken_percentage', 0), 0)  # Fewer broken = higher score
        
        # Calculate weighted score
        quality_score = (
            (dofollow_score * dofollow_weight) +
            (rank_score * rank_weight) +
            (spam_score * spam_weight) +
            (broken_score * broken_weight)
        )
        
        return round(quality_score, 2)


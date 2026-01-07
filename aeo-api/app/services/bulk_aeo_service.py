"""
Bulk AEO Audit Service
Updated for OpenAI Paid Key (Fast Mode) - No Rate Limiting
"""

import logging
import requests
import time
import xml.etree.ElementTree as ET
from urllib.parse import urlparse, urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed

# Import your existing Orchestrator
from .aeo_services_consolidated import AEOServiceOrchestrator

class BulkAEOService:
    def __init__(self):
        self.orchestrator = AEOServiceOrchestrator()
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    
    def fetch_sitemap_urls(self, sitemap_url: str, limit: int = 50) -> list:
        """Extract URLs from a Sitemap or Sitemap Index"""
        try:
            print(f"DEBUG: Fetching sitemap: {sitemap_url}")
            if not sitemap_url.startswith(('http://', 'https://')):
                sitemap_url = 'https://' + sitemap_url

            response = requests.get(sitemap_url, headers=self.headers, timeout=15)
            
            if response.status_code != 200:
                logging.error(f"Sitemap fetch failed: {response.status_code}")
                return []
                
            try:
                root = ET.fromstring(response.content)
            except ET.ParseError:
                # Fallback for text-based sitemaps
                return [line.strip() for line in response.text.split('\n') if line.strip().startswith('http')][:limit]
            
            namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
            urls = []

            # Handle Sitemap Index (Nested Sitemaps)
            if 'sitemapindex' in root.tag:
                print("DEBUG: Detected Sitemap Index. Fetching sub-sitemaps...")
                sub_sitemaps = root.findall('ns:sitemap', namespace)
                if not sub_sitemaps:
                    sub_sitemaps = root.findall('sitemap')

                for sub in sub_sitemaps:
                    if len(urls) >= limit: break
                    loc = sub.find('ns:loc', namespace)
                    if loc is None: loc = sub.find('loc')
                        
                    if loc is not None and loc.text:
                        sub_url = loc.text.strip()
                        print(f"DEBUG: Fetching sub-sitemap: {sub_url}")
                        sub_urls = self._fetch_single_sitemap_urls(sub_url, limit - len(urls))
                        urls.extend(sub_urls)
            else:
                urls = self._fetch_single_sitemap_urls(sitemap_url, limit)
            
            unique_urls = list(set(urls))
            print(f"DEBUG: Found {len(unique_urls)} unique URLs")
            return unique_urls[:limit]

        except Exception as e:
            logging.error(f"Sitemap parse error: {str(e)}")
            return []

    def _fetch_single_sitemap_urls(self, url: str, limit: int) -> list:
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code != 200: return []
            
            root = ET.fromstring(response.content)
            namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
            extracted = []
            
            url_tags = root.findall('ns:url', namespace)
            if not url_tags: url_tags = root.findall('url')

            for url_tag in url_tags:
                loc = url_tag.find('ns:loc', namespace)
                if loc is None: loc = url_tag.find('loc')
                    
                if loc is not None and loc.text:
                    link = loc.text.strip()
                    if not link.startswith(('http://', 'https://')):
                        parsed_sitemap = urlparse(url)
                        base_url = f"{parsed_sitemap.scheme}://{parsed_sitemap.netloc}"
                        link = urljoin(base_url, link)
                    extracted.append(link)
            
            return extracted[:limit]
        except Exception as e:
            print(f"DEBUG: Error fetching sub-sitemap {url}: {e}")
            return []

    def _analyze_fast(self, url: str):
        """
        Run analysis WITHOUT 20s delay (OpenAI Mode).
        Uses ThreadPool to run efficiently.
        """
        try:
            print(f"DEBUG: Analyzing {url}...")
            return self.orchestrator.run_complete_analysis(url)
        except Exception as e:
            return {"error": str(e)}

    def run_bulk_audit(self, urls: list) -> dict:
        results_summary = {
            'total_pages': len(urls),
            'successful_scans': 0,
            'average_llm_score': 0,
            'average_readability': 0,
            'average_structure_score': 0,
            'missing_entities_ratio': 0,
            'weak_content_ratio': 0
        }
        
        detailed_results = []
        total_llm_score = 0
        total_readability = 0
        total_structure = 0
        pages_with_zero_entities = 0
        pages_with_weak_content = 0 
        
        # ✅ UPGRADE: Changed max_workers to 5 for parallel processing
        # This is safe with Paid OpenAI API
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_url = {
                executor.submit(self._analyze_fast, url): url 
                for url in urls
            }
            
            for future in as_completed(future_to_url):
                url = future_to_url[future]
                try:
                    data = future.result()
                    
                    if 'error' in data:
                        print(f"DEBUG: Error in result for {url}: {data['error']}")
                        detailed_results.append({
                            'url': url, 
                            'error': data['error'], 
                            'status': 'Error',
                            'llm_score': 0
                        })
                        continue

                    llm_score = data.get('llm_friendliness_score', 0)
                    detailed = data.get('detailed_analysis', {})
                    kb_data = detailed.get('knowledge_base', {})
                    struct_data = detailed.get('structured_data', {})
                    
                    readability = kb_data.get('readability_score', 0)
                    entities_count = kb_data.get('entities_count', 0)
                    fact_density = kb_data.get('fact_density', 0)
                    structure_score = struct_data.get('score', 0)
                    
                    total_llm_score += llm_score
                    total_readability += readability
                    total_structure += structure_score
                    
                    if entities_count == 0:
                        pages_with_zero_entities += 1
                    if fact_density < 1.0:
                        pages_with_weak_content += 1

                    results_summary['successful_scans'] += 1
                    
                    detailed_results.append({
                        'url': url,
                        'llm_score': llm_score,
                        'readability': readability,
                        'entities': entities_count,
                        'fact_density': round(fact_density, 1),
                        'structure_score': structure_score,
                        'status': 'Good' if llm_score > 60 else 'Weak'
                    })
                    
                except Exception as e:
                    logging.error(f"Bulk scan failed for {url}: {str(e)}")
                    detailed_results.append({
                        'url': url, 
                        'error': str(e), 
                        'status': 'Error',
                        'llm_score': 0
                    })

        count = results_summary['successful_scans']
        if count > 0:
            results_summary['average_llm_score'] = round(total_llm_score / count, 1)
            results_summary['average_readability'] = round(total_readability / count, 1)
            results_summary['average_structure_score'] = round(total_structure / count, 1)
            results_summary['missing_entities_ratio'] = round((pages_with_zero_entities / count) * 100, 1)
            results_summary['weak_content_ratio'] = round((pages_with_weak_content / count) * 100, 1)

        return {
            'summary': results_summary,
            'details': detailed_results
        }
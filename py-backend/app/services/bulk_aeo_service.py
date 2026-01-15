"""
Bulk AEO Audit Service
Updated for OpenAI Paid Key (Fast Mode) - No Rate Limiting
Uses ONLY OpenAI for bulk scanning to save cost/quota on other models.
"""

import logging
import requests
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
        """Extract URLs from a Sitemap or Sitemap Index with robust fallback"""
        try:
            logging.info(f"Fetching sitemap: {sitemap_url}")
            if not sitemap_url.startswith(('http://', 'https://')):
                sitemap_url = 'https://' + sitemap_url

            response = requests.get(sitemap_url, headers=self.headers, timeout=20)
            
            if response.status_code != 200:
                error_msg = f"Sitemap fetch failed with status code {response.status_code}"
                logging.error(error_msg)
                raise Exception(error_msg)

            content = response.content
            urls = []

            # 1. Try XML Parsing
            try:
                root = ET.fromstring(content)
                namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}

                # Check if it's a Sitemap Index (list of other sitemaps)
                if 'sitemapindex' in root.tag:
                    logging.info("Detected Sitemap Index. Fetching sub-sitemaps...")
                    sub_sitemaps = root.findall('ns:sitemap', namespace)
                    if not sub_sitemaps:
                        sub_sitemaps = root.findall('sitemap')

                    for sub in sub_sitemaps:
                        if len(urls) >= limit: break
                        loc = sub.find('ns:loc', namespace)
                        if loc is None: loc = sub.find('loc')
                            
                        if loc is not None and loc.text:
                            sub_url = loc.text.strip()
                            # Recursively fetch sub-sitemap URLs
                            sub_urls = self._fetch_urls_from_content(sub_url, limit - len(urls))
                            urls.extend(sub_urls)
                else:
                    # It's a regular sitemap, extract URLs directly from content we already have
                    urls = self._extract_urls_from_xml(root, limit)

            except ET.ParseError:
                logging.warning("XML parse failed, falling back to text mode")
                # 2. Fallback: Treat as text file (one URL per line)
                urls = [line.strip() for line in response.text.split('\n') if line.strip().startswith(('http://', 'https://'))][:limit]

            # 3. Double Check: If XML parsed but found 0 URLs, try text fallback logic anyway
            if not urls and response.text:
                logging.info("XML found no URLs, trying text fallback...")
                urls = [line.strip() for line in response.text.split('\n') if line.strip().startswith(('http://', 'https://'))][:limit]

            unique_urls = list(set(urls))
            logging.info(f"Found {len(unique_urls)} unique URLs from sitemap")
            return unique_urls[:limit]

        except Exception as e:
            logging.error(f"Sitemap processing error: {str(e)}")
            raise Exception(f"Sitemap error: {str(e)}")

    def _fetch_urls_from_content(self, url: str, limit: int) -> list:
        """Helper to fetch a single sitemap URL and extract links"""
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            if response.status_code != 200: return []
            
            try:
                root = ET.fromstring(response.content)
                return self._extract_urls_from_xml(root, limit)
            except ET.ParseError:
                 return [line.strip() for line in response.text.split('\n') if line.strip().startswith('http')][:limit]
        except Exception:
            return []

    def _extract_urls_from_xml(self, root: ET.Element, limit: int) -> list:
        """Extracts URLs from an XML ElementTree root"""
        namespace = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        extracted = []
        
        url_tags = root.findall('ns:url', namespace)
        if not url_tags: url_tags = root.findall('url')

        for url_tag in url_tags:
            if len(extracted) >= limit: break
            loc = url_tag.find('ns:loc', namespace)
            if loc is None: loc = url_tag.find('loc')
                
            if loc is not None and loc.text:
                link = loc.text.strip()
                extracted.append(link)
        
        return extracted

    def _analyze_fast(self, url: str):
        """Run analysis using Orchestrator with OpenAI only"""
        try:
            logging.info(f"Analyzing URL: {url}")
            response = requests.get(url, headers=self.headers, timeout=15)
            html_content = response.text
            
            return self.orchestrator.run_complete_analysis(
                url=url, 
                html_content=html_content,
                target_models=['openai'] 
            )
        except Exception as e:
            logging.error(f"Analysis failed for {url}: {str(e)}")
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
        
        with ThreadPoolExecutor(max_workers=2) as executor: 
            future_to_url = {
                executor.submit(self._analyze_fast, url): url 
                for url in urls
            }
            
            for future in as_completed(future_to_url):
                url = future_to_url[future]
                try:
                    data = future.result()
                    
                    if 'error' in data:
                        logging.warning(f"Error in result for {url}: {data['error']}")
                        detailed_results.append({
                            'url': url, 
                            'error': data['error'], 
                            'status': 'Error',
                            'llm_score': 0
                        })
                        continue
                    
                    # EXTRACT METRICS SAFELY
                    metrics = data.get('metrics', {})
                    llm_score = metrics.get('llm_friendliness_score', data.get('overall_score', 0))
                    readability = metrics.get('readability_score', 0)
                    structure_score = metrics.get('structured_data_completeness', 0)
                    
                    # Calculate Entity Ratio
                    # If using old 'knowledge_base' structure fallback
                    if 'entity_presence_ratio' in metrics:
                        entity_ratio = metrics['entity_presence_ratio']
                    else:
                        # Fallback calculation if orchestrator hasn't updated
                        kb = data.get('detailed_analysis', {}).get('knowledge_base', {})
                        ec = kb.get('entity_coverage', {})
                        found = len(ec.get('found_entities', []))
                        missing = len(ec.get('missing_entities', []))
                        total = found + missing
                        entity_ratio = round((found / total) * 100, 1) if total > 0 else 0

                    total_llm_score += llm_score
                    total_readability += readability
                    total_structure += structure_score
                    
                    if entity_ratio < 10.0:
                        pages_with_zero_entities += 1
                    if llm_score < 40.0:
                        pages_with_weak_content += 1

                    results_summary['successful_scans'] += 1
                    
                    detailed_results.append({
                        'url': url,
                        'llm_score': llm_score,
                        'readability': readability,
                        'entities_ratio': entity_ratio,  # <-- Correct Key for Frontend
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
"""
Bulk AEO Audit Service for npy-backend
Processes multiple URLs in parallel and aggregates Module C metrics.
"""

import asyncio
import logging
from typing import List, Dict
from .runner import ModuleCRunner

logger = logging.getLogger("bulk_audit")


class BulkAuditService:
    """
    Service for running bulk AEO audits across multiple URLs.
    Uses async processing to analyze pages concurrently.
    """
    
    def __init__(self):
        self.runner = ModuleCRunner()
    
    async def run_bulk_audit(self, urls: List[str], job_id: str = "bulk_audit") -> Dict:
        """
        Run Module C analysis on multiple URLs in parallel.
        Fetches HTML from URLs via HTTP.
        
        Args:
            urls: List of URLs to analyze
            job_id: Base job ID for tracking (will append index for each URL)
            
        Returns:
            Dict with 'summary' and 'details' keys containing aggregated metrics
        """
        # Create analysis tasks for all URLs
        tasks = []
        for idx, url in enumerate(urls):
            task = self._analyze_single_url(url, f"{job_id}_{idx}")
            tasks.append(task)
        
        # Execute all tasks concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Aggregate and return results
        return self._aggregate_results(results, urls)

    
    async def run_bulk_audit_from_crawl(self, job_id: str) -> Dict:
        """
        Run bulk audit on all pages crawled for a job.
        Fetches pages from MongoDB and loads HTML from disk.
        
        Args:
            job_id: Job ID to analyze
            
        Returns:
            Dict with 'summary' and 'details' keys containing aggregated metrics
        """
        from utils.mongo import mongo_manager
        from utils.storage import load_raw_html_sync
        
        # Fetch all pages for this job from MongoDB
        try:
            pages_cursor = mongo_manager.pages.find({"jobId": job_id})
            pages = list(pages_cursor)
            
            if not pages:
                logger.warning(f"No pages found for job {job_id}")
                return {
                    'summary': {
                        'total_pages': 0,
                        'successful_scans': 0,
                        'average_llm_score': 0,
                        'average_readability': 0,
                        'average_entity_coverage': 0,
                        'missing_entities_ratio': 0,
                        'weak_content_ratio': 0
                    },
                    'details': []
                }
            
            # Create analysis tasks for all pages
            tasks = []
            page_urls = []
            
            for page in pages:
                url = page.get('url')
                if url:
                    # Each page has its own sub-job-id for HTML storage
                    page_job_id = page.get('_id') or f"{job_id}_{url}"
                    task = self._analyze_crawled_page(url, str(page_job_id), job_id)
                    tasks.append(task)
                    page_urls.append(url)
            
            # Execute all tasks concurrently
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Aggregate results using the same logic as run_bulk_audit
            return self._aggregate_results(results, page_urls)
            
        except Exception as e:
            logger.error(f"Failed to run bulk audit from crawl: {str(e)}")
            return {"error": str(e)}
    
    async def _analyze_crawled_page(self, url: str, page_job_id: str, main_job_id: str) -> Dict:
        """
        Analyze a single crawled page by loading HTML from disk.
        
        Args:
            url: URL of the page
            page_job_id: Job ID used to store this page's HTML
            main_job_id: Main crawl job ID
            
        Returns:
            Module C analysis results
        """
        try:
            from utils.storage import load_raw_html
            
            # Try to load HTML from disk
            html_content = await load_raw_html(page_job_id)
            
            if not html_content:
                # Fallback: try with main job ID
                html_content = await load_raw_html(main_job_id)
            
            if not html_content:
                logger.warning(f"No HTML found for {url} (job_id: {page_job_id})")
                return {"error": "HTML not found", "url": url}
            
            # Run Module C analysis with loaded HTML
            # IMPORTANT: skip_save=True to avoid creating duplicate HTML folders
            result = await self.runner.run(page_job_id, url, html_content=html_content, skip_save=True)
            return result
            
        except Exception as e:
            logger.error(f"Failed to analyze crawled page {url}: {str(e)}")
            return {"error": str(e), "url": url}

    
    async def _analyze_single_url(self, url: str, job_id: str) -> Dict:
        """
        Analyze a single URL using the Module C runner.
        Fetches HTML from the URL via HTTP.
        
        Args:
            url: URL to analyze
            job_id: Unique job ID for this analysis
            
        Returns:
            Module C analysis results
        """
        try:
            # Fetch HTML content from URL
            import aiohttp
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as response:
                    if response.status != 200:
                        return {"error": f"HTTP {response.status}", "url": url}
                    
                    # Read as bytes first, then decode with proper encoding
                    content_bytes = await response.read()
                    
                    # Try to get encoding from response headers
                    encoding = response.charset or 'utf-8'
                    
                    try:
                        html_content = content_bytes.decode(encoding)
                    except UnicodeDecodeError:
                        # Fallback to latin-1 which accepts all byte values
                        html_content = content_bytes.decode('latin-1')
            
            # Run Module C analysis with fetched HTML
            result = await self.runner.run(job_id, url, html_content=html_content)
            return result
        except asyncio.TimeoutError:
            logger.error(f"Timeout fetching {url}")
            return {"error": "Request timeout", "url": url}
        except Exception as e:
            logger.error(f"Failed to analyze {url}: {str(e)}")
            return {"error": str(e), "url": url}
    
    def _aggregate_results(self, results: List, urls: List[str]) -> Dict:
        """
        Aggregate analysis results into summary metrics.
        
        Args:
            results: List of Module C analysis results
            urls: List of URLs corresponding to results
            
        Returns:
            Dict with summary and details
        """
        results_summary = {
            'total_pages': len(urls),
            'successful_scans': 0,
            'average_llm_score': 0,
            'average_readability': 0,
            'average_entity_coverage': 0,
            'missing_entities_ratio': 0,
            'weak_content_ratio': 0
        }
        
        detailed_results = []
        total_llm_score = 0
        total_readability = 0
        total_entity_coverage = 0
        pages_with_missing_entities = 0
        pages_with_weak_content = 0
        
        # Process results
        for idx, result in enumerate(results):
            url = urls[idx]
            
            # Handle exceptions
            if isinstance(result, Exception):
                logger.error(f"Error analyzing {url}: {str(result)}")
                detailed_results.append({
                    'url': url,
                    'error': str(result),
                    'status': 'Error',
                    'llm_score': 0,
                    'readability': 0,
                    'entity_coverage': 0
                })
                continue
            
            # Handle error responses
            if 'error' in result:
                logger.warning(f"Analysis failed for {url}: {result['error']}")
                detailed_results.append({
                    'url': url,
                    'error': result['error'],
                    'status': 'Error',
                    'llm_score': 0,
                    'readability': 0,
                    'entity_coverage': 0
                })
                continue
            
            # Extract metrics from Module C response
            modules = result.get('modules', {})
            
            llm_score = modules.get('ai_presence', {}).get('score', 0)
            readability = modules.get('answerability', {}).get('score', 0)
            
            # Extract entity coverage from knowledge_base module
            kb_module = modules.get('knowledge_base', {})
            kb_score = kb_module.get('score', 0)
            entity_data = kb_module.get('entity_coverage', {})
            entity_coverage = entity_data.get('coverage_score', 0) if isinstance(entity_data, dict) else 0

            
            # Accumulate totals
            total_llm_score += llm_score
            total_readability += readability
            total_entity_coverage += entity_coverage
            
            # Track pages with issues
            if entity_coverage < 50:  # Less than 50% entity coverage
                pages_with_missing_entities += 1
            if llm_score < 40:  # LLM score below 40
                pages_with_weak_content += 1
            
            results_summary['successful_scans'] += 1
            
            # Add to detailed results
            detailed_results.append({
                'url': url,
                'llm_score': round(llm_score, 1),
                'readability': round(readability, 1),
                'entity_coverage': round(entity_coverage, 1),
                'kb_score': round(kb_score, 1),
                'overall_score': round(result.get('overall_score', 0), 1),
                'status': 'Good' if llm_score >= 60 else 'Weak'
            })

        
        # Calculate averages
        count = results_summary['successful_scans']
        if count > 0:
            results_summary['average_llm_score'] = round(total_llm_score / count, 1)
            results_summary['average_readability'] = round(total_readability / count, 1)
            results_summary['average_entity_coverage'] = round(total_entity_coverage / count, 1)
            results_summary['missing_entities_ratio'] = round((pages_with_missing_entities / count) * 100, 1)
            results_summary['weak_content_ratio'] = round((pages_with_weak_content / count) * 100, 1)
        
        
        return {
            'summary': results_summary,
            'details': detailed_results
        }




# Singleton instance
bulk_audit_service = BulkAuditService()


async def run_bulk_audit(urls: List[str], job_id: str = "bulk_audit") -> Dict:
    """
    Convenience function to run bulk audit.
    
    Args:
        urls: List of URLs to analyze
        job_id: Base job ID for tracking
        
    Returns:
        Aggregated bulk audit results
    """
    return await bulk_audit_service.run_bulk_audit(urls, job_id)

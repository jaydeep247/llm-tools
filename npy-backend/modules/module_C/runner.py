import asyncio
import logging
from typing import Dict, List
from .ai_presence import AIPresenceModule
from .answerability import AnswerabilityModule
from .knowledge_base import KnowledgeBaseModule
from .competitor_analysis import CompetitorAnalysisModule
from utils.storage import save_raw_html, load_raw_html

logger = logging.getLogger("module_c")

class ModuleCRunner:
    """
    Orchestrates the entire Module C (AEO) analysis.
    """
    def __init__(self):
        self.ai_presence = AIPresenceModule()
        self.answerability = AnswerabilityModule()
        self.knowledge_base = KnowledgeBaseModule()
        self.competitor = CompetitorAnalysisModule()

    async def run(self, job_id: str, url: str, html_content: str = None, skip_save: bool = False) -> Dict:
        """
        Runs complete Module C analysis.
        1. Validates/Saves HTML.
        2. Runs parallel sub-modules.
        3. Aggregates scores.
        
        Args:
            job_id: Job ID
            url: URL being analyzed
            html_content: HTML content (optional, will load from disk if not provided)
            skip_save: If True, don't save HTML to disk (useful for bulk audit)
        """
        logger.info(f"Starting Module C for job {job_id} / {url}")
        
        # 1. Data Handling
        if html_content:
            if not skip_save:
                await save_raw_html(job_id, html_content)
        else:
            # Try loading if not provided (assume fetched by earlier step)
            html_content = await load_raw_html(job_id)
            
        if not html_content:
            return {"error": "HTML content missing", "job_id": job_id}

            
        # 2. Robots extraction (Basic mechanism, in real env this comes from crawler)
        robots_txt = "" # Pass empty or implement robots fetcher if strict validity needed

        # 3. Parallel Execution
        # We use asyncio.gather to run all independent checks at once
        results = await asyncio.gather(
            self.ai_presence.run_analysis(url, html_content, robots_txt),
            self.answerability.run_analysis(html_content),
            self.knowledge_base.run_analysis(html_content, url),
            self.competitor.analyze_competitors(url),
            return_exceptions=True
        )
        
        ai_res, ans_res, kb_res, comp_res = results

        # Handle exceptions in results
        ai_res = ai_res if isinstance(ai_res, dict) else {"score": 0, "error": str(ai_res)}
        ans_res = ans_res if isinstance(ans_res, dict) else {"score": 0, "error": str(ans_res)}
        kb_res = kb_res if isinstance(kb_res, dict) else {"score": 0, "error": str(kb_res)}
        comp_res = comp_res if isinstance(comp_res, dict) else {"score": 0, "error": str(comp_res)}

        # 4. Final Aggregation
        overall_score = (
            (ai_res.get('score', 0) * 0.30) +
            (ans_res.get('score', 0) * 0.30) +
            (kb_res.get('score', 0) * 0.25) +
            (comp_res.get('score', 0) * 0.15)
        )

        return {
            "job_id": job_id,
            "url": url,
            "overall_score": round(overall_score, 1),
            "modules": {
                "ai_presence": ai_res,
                "answerability": ans_res,
                "knowledge_base": kb_res,
                "competitor_analysis": comp_res
            }
        }
    
    async def run_bulk_audit(self, urls: List[str], job_id: str = "bulk_audit") -> Dict:
        """
        Run bulk AEO audit across multiple URLs.
        
        Args:
            urls: List of URLs to analyze
            job_id: Base job ID for tracking
            
        Returns:
            Aggregated bulk audit results with summary and details
        """
        from .bulk_audit_service import run_bulk_audit
        return await run_bulk_audit(urls, job_id)

# Singleton entry point
runner = ModuleCRunner()

async def run_module_c(job_id: str, url: str, html_content: str = None):
    """
    Run Module C analysis for a job.
    - Runs single-page analysis on the main URL
    - If multiple pages were crawled, runs bulk audit on all pages
    """
    # Run single-page analysis
    single_page_result = await runner.run(job_id, url, html_content)
    
    # Check if this is a post-crawl job with multiple pages
    try:
        from utils.mongo import mongo_manager
        
        pages_count = mongo_manager.pages.count_documents({"jobId": job_id})
        
        if pages_count > 1:
            # Run bulk audit on all crawled pages
            logger.info(f"Found {pages_count} crawled pages for job {job_id}. Running bulk audit...")
            from .bulk_audit_service import bulk_audit_service
            
            bulk_result = await bulk_audit_service.run_bulk_audit_from_crawl(job_id)
            
            # Add bulk audit results to the response
            if 'modules' in single_page_result:
                single_page_result['modules']['bulk_audit'] = bulk_result
            else:
                single_page_result['bulk_audit'] = bulk_result
                
            logger.info(f"Bulk audit completed for job {job_id}")
        else:
            logger.info(f"Only {pages_count} page(s) found for job {job_id}. Skipping bulk audit.")
            
    except Exception as e:
        logger.error(f"Failed to run bulk audit for job {job_id}: {str(e)}")
        # Don't fail the entire job if bulk audit fails
        if 'modules' in single_page_result:
            single_page_result['modules']['bulk_audit'] = {"error": str(e)}
        else:
            single_page_result['bulk_audit'] = {"error": str(e)}
    
    return single_page_result


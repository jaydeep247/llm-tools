import asyncio
import logging
from typing import Dict, List
from bs4 import BeautifulSoup
from .ai_presence import AIPresenceModule
from .answerability import AnswerabilityModule
from .knowledge_base import KnowledgeBaseModule
from .competitor_analysis import CompetitorAnalysisModule
from .llm_simulator import LlmSimulatorModule
from .multi_model_insights import MultiModelInsights
from .actionable_insights import ActionableInsightsModule
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
        self.llm_simulator = LlmSimulatorModule()
        self.multi_model_insights = MultiModelInsights()
        self.actionable_insights = ActionableInsightsModule()

    async def run(self, job_id: str, url: str, html_content: str = None, skip_save: bool = False, query: str = None) -> Dict:
        """
        Runs complete Module C analysis.
        ...
        Args:
            job_id: Job ID
            url: URL being analyzed
            html_content: HTML content (optional, will load from disk if not provided)
            skip_save: If True, don't save HTML to disk (useful for bulk audit)
            query: Specific query for AI Answer Simulation (optional)
        """
        logger.info(f"Starting Module C for job {job_id} / {url}")
        
        # ... (html loading logic) ...
        if html_content:
            if not skip_save:
                await save_raw_html(job_id, html_content)
        else:
            html_content = await load_raw_html(job_id)
            
        if not html_content:
            return {"error": "HTML content missing", "job_id": job_id}

        # Find or Generate Query if not provided
        if not query:
            # Fallback: Extract title or use a generic query
            soup = BeautifulSoup(html_content, 'html.parser')
            title = soup.title.string if soup.title else ""
            query = f"What is {title}?" if title else f"What is the content of {url} about?"

        # 2. Robots extraction (Basic mechanism, in real env this comes from crawler)
        robots_txt = "" 

        # 3. Parallel Execution
        results = await asyncio.gather(
            self.ai_presence.run_analysis(url, html_content, robots_txt),
            self.answerability.run_analysis(html_content),
            self.knowledge_base.run_analysis(html_content, url),
            self.competitor.analyze_competitors(url),
            self.llm_simulator.simulate_answer(query, html_content),
            self.actionable_insights.run_analysis(html_content, url),
            return_exceptions=True
        )
        
        ai_res, ans_res, kb_res, comp_res, sim_res, actionable_insights_res = results

        # Handle exceptions in results
        ai_res = ai_res if isinstance(ai_res, dict) else {"score": 0, "error": str(ai_res)}
        ans_res = ans_res if isinstance(ans_res, dict) else {"score": 0, "error": str(ans_res)}
        kb_res = kb_res if isinstance(kb_res, dict) else {"score": 0, "error": str(kb_res)}
        comp_res = comp_res if isinstance(comp_res, dict) else {"score": 0, "error": str(comp_res)}
        sim_res = sim_res if isinstance(sim_res, dict) else {"error": str(sim_res)}

        # 4. Multi-Model Insights (Comparison analysis)
        multi_model_insights_res = {}
        if "simulations" in sim_res:
            # Extract raw answers for comparison
            responses = {}
            for provider, data in sim_res["simulations"].items():
                if isinstance(data, dict) and "answer" in data:
                    responses[provider] = data["answer"]
            
            if responses:
                multi_model_insights_res = self.multi_model_insights.perform_analysis(responses)

        # Handle exceptions for actionable insights
        actionable_insights_res = actionable_insights_res if isinstance(actionable_insights_res, dict) else {"error": str(actionable_insights_res)}
        multi_model_insights_res = multi_model_insights_res if isinstance(multi_model_insights_res, dict) else {"error": str(multi_model_insights_res)}

        # 5. Final Aggregation
        overall_score = (
            (ai_res.get('score', 0) * 0.25) +
            (ans_res.get('score', 0) * 0.25) +
            (kb_res.get('score', 0) * 0.20) +
            (comp_res.get('score', 0) * 0.10) +
            (sim_res.get('cross_model_metrics', {}).get('consistency_score', 0) * 0.20)
        )

        return {
            "job_id": job_id,
            "url": url,
            "overall_score": round(overall_score, 1),
            "modules": {
                "ai_presence": ai_res,
                "answerability": ans_res,
                "knowledge_base": kb_res,
                "competitor_analysis": comp_res,
                "llm_simulator": sim_res,
                "multi_model_insights": multi_model_insights_res,
                "actionable_insights": actionable_insights_res
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

async def run_module_c(job_id: str, url: str, html_content: str = None, query: str = None):
    """
    Run Module C analysis for a job.
    - Runs single-page analysis on the main URL
    - If multiple pages were crawled, runs bulk audit on all pages
    """
    # Run single-page analysis
    single_page_result = await runner.run(job_id, url, html_content, query=query)
    
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


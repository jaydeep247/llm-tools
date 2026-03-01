import asyncio
import logging
from typing import Dict, List
from bs4 import BeautifulSoup
from .ai_presence import AIPresenceModule
from .answerability import AnswerabilityModule
from .knowledge_base import KnowledgeBaseModule
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
        self.llm_simulator = LlmSimulatorModule()
        self.multi_model_insights = MultiModelInsights()
        self.actionable_insights = ActionableInsightsModule()

    async def _ensure_html_content(self, job_id: str, html_content: str = None, skip_save: bool = False) -> str:
        """Helper to ensure HTML content is loaded from S3 only"""
        if html_content:
            if not skip_save:
                await save_raw_html(job_id, html_content)
        else:
            # Load from S3 bucket
            html_content = await load_raw_html(job_id)
        return html_content

    async def run(self, job_id: str, url: str, html_content: str = None, skip_save: bool = False, query: str = None) -> Dict:
        """
        Runs complete Module C analysis.
        HTML must be available in S3 bucket or provided directly.
        """
        html_content = await self._ensure_html_content(job_id, html_content, skip_save)
            
        if not html_content:
            logger.error(f"[MODULE_C] ❌ HTML not found in S3 for job {job_id}")
            logger.info(f"[MODULE_C] 💡 Make sure:")
            logger.info(f"[MODULE_C]    1. A CRAWLER job ran first and cached HTML to S3")
            logger.info(f"[MODULE_C]    2. OR provide htmlContent in the request payload")
            logger.info(f"[MODULE_C]    3. OR use sourceJobId to reference a crawler job ID")
            return {"error": "HTML not found in S3. Run CRAWLER job first or provide htmlContent.", "job_id": job_id}

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
            self.llm_simulator.simulate_answer(query, html_content),
            self.actionable_insights.run_analysis(html_content, url),
            return_exceptions=True
        )
        
        ai_res, ans_res, kb_res, sim_res, actionable_insights_res = results

        # Handle exceptions in results
        ai_res = ai_res if isinstance(ai_res, dict) else {"score": 0, "error": str(ai_res)}
        ans_res = ans_res if isinstance(ans_res, dict) else {"score": 0, "error": str(ans_res)}
        kb_res = kb_res if isinstance(kb_res, dict) else {"score": 0, "error": str(kb_res)}
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
            (ai_res.get('score', 0) * 0.30) +
            (ans_res.get('score', 0) * 0.30) +
            (kb_res.get('score', 0) * 0.20) +
            (sim_res.get('cross_model_metrics', {}).get('consistency_score', 0) * 0.20)
        )

        result = {
            "job_id": job_id,
            "url": url,
            "overall_score": round(overall_score, 1),
            "modules": {
                "ai_presence": ai_res,
                "answerability": ans_res,
                "knowledge_base": kb_res,
                "llm_simulator": sim_res,
                "multi_model_insights": multi_model_insights_res,
                "actionable_insights": actionable_insights_res
            }
        }

        # 6. Save to aeo_analysis collection
        try:
            from utils.storage import save_aeo_analysis
            await save_aeo_analysis(job_id, url, result)
        except Exception as e:
            logger.error(f"Failed to save AEO analysis to MongoDB: {str(e)}")

        return result
    
    async def run_submodule(self, submodule: str, job_id: str, url: str, html_content: str = None, query: str = None) -> Dict:
        """
        Run a specific sub-module of Module C.
        HTML must be available in S3 bucket or provided directly.
        """
        html_content = await self._ensure_html_content(job_id, html_content)
        
        if not html_content:
            logger.error(f"[MODULE_C] ❌ HTML not found in S3 for job {job_id} (submodule: {submodule})")
            return {"error": "HTML not found in S3. Run CRAWLER job first or provide htmlContent."}

        robots_txt = "" # Basic mock

        try:
            if submodule == "ai_presence":
                return await self.ai_presence.run_analysis(url, html_content, robots_txt)
            elif submodule == "answerability":
                return await self.answerability.run_analysis(html_content)
            elif submodule == "knowledge_base":
                return await self.knowledge_base.run_analysis(html_content, url)
            elif submodule == "llm_simulator":
                # Ensure query exists
                if not query:
                    soup = BeautifulSoup(html_content, 'html.parser')
                    title = soup.title.string if soup.title else ""
                    query = f"What is {title}?" if title else f"What is the content of {url} about?"
                return await self.llm_simulator.simulate_answer(query, html_content)
            elif submodule == "actionable_insights":
                return await self.actionable_insights.run_analysis(html_content, url)
            else:
                return {"error": f"Unknown submodule: {submodule}"}
        except Exception as e:
            logger.error(f"Submodule {submodule} failed: {e}")
            return {"error": str(e)}

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
    Analyzes the main URL using the stored HTML content.
    
    Args:
        job_id: Job ID for this analysis
        url: URL to analyze
        html_content: Optional HTML content (if not provided, loads from disk)
        query: Optional specific query for AI Answer Simulation
        
    Returns:
        Module C analysis results with overall score and module details
    """
    # Run single-page analysis on the main URL
    result = await runner.run(job_id, url, html_content, query=query)
    
    return result


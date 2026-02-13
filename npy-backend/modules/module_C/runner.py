import asyncio
import logging
from typing import Dict
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

    async def run(self, job_id: str, url: str, html_content: str = None) -> Dict:
        """
        Runs complete Module C analysis.
        1. Validates/Saves HTML.
        2. Runs parallel sub-modules.
        3. Aggregates scores.
        """
        logger.info(f"Starting Module C for job {job_id} / {url}")
        
        # 1. Data Handling
        if html_content:
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

# Singleton entry point
runner = ModuleCRunner()

async def run_module_c(job_id: str, url: str, html_content: str = None):
    return await runner.run(job_id, url, html_content)

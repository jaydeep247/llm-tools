import logging
import asyncio
from typing import List, Dict, Any
from utils.storage import save_raw_html, save_job_response

# Import Module Runners
# We use absolute imports assuming we run from project root
from modules.module_C.runner import run_module_c
from modules.module_E.runner import run_module_e
from modules.module_E.sentiment_runner import run_sentiment_only

logger = logging.getLogger("job_runner")

class JobOrchestrator:
    """
    Central orchestrator for handling analysis jobs.
    1. Saves Input Data
    2. Routes to requested Modules
    3. Aggregates & Saves Output
    """
    
    def __init__(self):
        # Registry of available modules
        # Key: Module Name (string) from API/Frontend
        # Value: Runner Function (async)
        self.module_registry = {
            "module_c": run_module_c,
            "aeo": run_module_c,          # Alias
            "module_e": run_module_e,
            "module_e_sentiment": run_sentiment_only,  # Sentiment-only (no crawl needed)
            # Future modules:
            # "module_b": run_module_b
        }

    async def run_job(self, job_id: str, url: str, html_content: str, modules: List[str]) -> Dict[str, Any]:
        """
        Executes a job.
        
        Args:
            job_id: Unique Job ID
            url: Target URL
            html_content: Raw HTML content
            modules: List of module names to run (e.g. ['module_c'])
        """
        logger.info(f"Starting Job {job_id} for {url} with modules: {modules}")
        
        results = {
            "job_id": job_id,
            "url": url,
            "success": True,
            "modules": {}
        }
        
        try:
            # Modules that do NOT require HTML content (pure AI/API calls)
            HTML_FREE_MODULES = {"module_e_sentiment"}

            # 1. Save or Load Raw HTML — skip if all requested modules are HTML-free
            needs_html = any(m.lower() not in HTML_FREE_MODULES for m in modules)

            if needs_html:
                if html_content:
                    await save_raw_html(job_id, html_content)
                else:
                    from utils.storage import load_raw_html
                    html_content = await load_raw_html(job_id)
                    if not html_content:
                        logger.error(f"No HTML content found for job {job_id}")
                        return {"job_id": job_id, "success": False, "error": "No HTML content found"}

            # 2. Identify Modules to Run
            tasks = []
            task_names = []

            for mod_name in modules:
                key = mod_name.lower()
                if key in self.module_registry:
                    runner_func = self.module_registry[key]
                    tasks.append(runner_func(job_id, url, html_content))
                    task_names.append(key)
                else:
                    logger.warning(f"Module '{mod_name}' not found in registry.")
                    results["modules"][mod_name] = {"error": "Module not supported"}

            # 3. Parallel Execution
            if tasks:
                module_results = await asyncio.gather(*tasks, return_exceptions=True)

                for name, res in zip(task_names, module_results):
                    if isinstance(res, Exception):
                        results["modules"][name] = {"error": str(res)}
                    else:
                        results["modules"][name] = res

            # 4. Save Final Response
            await save_job_response(job_id, results)
            logger.info(f"Job {job_id} completed. Results saved.")

            return results

        except Exception as e:
            logger.error(f"Job {job_id} Failed: {e}")
            return {"job_id": job_id, "success": False, "error": str(e)}

# Singleton
orchestrator = JobOrchestrator()

async def execute_job(job_id: str, url: str, html_content: str, modules: List[str]):
    return await orchestrator.run_job(job_id, url, html_content, modules)

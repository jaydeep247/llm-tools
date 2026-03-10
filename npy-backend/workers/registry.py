"""
Job executor registry.

Single dispatch table mapping job-type string → executor callable.
Replaces the string-prefix if/elif chain in the old execute_job() function.
"""

from typing import Callable, Dict

from workers.executors.crawler import execute_crawler_job, execute_resume_crawler_job
from workers.executors.schema import execute_schema_job
from workers.executors.module_a import execute_module_a_job
from workers.executors.module_c import execute_module_c_job
from workers.executors.module_d import execute_module_d_job
from workers.executors.module_e import execute_module_e_job
from workers.executors.module_f import execute_module_f_job

ExecutorFn = Callable[[dict], bool]

EXECUTOR_REGISTRY: Dict[str, ExecutorFn] = {
    # Crawler
    "CRAWL": execute_crawler_job,
    "CRAWL_RESUME": execute_resume_crawler_job,
    # Schema (Module B)
    "SCHEMA": execute_schema_job,
    # Module C — AEO Analysis
    "AEO_ANALYSIS": execute_module_c_job,
    "MODULE_C_AI_PRESENCE": execute_module_c_job,
    "MODULE_C_ANSWERABILITY": execute_module_c_job,
    "MODULE_C_KNOWLEDGE_BASE": execute_module_c_job,
    "MODULE_C_COMPETITOR": execute_module_c_job,
    "MODULE_C_LLM_SIMULATOR": execute_module_c_job,
    "MODULE_C_BULK_AUDIT": execute_module_c_job,
    # Module D — Content Analysis
    "CONTENT_METRICS": execute_module_d_job,
    "MODULE_D": execute_module_d_job,
    "MODULE_D_ENTITY_ANALYSIS": execute_module_d_job,
    # Module E — Brand Intelligence
    "MODULE_E_FULL": execute_module_e_job,
    "MODULE_E_QUICK_START": execute_module_e_job,
    "MODULE_E_CONSISTENCY": execute_module_e_job,
    "MODULE_E_SENTIMENT": execute_module_e_job,
    "MODULE_E_COMPETITORS": execute_module_e_job,
    "MODULE_E_AI_SOV": execute_module_e_job,
    "MODULE_E_RANKING": execute_module_e_job,
    "MODULE_E_BRAND": execute_module_e_job,
    "MODULE_E_AI_CITATION_RANKING": execute_module_e_job,
    # Module F — Competitor AI Intelligence
    "MODULE_F_COMPETITOR_AI_INTELLIGENCE": execute_module_f_job,
    # Module A — SERP Analyzer
    "MODULE_A_SERP": execute_module_a_job,
}


def get_executor(job_type: str) -> ExecutorFn:
    """Return executor for the given job type; defaults to Module D on unknown types."""
    fn = EXECUTOR_REGISTRY.get(job_type.upper())
    if fn is None:
        from utils.logger import logger
        logger.warning(
            f"[REGISTRY] Unknown job type '{job_type}' — falling back to Module D executor"
        )
        fn = execute_module_d_job
    return fn

"""
Job Types and Queue Configuration
Defines all job types and their routing to isolated queues
"""

from enum import Enum
from typing import Dict, NamedTuple


class JobType(str, Enum):
    """All supported job types"""
    # Crawler Module
    CRAWL = 'CRAWL'
    CRAWL_RESUME = 'CRAWL_RESUME'
    
    # Schema Module (Module B)
    SCHEMA = 'SCHEMA'
    
    # Content Metrics (Module D)
    CONTENT_METRICS = 'CONTENT_METRICS'
    MODULE_D = 'MODULE_D'
    MODULE_D_ENTITY_ANALYSIS = 'MODULE_D_ENTITY_ANALYSIS'
    MODULE_D_PROMPT_TRACKING = 'MODULE_D_PROMPT_TRACKING'
    MODULE_D_PROMPT_INGEST   = 'MODULE_D_PROMPT_INGEST'
    MODULE_D_PROMPT_EXPAND   = 'MODULE_D_PROMPT_EXPAND'
    MODULE_D_DIFFICULTY      = 'MODULE_D_DIFFICULTY'
    MODULE_D_PROMPT_LIST     = 'MODULE_D_PROMPT_LIST'
    MODULE_D_CITATIONS       = 'MODULE_D_CITATIONS'
    MODULE_D_PERFORMANCE     = 'MODULE_D_PERFORMANCE'
    MODULE_D_MANUAL_RUN      = 'MODULE_D_MANUAL_RUN'
    MODULE_D_FEEDBACK        = 'MODULE_D_FEEDBACK'
    MODULE_D_HEALTH          = 'MODULE_D_HEALTH'
    
    # AEO Analysis (Module C)
    AEO_ANALYSIS = 'AEO_ANALYSIS'
    MODULE_C_AI_PRESENCE = 'MODULE_C_AI_PRESENCE'
    MODULE_C_ANSWERABILITY = 'MODULE_C_ANSWERABILITY'
    MODULE_C_KNOWLEDGE_BASE = 'MODULE_C_KNOWLEDGE_BASE'
    MODULE_C_COMPETITOR = 'MODULE_C_COMPETITOR'
    MODULE_C_LLM_SIMULATOR = 'MODULE_C_LLM_SIMULATOR'
    MODULE_C_BULK_AUDIT = 'MODULE_C_BULK_AUDIT'
    MODULE_C_C1 = 'MODULE_C_C1'
    MODULE_C_C2 = 'MODULE_C_C2'
    MODULE_C_C3 = 'MODULE_C_C3'
    MODULE_C_C4 = 'MODULE_C_C4'
    MODULE_C_C5 = 'MODULE_C_C5'
    MODULE_C_C6 = 'MODULE_C_C6'
    MODULE_C_C7 = 'MODULE_C_C7'
    MODULE_C_C8 = 'MODULE_C_C8'
    MODULE_C_C9 = 'MODULE_C_C9'
    
    # Brand Intelligence (Module E)
    MODULE_E_FULL = 'MODULE_E_FULL'
    MODULE_E_QUICK_START = 'MODULE_E_QUICK_START'
    MODULE_E_CONSISTENCY = 'MODULE_E_CONSISTENCY'
    MODULE_E_SENTIMENT = 'MODULE_E_SENTIMENT'
    MODULE_E_COMPETITORS = 'MODULE_E_COMPETITORS'
    MODULE_E_AI_SOV = 'MODULE_E_AI_SOV'
    MODULE_E_RANKING = 'MODULE_E_RANKING'
    MODULE_E_BRAND = 'MODULE_E_BRAND'

    # Competitor AI Intelligence (Module F)
    MODULE_F_COMPETITOR_AI_INTELLIGENCE = 'MODULE_F_COMPETITOR_AI_INTELLIGENCE'

    # SERP Analyzer (Module A)
    MODULE_A_SERP = 'MODULE_A_SERP'


class JobCategory(str, Enum):
    """Job categories for queue routing"""
    CRAWLER = 'CRAWLER'
    SCHEMA = 'SCHEMA'
    MODULE_A = 'MODULE_A'
    MODULE_C = 'MODULE_C'
    MODULE_D = 'MODULE_D'
    MODULE_E = 'MODULE_E'
    MODULE_F = 'MODULE_F'


class QueueConfig(NamedTuple):
    """Configuration for a queue"""
    exchange: str
    queue: str
    routing_key: str
    dlx: str
    dlq: str


# Queue configurations for each category
QUEUE_CONFIGS: Dict[JobCategory, QueueConfig] = {
    JobCategory.CRAWLER: QueueConfig(
        exchange='crawler.exchange',
        queue='crawler.queue',
        routing_key='crawler.job',
        dlx='crawler.dlx',
        dlq='crawler.dlq',
    ),
    JobCategory.SCHEMA: QueueConfig(
        exchange='schema.exchange',
        queue='schema.queue',
        routing_key='schema.job',
        dlx='schema.dlx',
        dlq='schema.dlq',
    ),
    JobCategory.MODULE_C: QueueConfig(
        exchange='module_c.exchange',
        queue='module_c.queue',
        routing_key='module_c.job',
        dlx='module_c.dlx',
        dlq='module_c.dlq',
    ),
    JobCategory.MODULE_D: QueueConfig(
        exchange='module_d.exchange',
        queue='module_d.queue',
        routing_key='module_d.job',
        dlx='module_d.dlx',
        dlq='module_d.dlq',
    ),
    JobCategory.MODULE_E: QueueConfig(
        exchange='module_e.exchange',
        queue='module_e.queue',
        routing_key='module_e.job',
        dlx='module_e.dlx',
        dlq='module_e.dlq',
    ),
    JobCategory.MODULE_F: QueueConfig(
        exchange='module_f.exchange',
        queue='module_f.queue',
        routing_key='module_f.job',
        dlx='module_f.dlx',
        dlq='module_f.dlq',
    ),
    JobCategory.MODULE_A: QueueConfig(
        exchange='module_a.exchange',
        queue='module_a.queue',
        routing_key='module_a.job',
        dlx='module_a.dlx',
        dlq='module_a.dlq',
    ),
}


# Map job types to categories
JOB_TYPE_TO_CATEGORY: Dict[str, JobCategory] = {
    JobType.CRAWL.value: JobCategory.CRAWLER,
    JobType.CRAWL_RESUME.value: JobCategory.CRAWLER,
    JobType.SCHEMA.value: JobCategory.SCHEMA,
    JobType.CONTENT_METRICS.value: JobCategory.MODULE_D,
    JobType.MODULE_D.value: JobCategory.MODULE_D,
    JobType.MODULE_D_ENTITY_ANALYSIS.value: JobCategory.MODULE_D,
    JobType.MODULE_D_PROMPT_TRACKING.value: JobCategory.MODULE_D,
    JobType.MODULE_D_PROMPT_INGEST.value:   JobCategory.MODULE_D,
    JobType.MODULE_D_PROMPT_EXPAND.value:   JobCategory.MODULE_D,
    JobType.MODULE_D_DIFFICULTY.value:      JobCategory.MODULE_D,
    JobType.MODULE_D_PROMPT_LIST.value:     JobCategory.MODULE_D,
    JobType.MODULE_D_CITATIONS.value:       JobCategory.MODULE_D,
    JobType.MODULE_D_PERFORMANCE.value:     JobCategory.MODULE_D,
    JobType.MODULE_D_MANUAL_RUN.value:      JobCategory.MODULE_D,
    JobType.MODULE_D_FEEDBACK.value:        JobCategory.MODULE_D,
    JobType.MODULE_D_HEALTH.value:          JobCategory.MODULE_D,
    JobType.AEO_ANALYSIS.value: JobCategory.MODULE_C,
    JobType.MODULE_C_AI_PRESENCE.value: JobCategory.MODULE_C,
    JobType.MODULE_C_ANSWERABILITY.value: JobCategory.MODULE_C,
    JobType.MODULE_C_KNOWLEDGE_BASE.value: JobCategory.MODULE_C,
    JobType.MODULE_C_COMPETITOR.value: JobCategory.MODULE_C,
    JobType.MODULE_C_LLM_SIMULATOR.value: JobCategory.MODULE_C,
    JobType.MODULE_C_BULK_AUDIT.value: JobCategory.MODULE_C,
    JobType.MODULE_E_FULL.value: JobCategory.MODULE_E,
    JobType.MODULE_E_QUICK_START.value: JobCategory.MODULE_E,
    JobType.MODULE_E_CONSISTENCY.value: JobCategory.MODULE_E,
    JobType.MODULE_E_SENTIMENT.value: JobCategory.MODULE_E,
    JobType.MODULE_E_COMPETITORS.value: JobCategory.MODULE_E,
    JobType.MODULE_E_AI_SOV.value: JobCategory.MODULE_E,
    JobType.MODULE_E_RANKING.value: JobCategory.MODULE_E,
    JobType.MODULE_E_BRAND.value: JobCategory.MODULE_E,
    JobType.MODULE_F_COMPETITOR_AI_INTELLIGENCE.value: JobCategory.MODULE_F,
    JobType.MODULE_A_SERP.value: JobCategory.MODULE_A,
}


# Legacy job type mappings (for backward compatibility)
LEGACY_JOB_TYPE_MAP = {
    'crawl': JobType.CRAWL.value,
    'schema': JobType.SCHEMA.value,
    'content_metrics': JobType.CONTENT_METRICS.value,
    'module_d': JobType.MODULE_D.value,
    'module_d_entity_analysis': JobType.MODULE_D_ENTITY_ANALYSIS.value,
    'aeo_analysis': JobType.AEO_ANALYSIS.value,
    'module_c': JobType.AEO_ANALYSIS.value,
    'module_e': JobType.MODULE_E_FULL.value,
    'module_e_quick_start': JobType.MODULE_E_QUICK_START.value,
    'module_e_consistency': JobType.MODULE_E_CONSISTENCY.value,
    'module_e_sentiment': JobType.MODULE_E_SENTIMENT.value,
    'module_e_competitors': JobType.MODULE_E_COMPETITORS.value,
    'module_e_ai_sov': JobType.MODULE_E_AI_SOV.value,
    'module_e_ranking': JobType.MODULE_E_RANKING.value,
    'module_e_brand': JobType.MODULE_E_BRAND.value,
    'module_e_brand_analysis': JobType.MODULE_E_BRAND.value,
    'module_f_competitor_ai_intelligence': JobType.MODULE_F_COMPETITOR_AI_INTELLIGENCE.value,
}


def get_category_for_job_type(job_type: str) -> JobCategory:
    """Get the queue category for a job type"""
    # Normalize to uppercase
    normalized = job_type.upper()
    
    # Check direct mapping
    if normalized in JOB_TYPE_TO_CATEGORY:
        return JOB_TYPE_TO_CATEGORY[normalized]
    
    # Check legacy mapping
    legacy_key = job_type.lower()
    if legacy_key in LEGACY_JOB_TYPE_MAP:
        mapped_type = LEGACY_JOB_TYPE_MAP[legacy_key]
        return JOB_TYPE_TO_CATEGORY.get(mapped_type, JobCategory.CRAWLER)
    
    # Default to crawler for unknown types
    return JobCategory.CRAWLER


def get_queue_config(category: JobCategory) -> QueueConfig:
    """Get queue configuration for a category"""
    return QUEUE_CONFIGS[category]


# All queue names for worker initialization
ALL_QUEUES = [config.queue for config in QUEUE_CONFIGS.values()]
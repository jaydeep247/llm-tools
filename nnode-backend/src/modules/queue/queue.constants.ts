import { JobCategory } from '../job/job.types';

/**
 * Isolated Queue Configuration for each Job Category
 * Each category has its own exchange, queue, and DLQ for complete isolation
 */

// ============ CRAWLER MODULE ============
export const CRAWLER_EXCHANGE = 'crawler.exchange';
export const CRAWLER_QUEUE = 'crawler.queue';
export const CRAWLER_ROUTING_KEY = 'crawler.job';
export const CRAWLER_DLX = 'crawler.dlx';
export const CRAWLER_DLQ = 'crawler.dlq';

// ============ SCHEMA MODULE (Module B) ============
export const SCHEMA_EXCHANGE = 'schema.exchange';
export const SCHEMA_QUEUE = 'schema.queue';
export const SCHEMA_ROUTING_KEY = 'schema.job';
export const SCHEMA_DLX = 'schema.dlx';
export const SCHEMA_DLQ = 'schema.dlq';

// ============ MODULE C (AEO Analysis) ============
export const MODULE_C_EXCHANGE = 'module_c.exchange';
export const MODULE_C_QUEUE = 'module_c.queue';
export const MODULE_C_ROUTING_KEY = 'module_c.job';
export const MODULE_C_DLX = 'module_c.dlx';
export const MODULE_C_DLQ = 'module_c.dlq';

// ============ MODULE D (Content Analysis) ============
export const MODULE_D_EXCHANGE = 'module_d.exchange';
export const MODULE_D_QUEUE = 'module_d.queue';
export const MODULE_D_ROUTING_KEY = 'module_d.job';
export const MODULE_D_DLX = 'module_d.dlx';
export const MODULE_D_DLQ = 'module_d.dlq';

// ============ MODULE E (Brand Intelligence) ============
export const MODULE_E_EXCHANGE = 'module_e.exchange';
export const MODULE_E_QUEUE = 'module_e.queue';
export const MODULE_E_ROUTING_KEY = 'module_e.job';
export const MODULE_E_DLX = 'module_e.dlx';
export const MODULE_E_DLQ = 'module_e.dlq';

// ============ LEGACY (Backward Compatibility) ============
export const QUEUE_EXCHANGE_CRAWL = 'crawl.exchange';
export const QUEUE_CRAWL = 'crawl.queue';
export const ROUTING_KEY_CRAWL_START = 'crawl.start';

export const QUEUE_EXCHANGE_ANALYSIS = 'analysis.exchange';
export const QUEUE_ANALYSIS = 'analysis.queue';
export const ROUTING_KEY_ANALYSIS_START = 'analysis.start';

/**
 * Queue configuration by category for dynamic routing
 */
export interface QueueConfig {
  exchange: string;
  queue: string;
  routingKey: string;
  dlx: string;
  dlq: string;
}

export const QUEUE_CONFIG_BY_CATEGORY: Record<JobCategory, QueueConfig> = {
  [JobCategory.CRAWLER]: {
    exchange: CRAWLER_EXCHANGE,
    queue: CRAWLER_QUEUE,
    routingKey: CRAWLER_ROUTING_KEY,
    dlx: CRAWLER_DLX,
    dlq: CRAWLER_DLQ,
  },
  [JobCategory.SCHEMA]: {
    exchange: SCHEMA_EXCHANGE,
    queue: SCHEMA_QUEUE,
    routingKey: SCHEMA_ROUTING_KEY,
    dlx: SCHEMA_DLX,
    dlq: SCHEMA_DLQ,
  },
  [JobCategory.MODULE_C]: {
    exchange: MODULE_C_EXCHANGE,
    queue: MODULE_C_QUEUE,
    routingKey: MODULE_C_ROUTING_KEY,
    dlx: MODULE_C_DLX,
    dlq: MODULE_C_DLQ,
  },
  [JobCategory.MODULE_D]: {
    exchange: MODULE_D_EXCHANGE,
    queue: MODULE_D_QUEUE,
    routingKey: MODULE_D_ROUTING_KEY,
    dlx: MODULE_D_DLX,
    dlq: MODULE_D_DLQ,
  },
  [JobCategory.MODULE_E]: {
    exchange: MODULE_E_EXCHANGE,
    queue: MODULE_E_QUEUE,
    routingKey: MODULE_E_ROUTING_KEY,
    dlx: MODULE_E_DLX,
    dlq: MODULE_E_DLQ,
  },
};

/**
 * All queue names for worker initialization
 */
export const ALL_QUEUES = [
  CRAWLER_QUEUE,
  SCHEMA_QUEUE,
  MODULE_C_QUEUE,
  MODULE_D_QUEUE,
  MODULE_E_QUEUE,
];

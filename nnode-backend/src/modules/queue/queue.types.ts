import { JobType } from '../job/job.types';

export interface BaseJobPayload {
  jobId: string;
  sessionId: string;
  projectId: string;
  url: string;
  jobType: JobType;  // Required: Explicit job type for routing
}

export interface CrawlJobPayload extends BaseJobPayload {
  allowSubdomains?: boolean;
  runAudits?: boolean;
  auditDevice?: string;
  captureLinkDetails?: boolean;
}

export interface SchemaJobPayload extends BaseJobPayload {
  schemaType?: string;
}

export interface ContentMetricsJobPayload extends BaseJobPayload {}

/**
 * Module C (AEO Analysis) Job Payload
 */
export interface ModuleCJobPayload extends BaseJobPayload {
  query?: string;
  sourceJobId?: string;
  subModule?: 'ai_presence' | 'answerability' | 'knowledge_base' | 'competitor' | 'llm_simulator' | 'bulk_audit' | 'full';
}

/**
 * Module D (Content Analysis) Job Payload
 */
export interface ModuleDJobPayload extends BaseJobPayload {
  sourceJobId?: string;
}

/**
 * Module E (Brand Intelligence) Job Payload
 */
export interface ModuleEJobPayload extends BaseJobPayload {
  sourceJobId?: string;
  brandName?: string;
  subModule?: 'full' | 'consistency' | 'sentiment' | 'competitors' | 'ai_sov' | 'ranking' | 'brand' | 'ai_citation_ranking';
}

/**
 * Generic Analysis Job Payload (Legacy support)
 */
export interface AnalysisJobPayload {
  jobId: string;
  sessionId: string;
  projectId: string;
  url: string;
  jobType: JobType;
  modules: string[];
  sourceJobId?: string;
  config?: Record<string, any>;
}

/**
 * Union type for all job payloads
 */
export type AnyJobPayload = 
  | CrawlJobPayload 
  | SchemaJobPayload 
  | ContentMetricsJobPayload 
  | ModuleCJobPayload 
  | ModuleDJobPayload 
  | ModuleEJobPayload 
  | AnalysisJobPayload;


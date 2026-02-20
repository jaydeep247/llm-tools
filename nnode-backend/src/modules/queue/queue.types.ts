export type JobType = 'CRAWL' | 'SCHEMA' | 'CONTENT_METRICS';

export interface BaseJobPayload {
  jobId: string;
  sessionId: string;
  projectId: string;
  url: string;
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

export interface AnalysisJobPayload {
  jobId: string;
  sessionId: string;
  projectId: string;
  url: string;
  modules: string[];
  sourceJobId?: string;
  config?: Record<string, any>;
}

export interface SchemaJobPayload extends BaseJobPayload {
  schemaType?: string;
}

export interface ContentMetricsJobPayload extends BaseJobPayload {}

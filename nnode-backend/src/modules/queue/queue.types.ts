export interface CrawlJobPayload {
  jobId: string;
  sessionId: string;
  projectId: string;
  url: string;
  allowSubdomains?: boolean;
  runAudits?: boolean;
  auditDevice?: string;
  captureLinkDetails?: boolean;
}

export interface AnalysisJobPayload {
  jobId: string;
  sessionId: string;
  projectId: string;
  url: string;
  modules: string[];
  sourceJobId?: string;
  config?: Record<string, any>;
}

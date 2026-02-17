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

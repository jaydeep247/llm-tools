export type AuditCategory = 'technical' | 'content' | 'structured_data';
export type AuditSeverity = 'critical' | 'warning' | 'info';

export interface AuditIssue {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  description: string;
  affected_count: number;
  example_urls: string[];
  fix: string;
}

export interface AuditSummaryStats {
  total: number;
  critical: number;
  warning: number;
  info: number;
  resolved_since_last: number;
}

export interface AuditReport {
  jobId: string;
  projectId: string;
  crawl_date: string;
  generated_at: string;
  summary: AuditSummaryStats;
  issues: AuditIssue[];
}

export interface AuditReportResponse {
  report: AuditReport;
  has_prior_report: boolean;
}

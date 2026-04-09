import { baseApi } from './baseApi';

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

export interface AuditReportHistoryItem {
  jobId: string;
  projectId: string;
  crawl_date: string;
  generated_at: string;
  summary: AuditSummaryStats;
}

export const auditReportsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAuditReport: builder.query<AuditReportResponse, string>({
      query: (jobId) => `/jobs/${jobId}/audit-report`,
      transformResponse: (response: { data: AuditReportResponse }) => response.data,
      providesTags: (_result, _err, jobId) => [{ type: 'AuditReport', id: jobId }],
    }),
    getAuditReportHistory: builder.query<AuditReportHistoryItem[], string>({
      query: (jobId) => `/jobs/${jobId}/audit-report/history`,
      transformResponse: (response: { data: AuditReportHistoryItem[] }) => response.data ?? [],
      providesTags: (_result, _err, jobId) => [{ type: 'AuditReport', id: `history-${jobId}` }],
    }),
  }),
});

export const { useGetAuditReportQuery, useGetAuditReportHistoryQuery } = auditReportsApi;

export interface ApiKeyDoc {
  key: string;
  createdAt: string;
  lastUsedAt: string | null;
  rateLimit: number;
}

export interface ScheduledExportDoc {
  id: string;
  userId: string;
  email: string;
  frequency: 'weekly';
  reportType: string;
  dayOfWeek: number;
  hour: number;
  createdAt: string;
  updatedAt: string;
}

export type PdfReportType = 'weekly-summary' | 'audit-report' | 'competitor-report' | 'ai-scorecard' | 'serp-analysis' | 'competitor-ai-report';

export type CsvDataType = 'crawl-data' | 'citations' | 'prompts' | 'competitors' | 'alerts';

export interface ReadinessResult {
  ready: boolean;
  jobId: string | null;
  effectiveJobId: string | null;
  dataCount: number;
  /** Short message suitable for an error banner */
  message: string;
  /** Actionable hint shown below the message */
  hint: string;
  /** Human-readable name of the missing module */
  moduleName: string;
}

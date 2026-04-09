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

export type PdfReportType = 'weekly-summary' | 'audit-report' | 'competitor-report' | 'ai-scorecard';

export type CsvDataType = 'crawl-data' | 'citations' | 'prompts' | 'competitors' | 'alerts';

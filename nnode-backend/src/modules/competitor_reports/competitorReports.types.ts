export type CRPeriod = '7d' | '30d';

export interface CompetitorReportModelStats {
  citations: number;
  citations_prev: number;
  citations_delta: number;
  sov_percent: number | null;
  sov_prev_percent: number | null;
  sov_delta: number | null;
}

export interface CompetitorReportRow {
  name: string;
  per_model: Record<string, CompetitorReportModelStats>;
  citations_total: number;
  citations_prev_total: number;
  citations_delta_total: number;
  sov_avg_percent: number | null;
  sov_prev_avg_percent: number | null;
  sov_delta_avg: number | null;
}

export interface CompetitorTopPage {
  url: string;
  citation_count: number;
  primary_model: string;
  page_title?: string | null;
  content_type?: string | null;
}

export interface CompetitorTopPagesBlock {
  name: string;
  pages: CompetitorTopPage[];
}

export interface CompetitorReportsResponse {
  meta: {
    project_id: string;
    period: CRPeriod;
    period_days: number;
    current_job_id: string;
    prior_job_id: string;
    compared_to_label: string;
  };
  competitors: CompetitorReportRow[];
  top_pages: CompetitorTopPagesBlock[];
}


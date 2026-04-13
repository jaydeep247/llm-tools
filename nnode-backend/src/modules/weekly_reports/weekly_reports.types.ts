export type WeeklyReportDeliveredVia = 'dashboard' | 'email' | 'both';

export interface WeeklyReportWinRow {
  metric: string;
  model: string;
  previous: number;
  current: number;
  delta: number;
}

export interface WeeklyReportLossRow extends WeeklyReportWinRow {
  fix_title: string | null;
  fix_link: string | null;
}

export interface WeeklyReportTopPage {
  url: string;
  citations: number;
  primary_model: string;
}

export interface WeeklyReportRecommendation {
  action: string;
  impact: string;
  effort: string;
  module_link: string;
}

export interface WeeklyReportCompetitorMovement {
  name: string;
  sov_change: number | null;
  prompts_gained: number;
  prompts_lost: number;
}

/** Persisted JSON payload (Mongo report_data / brief JSONB shape) */
export interface WeeklyReportData {
  meta: {
    domain_label: string;
    is_first_week: boolean;
    job_id: string;
    period_days: number;
  };
  aivs_score: number | null;
  aivs_delta: number | null;
  health_score: number | null;
  health_delta: number | null;
  citation_count: number;
  citation_delta: number;
  sov_percent: number | null;
  sov_delta: number | null;
  wins: WeeklyReportWinRow[];
  losses: WeeklyReportLossRow[];
  top_pages: WeeklyReportTopPage[];
  recommendations: WeeklyReportRecommendation[];
  competitor_movements: WeeklyReportCompetitorMovement[];
}

export interface WeeklyReportDoc {
  id: string;
  projectId: string;
  weekStart: string;
  weekEnd: string;
  jobId: string;
  reportData: WeeklyReportData;
  generatedAt: Date;
  deliveredVia?: WeeklyReportDeliveredVia | null;
}

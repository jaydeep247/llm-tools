export type WLDirection = 'WIN' | 'LOSS' | 'STABLE';
export type WLImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type WLEffort = 'LOW' | 'MEDIUM' | 'HIGH';
export type WLCategory = 'Citations' | 'Share of Voice' | 'Visibility' | 'AIVS' | 'Prompt Coverage';
export type WLModel = 'ChatGPT' | 'Gemini' | 'Perplexity' | 'Claude' | string;

export interface WLFix {
  title: string;
  issue: string;
  impact: WLImpact;
  effort: WLEffort;
  link: string;
}

export interface WLMetricRow {
  /** display name of the metric */
  metric: string;
  category: WLCategory;
  model: WLModel;
  prev: number;
  current: number;
  delta: number;
  direction: WLDirection;
  /** only on LOSS rows */
  fix: WLFix | null;
}

export interface WinsLossesResponse {
  wins: WLMetricRow[];
  losses: WLMetricRow[];
  /** Full metric grid (includes STABLE rows). Used by weekly summary KPIs. */
  all_metrics: WLMetricRow[];
  /** Resolved comparison jobs when has_baseline; null otherwise */
  baseline_job_ids: { current: string; prior: string } | null;
  /** true when at least 2 module_F runs exist on different dates for this project */
  has_baseline: boolean;
  baseline_reason?: 'missing_project' | 'missing_current_window' | 'missing_prior_window' | null;
  period_days: number;
  prior_date: string | null;
  current_date: string | null;
}

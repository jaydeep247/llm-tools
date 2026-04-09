export type WLDirection = 'WIN' | 'LOSS' | 'STABLE';
export type WLImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type WLEffort = 'LOW' | 'MEDIUM' | 'HIGH';
export type WLCategory = 'Citations' | 'Share of Voice' | 'Visibility' | 'AIVS';
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
  /** true when at least 2 module_F runs exist on different dates for this project */
  has_baseline: boolean;
  period_days: number;
  prior_date: string | null;
  current_date: string | null;
}

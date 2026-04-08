export type KpiStatus = 'HEALTHY' | 'NEEDS_ATTENTION' | 'AT_RISK';
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type EffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface TopAction {
  title: string;
  issue: string;
  impact: ImpactLevel;
  effort: EffortLevel;
  urgency: ImpactLevel;
  module_link: string;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  page_count: number;
}

export interface ExecutiveSnapshotResponse {
  // AI Visibility Score
  aivs_score: number | null;
  aivs_delta: number | null;
  aivs_status: KpiStatus;

  // Website Health Score
  health_score: number | null;
  health_delta: number | null;
  health_status: KpiStatus;

  // Citation Count (brand mentions)
  citation_count: number | null;
  citation_delta: number | null;

  // Share of Voice
  sov_percent: number | null;
  sov_delta: number | null;

  // Last Crawl
  last_crawl: string | null;
  crawl_status: 'success' | 'failed' | 'running' | 'pending' | null;
  pages_crawled: number | null;

  // Top priority actions
  top_actions: TopAction[];

  // Meta
  has_data: boolean;
  snapshot_date: string;
}

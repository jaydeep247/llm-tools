import { baseApi } from './baseApi';

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

export interface ExecutiveSnapshotData {
  aivs_score: number | null;
  aivs_delta: number | null;
  aivs_status: KpiStatus;

  health_score: number | null;
  health_delta: number | null;
  health_status: KpiStatus;

  citation_count: number | null;
  citation_delta: number | null;

  sov_percent: number | null;
  sov_delta: number | null;

  last_crawl: string | null;
  crawl_status: 'success' | 'failed' | 'running' | 'pending' | null;
  pages_crawled: number | null;

  top_actions: TopAction[];
  has_data: boolean;
  snapshot_date: string;
}

export const executiveSnapshotApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getExecutiveSnapshot: builder.query<ExecutiveSnapshotData, { jobId: string; period: '7d' | '30d' }>({
      query: ({ jobId, period }) => `/jobs/${jobId}/executive-snapshot?period=${period}`,
      transformResponse: (response: { data: ExecutiveSnapshotData }) => response.data,
    }),
  }),
});

export const { useGetExecutiveSnapshotQuery } = executiveSnapshotApi;

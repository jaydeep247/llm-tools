import { baseApi } from './baseApi';

export type WLDirection = 'WIN' | 'LOSS' | 'STABLE';
export type WLImpact = 'HIGH' | 'MEDIUM' | 'LOW';
export type WLEffort = 'LOW' | 'MEDIUM' | 'HIGH';
export type WLCategory = 'Citations' | 'Share of Voice' | 'Visibility' | 'AIVS';

export interface WLFix {
  title: string;
  issue: string;
  impact: WLImpact;
  effort: WLEffort;
  link: string;
}

export interface WLMetricRow {
  metric: string;
  category: WLCategory;
  model: string;
  prev: number;
  current: number;
  delta: number;
  direction: WLDirection;
  fix: WLFix | null;
}

export interface WinsLossesData {
  wins: WLMetricRow[];
  losses: WLMetricRow[];
  has_baseline: boolean;
  period_days: number;
  prior_date: string | null;
  current_date: string | null;
}

export interface WinsLossesQueryArgs {
  jobId: string;
  period: '7d' | '30d';
}

export const winsLossesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWinsLosses: builder.query<WinsLossesData, WinsLossesQueryArgs>({
      query: ({ jobId, period }) => `/jobs/${jobId}/wins-losses?period=${period}`,
      transformResponse: (response: { data: WinsLossesData }) => response.data,
    }),
  }),
});

export const { useGetWinsLossesQuery } = winsLossesApi;

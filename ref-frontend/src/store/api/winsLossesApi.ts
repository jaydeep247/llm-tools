import { baseApi } from './baseApi';

export type LLMModel = 'ChatGPT' | 'Gemini' | 'Perplexity' | 'Claude';
export type WinLossCategory = 'Citations' | 'Share of Voice' | 'AIVS Dimensions' | 'Prompt Coverage';
export type WinLossDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface WinLossFix {
  title: string;
  issue: string;
  impact: ImpactLevel;
  effort: ImpactLevel;
  link: string;
}

export interface WinLossMetric {
  metric: string;
  category: WinLossCategory;
  model: LLMModel | null;
  prev: number;
  current: number;
  delta: number;
  direction: WinLossDirection;
  fix: WinLossFix | null;
}

export interface WinsLossesData {
  wins: WinLossMetric[];
  losses: WinLossMetric[];
  stable: WinLossMetric[];
  period_days: number;
  has_data: boolean;
  generated_at: string;
}

export const winsLossesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getWinsLosses: builder.query<WinsLossesData, string>({
      query: (jobId) => `/jobs/${jobId}/wins-losses`,
      transformResponse: (response: { data: WinsLossesData }) => response.data,
    }),
  }),
});

export const { useGetWinsLossesQuery } = winsLossesApi;

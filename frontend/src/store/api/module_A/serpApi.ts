import { baseApi } from '../baseApi';

export interface SerpAnalyzeRequest {
  keyword: string;
  target_domain: string;
  location: string;
  device: 'desktop' | 'mobile';
  max_results?: number;
  sessionId?: number | null;
}

export interface SerpResultItem {
  position: number;
  url: string;
  title: string;
}

export interface SerpFeatures {
  featured_snippet: boolean;
  paa: boolean;
  video: boolean;
  images: boolean;
}

export interface SerpSnapshot {
  keyword: string;
  targetDomain: string;
  normalizedDomain: string;
  searchEngine: string;
  location: string;
  device: 'desktop' | 'mobile';
  maxResults: number;
  runAt: string;
  position: number | null;
  rankingUrl: string | null;
  rankStatus: 'ranked' | 'not_ranked' | 'lost';
  change: number | null;
  changeLabel: string | null;
  intent: string;
  topCompetitors: { domain: string; count: number }[];
  serpFeatures: SerpFeatures;
  serp: SerpResultItem[];
  sessionId?: number | null;
}

export const serpApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyzeSerp: builder.mutation<SerpSnapshot, SerpAnalyzeRequest>({
      query: (body) => ({
        url: '/api/serp/analyze',
        method: 'POST',
        body,
      }),
    }),
    getSerpHistory: builder.query<
      { items: SerpSnapshot[] },
      { keyword: string; domain: string; location?: string; device?: 'desktop' | 'mobile'; limit?: number }
    >({
      query: ({ keyword, domain, location, device, limit }) => {
        const params = new URLSearchParams();
        params.set('keyword', keyword);
        params.set('domain', domain);
        if (location) params.set('location', location);
        if (device) params.set('device', device);
        if (limit) params.set('limit', String(limit));
        return `/api/serp/history?${params.toString()}`;
      },
    }),
  }),
});

export const { useAnalyzeSerpMutation, useGetSerpHistoryQuery } = serpApi;


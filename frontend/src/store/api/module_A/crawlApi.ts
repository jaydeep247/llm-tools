import { baseApi } from '../baseApi';

export interface CrawlRequest {
  url: string;
  allowSubdomains: boolean;
  runAudits: boolean;
  auditDevice: 'mobile' | 'desktop';
  captureLinkDetails: boolean;
  forceRecrawl?: boolean;
}

export interface CrawlResponse {
  sessionId: number;
  url: string;
  reuseMode?: boolean;
  hasAudits?: boolean;
  auditsTriggered?: boolean;
  auditsInProgress?: boolean;
  message?: string;
}

export interface CancelAuditsRequest {
  sessionId: number;
}

export interface ShareSessionRequest {
  sessionId: number;
}

export const crawlApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    startCrawl: builder.mutation<CrawlResponse, CrawlRequest>({
      query: (data) => ({
        url: '/api/crawl',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Data', 'Session'],
    }),
    cancelAudits: builder.mutation<void, CancelAuditsRequest>({
      query: (data) => ({
        url: '/api/cancel-audits',
        method: 'POST',
        body: data,
      }),
    }),
    shareSession: builder.mutation<void, ShareSessionRequest>({
      query: ({ sessionId }) => ({
        url: `/api/sessions/${sessionId}/share`,
        method: 'POST',
      }),
    }),
  }),
});

export const {
  useStartCrawlMutation,
  useCancelAuditsMutation,
  useShareSessionMutation,
} = crawlApi;

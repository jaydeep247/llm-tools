import { baseApi } from './baseApi';

export interface GA4Property {
  id: string;
  displayName: string;
  accountId: string;
  accountName: string;
}

export interface GA4PageTraffic {
  pageTitle: string;
  pagePath: string;
  sessions: number;
  views: number;
  activeUsers: number;
  viewsPerActiveUser: number;
  avgEngagementTime: number; // seconds
  eventCount: number;
  keyEvents: number;
}

export interface GA4TrafficResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  totalViews: number;
  totalActiveUsers: number;
  totalEventCount: number;
  totalKeyEvents: number;
  pages: GA4PageTraffic[];
}

export interface GA4StatusResponse {
  connected: boolean;
  selectedPropertyId?: string | null;
}

export interface GA4TrafficParams {
  propertyId: string;
  startDate?: string;
  endDate?: string;
}

// ── LLM Traffic types ─────────────────────────────────────────────────────────

export interface LLMPlatformBreakdown {
  platform: string;
  sourceDomain: string;
  sessions: number;
  users: number;
  bounceRate: number;
  avgSessionDuration: number;
  percentOfLLMTotal: number;
}

export interface LLMDailyTrend {
  date: string;
  platform: string;
  sessions: number;
}

export interface LLMTrafficResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalLLMSessions: number;
  totalSiteSessions: number;
  llmPercentOfTotal: number;
  previousPeriod: {
    totalLLMSessions: number;
    llmPercentOfTotal: number;
  };
  breakdown: LLMPlatformBreakdown[];
  trend: LLMDailyTrend[];
  lastSyncedAt: string;
  fromCache: boolean;
}

export interface LLMTrafficParams {
  propertyId: string;
  startDate?: string;
  endDate?: string;
}

// ── Top Landing Pages types ───────────────────────────────────────────────────

export interface LLMTopLandingPage {
  path: string;
  url: string;
  llmSessions: number;
  users: number;
  bounceRate: number;
  citationCount: number;
  primaryModel: string;
  citationTrafficRatio: number | null;
  gapFlag: 'OPPORTUNITY_GAP' | 'PERFORMING' | null;
  platformBreakdown: Record<string, number>;
}

export interface LLMTopLandingPagesResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalLLMPages: number;
  topPage: { url: string; path: string; llmSessions: number } | null;
  avgBounceRate: number;
  pages: LLMTopLandingPage[];
  pagination: { total: number; page: number; pageSize: number };
  fromCache: boolean;
}

export interface TopLandingPagesParams {
  propertyId: string;
  projectId: string;
  startDate?: string;
  endDate?: string;
  sessionUrl?: string;
  page?: number;
  pageSize?: number;
}

export interface CitationSparklinePoint {
  week: string;
  citations: number;
}

export interface CitationSparklineResponse {
  url: string;
  dataPoints: CitationSparklinePoint[];
}

export interface CitationSparklineParams {
  projectId: string;
  url: string;
  startDate?: string;
  endDate?: string;
}

const GA4_PREFIX = '/ga4';

export const ga4Api = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getGA4Status: builder.query<GA4StatusResponse, void>({
      query: () => `${GA4_PREFIX}/status`,
      transformResponse: (response: { data: GA4StatusResponse }) => response.data,
      providesTags: ['GA4'],
    }),

    listGA4Properties: builder.query<GA4Property[], void>({
      query: () => `${GA4_PREFIX}/properties`,
      transformResponse: (response: { data: GA4Property[] }) => response.data,
      providesTags: ['GA4'],
    }),

    selectGA4Property: builder.mutation<void, { propertyId: string }>({
      query: (body) => ({
        url: `${GA4_PREFIX}/select-property`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['GA4'],
    }),

    getGA4Traffic: builder.query<GA4TrafficResponse, GA4TrafficParams>({
      query: ({ propertyId, startDate = '30daysAgo', endDate = 'today' }) => ({
        url: `${GA4_PREFIX}/traffic`,
        params: { propertyId, startDate, endDate },
      }),
      transformResponse: (response: { data: GA4TrafficResponse }) => response.data,
      providesTags: ['GA4'],
    }),

    disconnectGA4: builder.mutation<void, void>({
      query: () => ({
        url: `${GA4_PREFIX}/disconnect`,
        method: 'POST',
      }),
      invalidatesTags: ['GA4'],
    }),

    getLLMTraffic: builder.query<LLMTrafficResponse, LLMTrafficParams>({
      query: ({ propertyId, startDate = '30daysAgo', endDate = 'today' }) => ({
        url: `${GA4_PREFIX}/llm-traffic`,
        params: { propertyId, startDate, endDate },
      }),
      transformResponse: (response: { data: LLMTrafficResponse }) => response.data,
      providesTags: ['GA4'],
    }),

    syncLLMTraffic: builder.mutation<LLMTrafficResponse, LLMTrafficParams>({
      query: ({ propertyId, startDate = '30daysAgo', endDate = 'today' }) => ({
        url: `${GA4_PREFIX}/llm-traffic/sync`,
        method: 'POST',
        body: { propertyId, startDate, endDate },
      }),
      transformResponse: (response: { data: LLMTrafficResponse }) => response.data,
      invalidatesTags: ['GA4'],
    }),

    getTopLandingPages: builder.query<LLMTopLandingPagesResponse, TopLandingPagesParams>({
      query: ({ propertyId, projectId, startDate = '30daysAgo', endDate = 'today', sessionUrl, page, pageSize }) => ({
        url: `${GA4_PREFIX}/top-landing-pages`,
        params: {
          propertyId,
          projectId,
          startDate,
          endDate,
          ...(sessionUrl ? { sessionUrl } : {}),
          ...(page ? { page } : {}),
          ...(pageSize ? { pageSize } : {}),
        },
      }),
      transformResponse: (response: { data: LLMTopLandingPagesResponse }) => response.data,
      providesTags: ['GA4'],
    }),

    getCitationSparkline: builder.query<CitationSparklineResponse, CitationSparklineParams>({
      query: ({ projectId, url, startDate = '30daysAgo', endDate = 'today' }) => ({
        url: `${GA4_PREFIX}/citation-sparkline`,
        params: { projectId, url, startDate, endDate },
      }),
      transformResponse: (response: { data: CitationSparklineResponse }) => response.data,
      providesTags: ['GA4'],
    }),
  }),
});

export const {
  useGetGA4StatusQuery,
  useListGA4PropertiesQuery,
  useSelectGA4PropertyMutation,
  useGetGA4TrafficQuery,
  useLazyGetGA4TrafficQuery,
  useDisconnectGA4Mutation,
  useGetLLMTrafficQuery,
  useSyncLLMTrafficMutation,
  useGetTopLandingPagesQuery,
  useGetCitationSparklineQuery,
} = ga4Api;

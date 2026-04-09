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
  bounceRate: number;    // percentage 0–100
  newUsers: number;
  engagementRate: number; // percentage 0–100
}

export interface GA4TrafficResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  totalViews: number;
  totalActiveUsers: number;
  totalNewUsers: number;
  totalEventCount: number;
  totalKeyEvents: number;
  totalBounceRate: number;    // percentage 0–100
  totalEngagementRate: number; // percentage 0–100
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

// ── Events & Conversions types ────────────────────────────────────────────────

export interface TrackedConversionEvent {
  id: string;
  domain_id: string;
  ga4_event_name: string;
  display_label: string;
  is_active: boolean;
  added_at: string;
}

export interface ConversionPlatformBreakdown {
  platform: string;
  conversions: number;
  conversion_rate: number;
  revenue: number | null;
}

export interface ConversionTopPage {
  page_url: string;
  llm_sessions: number;
  conversions: number;
  conversion_rate: number;
  primary_event: string;
  revenue: number | null;
}

export type ConversionStatus = 'success' | 'no_events_configured' | 'not_connected';

export interface LLMConversionsResponse {
  status: ConversionStatus;
  total_conversions: number;
  conversion_rate: number;
  site_conversion_rate: number;
  revenue: number | null;
  platform_breakdown: ConversionPlatformBreakdown[];
  top_pages: ConversionTopPage[];
  last_synced_at: string;
  from_cache: boolean;
}

export interface LLMConversionsParams {
  propertyId: string;
  startDate?: string;
  endDate?: string;
}

export interface SaveConversionEventsPayload {
  events: Array<{ ga4_event_name: string; display_label: string }>;
}

// ── Visibility ↔ Traffic Correlation types ────────────────────────────────────

export type CorrelationClassification = 'STRONG POSITIVE' | 'MODERATE' | 'WEAK' | 'INVERSE';

export interface CorrelationResult {
  r: number;
  classification: CorrelationClassification;
  data_points: number;
  primary_lag: number;
  lag_details: { lag: number; r: number }[];
}

export interface CorrelationWeeklyPoint {
  week: string;          // 'YYYY-MM-DD'
  citations: number;
  llm_sessions: number;
}

export interface CorrelationAnnotation {
  date: string;          // 'YYYY-MM-DD'
  type: 'content_published' | 'schema_added' | 'score_change';
  label: string;
}

export interface CorrelationResponse {
  status: 'success' | 'insufficient_data' | 'no_citation_data';
  weeks_collected: number;
  min_weeks_required: number;
  correlation: CorrelationResult | null;
  auto_insight: string | null;
  timeseries: CorrelationWeeklyPoint[];
  annotations: CorrelationAnnotation[];
}

export interface CorrelationParams {
  propertyId: string;
  projectId: string;
  weeks?: number;
}

export interface ContentEvent {
  id: string;
  domain_id: string;
  event_date: string;
  event_type: 'content_published' | 'schema_added' | 'score_change';
  event_label: string;
  created_at: string;
}

export interface AddContentEventPayload {
  event_date: string;
  event_type: 'content_published' | 'schema_added' | 'score_change';
  event_label: string;
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

    // ── Events & Conversions ────────────────────────────────────────────────
    getConversionEvents: builder.query<TrackedConversionEvent[], void>({
      query: () => `${GA4_PREFIX}/conversion-events`,
      transformResponse: (response: { data: TrackedConversionEvent[] }) => response.data,
      providesTags: ['GA4'],
    }),

    saveConversionEvents: builder.mutation<void, SaveConversionEventsPayload>({
      query: (body) => ({
        url: `${GA4_PREFIX}/conversion-events`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['GA4'],
    }),

    listGA4Events: builder.query<string[], { propertyId: string; startDate?: string; endDate?: string }>({
      query: ({ propertyId, startDate = '30daysAgo', endDate = 'today' }) => ({
        url: `${GA4_PREFIX}/events-list`,
        params: { propertyId, startDate, endDate },
      }),
      transformResponse: (response: { data: string[] }) => response.data,
      providesTags: ['GA4'],
    }),

    getLLMConversions: builder.query<LLMConversionsResponse, LLMConversionsParams>({
      query: ({ propertyId, startDate = '30daysAgo', endDate = 'today' }) => ({
        url: `${GA4_PREFIX}/llm-conversions`,
        params: { propertyId, startDate, endDate },
      }),
      transformResponse: (response: { data: LLMConversionsResponse }) => response.data,
      providesTags: ['GA4'],
    }),

    syncLLMConversions: builder.mutation<LLMConversionsResponse, LLMConversionsParams>({
      query: ({ propertyId, startDate = '30daysAgo', endDate = 'today' }) => ({
        url: `${GA4_PREFIX}/llm-conversions/sync`,
        method: 'POST',
        body: { propertyId, startDate, endDate },
      }),
      transformResponse: (response: { data: LLMConversionsResponse }) => response.data,
      invalidatesTags: ['GA4'],
    }),

    // ── Visibility ↔ Traffic Correlation ──────────────────────────────────
    getCorrelation: builder.query<CorrelationResponse, CorrelationParams>({
      query: ({ propertyId, projectId, weeks = 16 }) => ({
        url: `${GA4_PREFIX}/correlation`,
        params: { propertyId, projectId, weeks },
      }),
      transformResponse: (response: { data: CorrelationResponse }) => response.data,
      providesTags: ['GA4'],
    }),

    getContentEvents: builder.query<ContentEvent[], { startDate?: string; endDate?: string }>({
      query: ({ startDate, endDate } = {}) => ({
        url: `${GA4_PREFIX}/content-events`,
        params: { ...(startDate ? { startDate } : {}), ...(endDate ? { endDate } : {}) },
      }),
      transformResponse: (response: { data: ContentEvent[] }) => response.data,
      providesTags: ['GA4'],
    }),

    addContentEvent: builder.mutation<ContentEvent, AddContentEventPayload>({
      query: (body) => ({
        url: `${GA4_PREFIX}/content-events`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: ContentEvent }) => response.data,
      invalidatesTags: ['GA4'],
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
  useGetConversionEventsQuery,
  useSaveConversionEventsMutation,
  useListGA4EventsQuery,
  useGetLLMConversionsQuery,
  useSyncLLMConversionsMutation,
  useGetCorrelationQuery,
  useGetContentEventsQuery,
  useAddContentEventMutation,
} = ga4Api;

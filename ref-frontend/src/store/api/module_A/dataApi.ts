import { baseApi } from '../baseApi';

export interface DataListParams {
  limit?: number;
  offset?: number;
  sessionId?: number;
}

export interface DataListResponse {
  data: any[];
  paging?: {
    total: number;
    limit: number;
    offset: number;
  };
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
  session?: any;
  statistics?: any;
  totalPages?: number;
  totalResources?: number;
  logs?: Array<{ id?: number; message: string; level?: string; timestamp: string }>;
}

export interface SessionResponse {
  data: any[];
  session?: any;
}

export interface ExportParams {
  sessionId?: number;
  format?: 'csv' | 'json';
}

export interface BrokenLink {
  url: string;
  sourceUrl?: string;
  statusCode: number;
  errorType?: string;
  error?: string;
  missingType?: string;
}

export interface LinkCheckResults {
  brokenInternalLinks: { count: number; links: BrokenLink[] };
  brokenExternalLinks: { count: number; links: BrokenLink[] };
  missingPages: { count: number; links: BrokenLink[] };
  serverErrors: { count: number; links: BrokenLink[] };
  timeoutUnreachable: { count: number; links: BrokenLink[] };
  totalChecked?: number;
  totalPageLinks?: number;
}

export interface CheckLinksResponse {
  success: boolean;
  results: LinkCheckResults;
}

export interface PageLinkData {
  pageId: number;
  url: string;
  title: string;
  outlinks: number;
  inlinks: number;
  uniqueInlinks: number;
  uniqueJsInlinks: number;
  percentOfTotal: number;
  externalOutlinks: number;
  internalOutlinks: number;
  linkScore?: number;
}

export interface LinkData {
  id: number;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string;
  position: string;
  isInternal: boolean;
  rel: string;
  nofollow: boolean;
  xpath?: string;
}

export interface LinkStats {
  totalLinks: number;
  internalLinks: number;
  externalLinks: number;
  linksByPosition: Record<string, number>;
}

export interface LinkStatsResponse {
  success: boolean;
  stats: LinkStats;
  pageStats: PageLinkData[];
}

export interface GetLinksParams {
  sessionId: number;
  pageId: number;
  type: 'out' | 'in';
}

export const dataApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getDataList: builder.query<DataListResponse, DataListParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.limit) searchParams.set('limit', String(params.limit));
        if (params.offset) searchParams.set('offset', String(params.offset));
        if (params.sessionId) searchParams.set('sessionId', String(params.sessionId));
        return `/api/data/list?${searchParams.toString()}`;
      },
      providesTags: ['Data'],
    }),
    getSession: builder.query<SessionResponse, { sessionId: number; limit?: number }>({
      query: ({ sessionId, limit = 1 }) => `/api/data/sessions?limit=${limit}&sessionId=${sessionId}`,
      providesTags: (result, error, arg) => [{ type: 'Session', id: arg.sessionId }],
    }),
    getPages: builder.query<any, { sessionId: number; pageId?: number; limit?: number }>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        searchParams.set('sessionId', String(params.sessionId));
        if (params.pageId) searchParams.set('pageId', String(params.pageId));
        if (params.limit) searchParams.set('limit', String(params.limit));
        return `/api/data/pages?${searchParams.toString()}`;
      },
      providesTags: ['Data'],
    }),
    exportData: builder.query<Blob, ExportParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params.sessionId) searchParams.set('sessionId', String(params.sessionId));
        if (params.format) searchParams.set('format', params.format);
        return {
          url: `/api/export?${searchParams.toString()}`,
          responseHandler: (response) => response.blob(),
        };
      },
    }),
    checkLinks: builder.mutation<CheckLinksResponse, number>({
      query: (sessionId) => ({
        url: `/api/links/check/${sessionId}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }),
      invalidatesTags: ['Data'],
    }),
    getLinkStats: builder.query<LinkStatsResponse, number>({
      query: (sessionId) => `/api/links/stats/${sessionId}`,
      providesTags: ['Data'],
    }),
    getPageLinks: builder.query<{ success: boolean; links: LinkData[] }, GetLinksParams>({
      query: ({ sessionId, pageId, type }) => `/api/links?sessionId=${sessionId}&pageId=${pageId}&type=${type}&limit=100`,
      providesTags: ['Data'],
    }),
  }),
});

export const {
  useGetDataListQuery,
  useLazyGetDataListQuery,
  useGetSessionQuery,
  useGetPagesQuery,
  useLazyGetPagesQuery,
  useLazyExportDataQuery,
  useCheckLinksMutation,
  useGetLinkStatsQuery,
  useLazyGetPageLinksQuery,
} = dataApi;

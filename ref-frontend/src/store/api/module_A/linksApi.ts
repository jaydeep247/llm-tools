import { baseApi } from '../baseApi';

export interface LinksStatsResponse {
  total: number;
  internal: number;
  external: number;
  broken: number;
}

export interface LinksParams {
  sessionId: number;
  pageId?: number;
  type?: 'in' | 'out' | 'internal' | 'external';
  limit?: number;
}

export interface LinksResponse {
  links: any[];
  total: number;
}

export const linksApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getLinksStats: builder.query<LinksStatsResponse, number>({
      query: (sessionId) => `/api/links/stats/${sessionId}`,
      providesTags: (result, error, sessionId) => [{ type: 'Links', id: `stats-${sessionId}` }],
    }),
    getLinks: builder.query<LinksResponse, LinksParams>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        searchParams.set('sessionId', String(params.sessionId));
        if (params.pageId) searchParams.set('pageId', String(params.pageId));
        if (params.type) searchParams.set('type', params.type);
        if (params.limit) searchParams.set('limit', String(params.limit));
        return `/api/links?${searchParams.toString()}`;
      },
      providesTags: ['Links'],
    }),
  }),
});

export const {
  useGetLinksStatsQuery,
  useLazyGetLinksStatsQuery,
  useGetLinksQuery,
  useLazyGetLinksQuery,
} = linksApi;

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
  }),
});

export const {
  useGetDataListQuery,
  useLazyGetDataListQuery,
  useGetSessionQuery,
  useGetPagesQuery,
  useLazyGetPagesQuery,
  useLazyExportDataQuery,
} = dataApi;

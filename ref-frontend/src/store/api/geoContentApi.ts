import { baseApi } from './baseApi';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeoContentListItem {
  id: string;
  title: string;
  brief: string;
  wordCount: number;
  listicle: boolean;
  keywords: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeoContentDetail extends GeoContentListItem {
  htmlContent: string;
  targetPrompt: string | null;
  linkedinUrl: string | null;
  wordpressUrl: string | null;
}

export interface GeoContentListResponse {
  items: GeoContentListItem[];
  total: number;
  page: number;
  pages: number;
}

export interface GenerateGeoContentRequest {
  brief: string;
  title?: string;
  keywords?: string[];
  targetPrompt?: string;
  listicle?: boolean;
  brandId?: string;
}

export interface UpdateGeoContentTitleRequest {
  id: string;
  title: string;
}

// ─── API Slice ────────────────────────────────────────────────────────────────

export const geoContentApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    generateGeoContent: builder.mutation<GeoContentDetail, GenerateGeoContentRequest>({
      query: (data) => ({
        url: '/geo-content/generate',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: GeoContentDetail }) =>
        response.data,
      invalidatesTags: [{ type: 'GeoContent', id: 'LIST' }],
    }),

    listGeoContent: builder.query<GeoContentListResponse, { page?: number; limit?: number }>({
      query: ({ page = 1, limit = 20 } = {}) => ({
        url: `/geo-content?page=${page}&limit=${limit}`,
        method: 'GET',
      }),
      transformResponse: (response: { success: boolean; data: GeoContentListResponse }) =>
        response.data,
      providesTags: [{ type: 'GeoContent', id: 'LIST' }],
    }),

    getGeoContent: builder.query<GeoContentDetail, string>({
      query: (id) => ({
        url: `/geo-content/${id}`,
        method: 'GET',
      }),
      transformResponse: (response: { success: boolean; data: GeoContentDetail }) =>
        response.data,
      providesTags: (result, error, id) => [{ type: 'GeoContent', id }],
    }),

    updateGeoContentTitle: builder.mutation<void, UpdateGeoContentTitleRequest>({
      query: ({ id, title }) => ({
        url: `/geo-content/${id}/title`,
        method: 'PATCH',
        body: { title },
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'GeoContent', id },
        { type: 'GeoContent', id: 'LIST' },
      ],
    }),

    getBrandPrompts: builder.query<string[], string | undefined>({
      query: (jobId) => ({
        url: jobId ? `/geo-content/brand-prompts?jobId=${encodeURIComponent(jobId)}` : '/geo-content/brand-prompts',
        method: 'GET',
      }),
      transformResponse: (response: { success: boolean; data: { prompts: string[] } }) =>
        response.data.prompts,
    }),
  }),
});

export const {
  useGenerateGeoContentMutation,
  useListGeoContentQuery,
  useGetGeoContentQuery,
  useUpdateGeoContentTitleMutation,
  useGetBrandPromptsQuery,
} = geoContentApi;

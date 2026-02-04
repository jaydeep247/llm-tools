import { baseApi } from '../baseApi';

export interface ExtractSEORequest {
  url: string;
}

export interface ExtractSEOResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export const seoApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    extractSEO: builder.mutation<ExtractSEOResponse, ExtractSEORequest>({
      query: (data) => ({
        url: '/api/seo/extract',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['SEO'],
    }),
  }),
});

export const {
  useExtractSEOMutation,
} = seoApi;

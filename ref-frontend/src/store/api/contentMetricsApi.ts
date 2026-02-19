import { baseApi } from './baseApi';

export interface ContentMetricsJobResult {
  jobId: string;
  sessionId: string;
  projectId: string;
  url: string;
  success: boolean;
  error?: string;
  message?: string;
  content_metrics?: any;
  entity_metrics?: any;
  createdAt?: string;
}

export const contentMetricsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getContentMetrics: builder.query<
      { success: boolean; data: ContentMetricsJobResult | null },
      string
    >({
      query: (jobId) => `/jobs/${jobId}/results/content-metrics`,
      transformResponse: (response: {
        success: boolean;
        data: ContentMetricsJobResult | null;
      }) => response,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),
    startContentMetrics: builder.mutation<
      { success: boolean; data: any },
      { jobId: string }
    >({
      query: ({ jobId }) => ({
        url: `/jobs/${jobId}/content-metrics`,
        method: 'POST',
        body: {},
      }),
    }),
  }),
});

export const { useGetContentMetricsQuery, useStartContentMetricsMutation } = contentMetricsApi;

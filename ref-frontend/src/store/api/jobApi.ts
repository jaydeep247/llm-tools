import { baseApi } from './baseApi';

export interface Job {
  id: string;
  sessionId: string;
  type: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  failureReason?: string;
  config?: any;
}

export interface CrawlResult {
  session: Job & {
    allow_subdomains?: boolean;
    max_concurrency?: number;
    total_pages?: number;
    total_links?: number;
  };
  pages: any[];
  links: Record<string, any[]>;
  sitemaps: any[];
  fields: any[];
}

export interface JobSiteStructure {
  jobId: string;
  sessionId: string;
  projectId: string;
  startUrl: string;
  pages: { url?: string | null }[];
}

export interface JobSchemaResult {
  jobId: string;
  sessionId: string;
  projectId: string;
  url: string;
  success: boolean;
  error?: string;
  message?: string;
  schema?: any;
  schema_text?: string;
  rdfa_markup?: string;
  createdAt?: string;
}

export const jobApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get all jobs for a session
    getSessionJobs: builder.query<
      { success: boolean; data: Job[] },
      string
    >({
      query: (sessionId) => `/sessions/${sessionId}/jobs`,
      transformResponse: (response: { success: boolean; data: Job[] }) => response,
      providesTags: (result, error, sessionId) => [
        { type: 'Session', id: sessionId },
        'Job',
      ],
    }),

    // Get crawl results for a job
    getJobResults: builder.query<CrawlResult, string>({
      query: (jobId) => `/jobs/${jobId}/results`,
      transformResponse: (response: { success: boolean; data: CrawlResult }) =>
        response.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    // Granular endpoints
    getJobPages: builder.query<{ data: any[], pagination: any }, { jobId: string, page?: number, limit?: number }>({
      query: ({ jobId, page = 1, limit = 100 }) => `/jobs/${jobId}/results/pages?page=${page}&limit=${limit}`,
      transformResponse: (response: { success: boolean; data: { data: any[]; pagination: any } }) =>
        response.data,
      providesTags: (result, error, { jobId }) => [{ type: 'Job', id: jobId }],
    }),

    getJobLinks: builder.query<{ data: any[], pagination: any }, { jobId: string, page?: number, limit?: number }>({
      query: ({ jobId, page = 1, limit = 100 }) => `/jobs/${jobId}/results/links?page=${page}&limit=${limit}`,
      transformResponse: (response: { success: boolean; data: { data: any[]; pagination: any } }) =>
        response.data,
      providesTags: (result, error, { jobId }) => [{ type: 'Job', id: jobId }],
    }),

    getJobSitemaps: builder.query<{ data: any[] }, string>({
      query: (jobId) => `/jobs/${jobId}/results/sitemaps`,
      transformResponse: (response: { success: boolean; data: { data: any[] } }) =>
        response.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    getJobFields: builder.query<{ data: any[] }, string>({
      query: (jobId) => `/jobs/${jobId}/results/fields`,
      transformResponse: (response: { success: boolean; data: { data: any[] } }) =>
        response.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    getJobSiteStructure: builder.query<JobSiteStructure, string>({
      query: (jobId) => `/jobs/${jobId}/site-structure`,
      transformResponse: (response: { success: boolean; data: JobSiteStructure }) =>
        response.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    getJobSchema: builder.query<JobSchemaResult | null, string>({
      query: (jobId) => `/jobs/${jobId}/results/schema`,
      transformResponse: (response: { success: boolean; data: JobSchemaResult | null }) =>
        response.data ?? null,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    generateJobSchema: builder.mutation<
      { success: boolean; job: Job },
      { jobId: string; schemaType?: string }
    >({
      query: ({ jobId, schemaType }) => ({
        url: `/jobs/${jobId}/generate-schema`,
        method: 'POST',
        body: schemaType ? { schemaType } : {},
      }),
      transformResponse: (response: { success: boolean; data: Job }) => ({
        success: response.success,
        job: response.data,
      }),
      invalidatesTags: (result, error, { jobId }) => [{ type: 'Job', id: jobId }],
    }),
  }),
});

export const {
  useGetSessionJobsQuery,
  useGetJobResultsQuery,
  useLazyGetJobResultsQuery,
  useGetJobPagesQuery,
  useGetJobLinksQuery,
  useGetJobSitemapsQuery,
  useGetJobFieldsQuery,
  useGetJobSiteStructureQuery,
  useGetJobSchemaQuery,
  useGenerateJobSchemaMutation,
} = jobApi;

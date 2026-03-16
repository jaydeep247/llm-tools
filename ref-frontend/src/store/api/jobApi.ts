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

export interface SeoKeywordResponse {
  url: string;
  language: string | null;
  parent: any;
  keywords: any[];
  cached?: boolean;
}

export interface PromptTrackingTrendPoint {
  date: string;
  visibility_score: number;
  ctr_percent: number;
  engagement_score: number;
  traffic_estimate: number;
}

export interface PromptTrackingMetric {
  prompt: string;
  prompt_visibility_score: number;
  ctr_percent: number;
  engagement_score: number;
  traffic_estimate: number;
  ai_model_ranking: Record<string, number | null>;
  linked_queries: string[];
  visibility_change: number | null;
  trend: PromptTrackingTrendPoint[];
  updated_at: string;
}

export interface PromptTrackingDoc {
  jobId: string;
  url: string;
  tracked_prompts: string[];
  metrics: PromptTrackingMetric[];
  updatedAt?: string;
  createdAt?: string;
}

export interface JobSnapshot {
  jobId: string;
  status: string;
  logs: { message: string; timestamp: number }[];
  links: { url: string; timestamp: number }[];
  completed: boolean;
  snapshotAt: number;     // epoch ms - boundary for socket event filtering
  startedAt?: number;     // epoch ms - when job started
  projectId?: string;
  sessionId?: string;
  pagesCrawled?: number;
  steps?: Record<string, string>;  // Step statuses for quick-start jobs
}

export interface RedirectAuditSummary {
  totalChecked: number;
  total301Redirects: number;
  total302Redirects: number;
  total307Redirects: number;
  totalRedirectChains: number;
  totalRedirectLoops: number;
  totalBrokenRedirects: number;
  totalCanonicalMismatches: number;
  totalOk: number;
  totalWarnings: number;
  totalErrors: number;
}

export interface RedirectAuditResultItem {
  originalUrl: string;
  finalUrl: string;
  finalStatusCode: number;
  has301Redirect: boolean;
  has302Redirect: boolean;
  has307Redirect: boolean;
  redirectChain: {
    url: string;
    statusCode: number;
    redirectType: '301' | '302' | '307' | '308' | null;
    redirectUrl: string | null;
    headers: Record<string, string>;
  }[];
  chainLength: number;
  hasRedirectChain: boolean;
  hasRedirectLoop: boolean;
  loopDetectedAt?: string;
  finalUrlStatus: 'ok' | 'broken' | 'server_error' | 'unreachable';
  finalUrlStatusCode: number;
  isBrokenRedirect: boolean;
  brokenReason?: string;
  canonicalUrl?: string;
  canonicalAlignment: 'match' | 'mismatch' | 'not_found' | 'error';
  canonicalMismatchReason?: string;
  overallStatus: 'ok' | 'warning' | 'error';
  issues: string[];
}

export interface PerformanceAuditItem {
  id: string;
  url: string;
  device: 'mobile' | 'desktop';
  runAt: string;
  LCP_ms?: number;
  TBT_ms?: number;
  CLS?: number;
  FCP_ms?: number;
  TTFB_ms?: number;
  performanceScore?: number;
  psiReportUrl?: string;
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

export interface JobSummary {
  jobId: string;
  type: string;
  createdAt: string;
  session: {
    session_id: string;
    projectId: string;
    jobId: string;
    start_url: string;
    started_at: string;
    allow_subdomains: boolean;
    max_concurrency: number;
    status: string;
    completed_at: string;
    total_pages: number;
    total_links: number;
    total_sitemaps: number;
    total_fields: number;
  };
}

export const jobApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get job snapshot for live updates
    getJobSnapshot: builder.query<JobSnapshot, string | { jobId: string; limit?: number }>({
      query: (arg) => {
        const jobId = typeof arg === 'string' ? arg : arg.jobId;
        const limit = typeof arg === 'string' ? 200 : (arg.limit ?? 200);
        return `/jobs/${jobId}/snapshot?limit=${limit}`;
      },
      transformResponse: (response: { success: boolean; data: JobSnapshot }) => response.data,
      providesTags: (result, error, arg) => [{ type: 'Job', id: typeof arg === 'string' ? arg : arg.jobId }],
      keepUnusedDataFor: 10,
    }),

    // Get job status by jobId
    getJobStatus: builder.query<Job, string>({
      query: (jobId) => `/jobs/${jobId}/status`,
      transformResponse: (response: { success: boolean; data: any }) => response.data.job || response.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),


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
      keepUnusedDataFor: 15,
    }),

    // Get crawl results for a job
    getJobResults: builder.query<CrawlResult, string>({
      query: (jobId) => `/jobs/${jobId}/results`,
      transformResponse: (response: { success: boolean; data: CrawlResult }) =>
        response.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    // Granular endpoints
    getJobPages: builder.query<{ data: any[], pagination: any }, { jobId: string, page?: number, limit?: number, includeTotal?: boolean }>({
      query: ({ jobId, page = 1, limit = 100, includeTotal = false }) => `/jobs/${jobId}/results/pages?page=${page}&limit=${limit}&includeTotal=${includeTotal}`,
      transformResponse: (response: { success: boolean; data: { data: any[]; pagination: any } }) =>
        response.data,
      providesTags: (result, error, { jobId }) => [{ type: 'Job', id: jobId }],
    }),

    getJobLinks: builder.query<{ data: any[], pagination: any }, { jobId: string, page?: number, limit?: number, includeTotal?: boolean }>({
      query: ({ jobId, page = 1, limit = 100, includeTotal = false }) => `/jobs/${jobId}/results/links?page=${page}&limit=${limit}&includeTotal=${includeTotal}`,
      transformResponse: (response: { success: boolean; data: { data: any[]; pagination: any } }) =>
        response.data,
      providesTags: (result, error, { jobId }) => [{ type: 'Job', id: jobId }],
    }),

    getJobSitemaps: builder.query<{ data: any[]; pagination: any }, string | { jobId: string; page?: number; limit?: number; includeTotal?: boolean }>({
      query: (arg) => {
        const jobId = typeof arg === 'string' ? arg : arg.jobId;
        const page = typeof arg === 'string' ? 1 : (arg.page ?? 1);
        const limit = typeof arg === 'string' ? 100 : (arg.limit ?? 100);
        const includeTotal = typeof arg === 'string' ? false : (arg.includeTotal ?? false);
        return `/jobs/${jobId}/results/sitemaps?page=${page}&limit=${limit}&includeTotal=${includeTotal}`;
      },
      transformResponse: (response: { success: boolean; data: { data: any[]; pagination: any } }) =>
        response.data,
      providesTags: (result, error, arg) => [{ type: 'Job', id: typeof arg === 'string' ? arg : arg.jobId }],
    }),

    getJobFields: builder.query<{ data: any[]; pagination: any }, string | { jobId: string; page?: number; limit?: number; includeTotal?: boolean }>({
      query: (arg) => {
        const jobId = typeof arg === 'string' ? arg : arg.jobId;
        const page = typeof arg === 'string' ? 1 : (arg.page ?? 1);
        const limit = typeof arg === 'string' ? 100 : (arg.limit ?? 100);
        const includeTotal = typeof arg === 'string' ? false : (arg.includeTotal ?? false);
        return `/jobs/${jobId}/results/fields?page=${page}&limit=${limit}&includeTotal=${includeTotal}`;
      },
      transformResponse: (response: { success: boolean; data: { data: any[]; pagination: any } }) =>
        response.data,
      providesTags: (result, error, arg) => [{ type: 'Job', id: typeof arg === 'string' ? arg : arg.jobId }],
    }),

    getJobSummary: builder.query<JobSummary | null, string>({
      query: (jobId) => `/jobs/${jobId}/summary`,
      transformResponse: (response: { success: boolean; data: JobSummary | null }) =>
        response.data ?? null,
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

    getJobPromptTracking: builder.query<PromptTrackingDoc | null, string>({
      query: (jobId) => `/jobs/${jobId}/results/prompt-tracking`,
      transformResponse: (response: { success: boolean; data: PromptTrackingDoc | null }) =>
        response.data ?? null,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    startPromptTracking: builder.mutation<{ success: boolean; job: Job }, { jobId: string; prompts: string[] }>({
      query: ({ jobId, prompts }) => ({
        url: `/jobs/${jobId}/prompt-tracking`,
        method: 'POST',
        body: { prompts },
      }),
      transformResponse: (response: { success: boolean; data: Job }) => ({
        success: response.success,
        job: response.data,
      }),
      invalidatesTags: (result, error, { jobId }) => [{ type: 'Job', id: jobId }],
    }),

    getJobRedirectAudit: builder.query<
      { sessionId: string; summary: RedirectAuditSummary; results: RedirectAuditResultItem[] } | null,
      string
    >({
      query: (jobId) => `/jobs/${jobId}/results/redirects-audit`,
      transformResponse: (response: {
        success: boolean;
        data: { sessionId: string; summary: RedirectAuditSummary; results: RedirectAuditResultItem[] } | null;
      }) => response.data ?? null,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    getJobRecommendations: builder.query<
      {
        aggregate: {
          total_pages: number;
          avg_health_score: number;
          critical: number;
          warning: number;
          info: number;
          by_category: Record<string, number>;
        };
        pages: Array<{
          url: string;
          health_score: number | null;
          summary: {
            total: number;
            critical: number;
            warning: number;
            info: number;
            by_category: Record<string, number>;
          } | null;
          recommendations: Array<{
            priority: number;
            category: string;
            severity: 'critical' | 'warning' | 'info';
            title: string;
            issue: string;
            fix: string;
            impact: string;
            fields_affected: string[];
          }>;
        }>;
      },
      string
    >({
      query: (jobId) => `/jobs/${jobId}/results/recommendations`,
      transformResponse: (response: { success: boolean; data: any }) => response.data,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),

    getJobPerformanceAudits: builder.query<
      { items: PerformanceAuditItem[] },
      { jobId: string; device?: 'all' | 'mobile' | 'desktop' }
    >({
      query: ({ jobId, device = 'all' }) => {
        const params =
          device && device !== 'all'
            ? `?device=${encodeURIComponent(device)}`
            : '';
        return `/jobs/${jobId}/performance-audits${params}`;
      },
      transformResponse: (response: { success: boolean; data: { items: PerformanceAuditItem[] } }) =>
        response.data,
      providesTags: (result, error, { jobId }) => [{ type: 'Job', id: jobId }],
    }),

    startJobPerformanceAudits: builder.mutation<
      { success: boolean; data: { jobId: string; device: string; totalPages: number } },
      { jobId: string; device: 'mobile' | 'desktop' }
    >({
      query: ({ jobId, device }) => ({
        url: `/jobs/${jobId}/performance-audits/start`,
        method: 'POST',
        body: { device },
      }),
    }),

    generateJobSchema: builder.mutation<
      { success: boolean; job: Job },
      { jobId: string; schemaType?: string; url?: string }
    >({
      query: ({ jobId, schemaType, url }) => ({
        url: `/jobs/${jobId}/generate-schema`,
        method: 'POST',
        body: (schemaType || url) ? { ...(schemaType ? { schemaType } : {}), ...(url ? { url } : {}) } : {},
      }),
      transformResponse: (response: { success: boolean; data: Job }) => ({
        success: response.success,
        job: response.data,
      }),
      invalidatesTags: (result, error, { jobId }) => [{ type: 'Job', id: jobId }],
    }),

    // Cancel a running job (used when browser is closed)
    cancelJob: builder.mutation<{ success: boolean; job: Job }, string>({
      query: (jobId) => ({
        url: `/jobs/${jobId}/cancel`,
        method: 'POST',
      }),
      transformResponse: (response: { success: boolean; data: Job }) => ({
        success: response.success,
        job: response.data,
      }),
      invalidatesTags: (result, error, jobId) => [
        { type: 'Job', id: jobId },
        'Session',
      ],
    }),

    retryJob: builder.mutation<{ success: boolean; job: Job }, string>({
      query: (jobId) => ({
        url: `/jobs/${jobId}/retry`,
        method: 'POST',
      }),
      transformResponse: (response: { success: boolean; data: Job }) => ({
        success: response.success,
        job: response.data,
      }),
      invalidatesTags: (result, error, jobId) => [
        { type: 'Job', id: jobId },
        'Session',
      ],
    }),

    getSeoKeywordsForUrl: builder.mutation<
      SeoKeywordResponse,
      { jobId: string; url: string }
    >({
      query: ({ jobId, url }) => ({
        url: `/jobs/${jobId}/seo/extract`,
        method: 'POST',
        body: { url },
      }),
    }),
  }),
});

export const {
  useGetJobSnapshotQuery,
  useGetJobStatusQuery,
  useGetSessionJobsQuery,
  useGetJobResultsQuery,
  useLazyGetJobResultsQuery,
  useGetJobPagesQuery,
  useGetJobLinksQuery,
  useGetJobSitemapsQuery,
  useGetJobFieldsQuery,
  useGetJobSummaryQuery,
  useGetJobSiteStructureQuery,
  useGetJobSchemaQuery,
  useGetJobPromptTrackingQuery,
  useStartPromptTrackingMutation,
  useGetJobRedirectAuditQuery,
  useLazyGetJobRedirectAuditQuery,
  useGetJobRecommendationsQuery,
  useGetJobPerformanceAuditsQuery,
  useStartJobPerformanceAuditsMutation,
  useGenerateJobSchemaMutation,
  useCancelJobMutation,
  useRetryJobMutation,
  useGetSeoKeywordsForUrlMutation,
} = jobApi;

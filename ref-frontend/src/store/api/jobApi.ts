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

export const jobApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get all jobs for a session
    getSessionJobs: builder.query<
      { success: boolean; data: Job[] },
      string
    >({
      query: (sessionId) => `/sessions/${sessionId}/jobs`,
      providesTags: (result, error, sessionId) => [
        { type: 'Session', id: sessionId },
        'Job',
      ],
    }),

    // Get crawl results for a job
    getJobResults: builder.query<CrawlResult, string>({
      query: (jobId) => `/jobs/${jobId}/results`,
      providesTags: (result, error, jobId) => [{ type: 'Job', id: jobId }],
    }),
  }),
});

export const {
  useGetSessionJobsQuery,
  useGetJobResultsQuery,
  useLazyGetJobResultsQuery,
} = jobApi;

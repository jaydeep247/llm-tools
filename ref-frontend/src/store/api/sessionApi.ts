import { baseApi } from './baseApi';

export interface CrawlSession {
  id: string;
  projectId: string;
  startUrl: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalPages: number;
  totalResources: number;
  duration: number;
  userId?: number;
  _count?: {
    pages: number;
    resources: number;
  };
}

export interface SessionResponse {
  success: boolean;
  session: CrawlSession;
}

export interface GetProjectSessionsParams {
  projectId: string;
  limit?: number;
  offset?: number;
}

export interface StartCrawlRequest {
  url: string;
  projectId: string;
  allowSubdomains?: boolean;
  runAudits?: boolean;
  auditDevice?: 'mobile' | 'desktop';
  captureLinkDetails?: boolean;
}

export const sessionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get sessions for a project
    getProjectSessions: builder.query<
      { success: boolean; sessions: CrawlSession[]; pagination: any },
      GetProjectSessionsParams
    >({
      query: ({ projectId, limit = 50, offset = 0 }) =>
        `/projects/${projectId}/sessions?limit=${limit}&offset=${offset}`,
      transformResponse: (response: { success: boolean; data: any }) => ({
        success: response.success,
        sessions: Array.isArray(response.data) ? response.data : (response.data?.sessions || []),
        pagination: response.data?.pagination || {},
      }),
      providesTags: (result, error, { projectId }) => [
        { type: 'Project', id: projectId },
        'Session',
      ],
    }),
    
    // Get a specific session
    getSession: builder.query<SessionResponse, string>({
      query: (sessionId) => `/sessions/${sessionId}`,
      transformResponse: (response: { success: boolean; data: CrawlSession }) => ({
        success: response.success,
        session: response.data,
      }),
      providesTags: (result, error, sessionId) => [{ type: 'Session', id: sessionId }],
    }),

    // Create a new session (Step 1)
    createSession: builder.mutation<SessionResponse, string>({
      query: (projectId) => ({
        url: `/projects/${projectId}/sessions`,
        method: 'POST',
        body: {},
      }),
      transformResponse: (response: { success: boolean; data: CrawlSession }) => ({
        success: response.success,
        session: response.data,
      }),
      invalidatesTags: (result, error, projectId) => [
        { type: 'Project', id: projectId },
        'Session',
      ],
    }),

    // Create a new job in a session (Step 2)
    createJob: builder.mutation<{ success: boolean; job: any }, { sessionId: string; data: any }>({
      query: ({ sessionId, data }) => ({
        url: `/sessions/${sessionId}/jobs`,
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: any }) => ({
        success: response.success,
        job: response.data,
      }),
      invalidatesTags: ['Session'],
    }),
  }),
});

export const {
  useGetProjectSessionsQuery,
  useLazyGetProjectSessionsQuery,
  useGetSessionQuery,
  useCreateSessionMutation,
  useCreateJobMutation,
} = sessionApi;

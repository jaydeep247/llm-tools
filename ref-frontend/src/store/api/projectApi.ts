import { baseApi } from './baseApi';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  userId: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  _count?: {
    crawlSessions: number;
  };
}

export interface ProjectWithSessions extends Project {
  crawlSessions: CrawlSession[];
}

export interface CrawlSession {
  id: number;
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

export interface AeoAnalyzeRequest {
  sessionId: number;
  url: string;
}

export interface AeoAnalyzeResponse {
  success: boolean;
  message: string;
  sessionId: number;
}

export interface AeoResultsResponse {
  success: boolean;
  results: any;
  sessionId: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface GetProjectSessionsParams {
  projectId: string;
  limit?: number;
  offset?: number;
}

export const projectApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get all projects for the current user
    getProjects: builder.query<{ success: boolean; projects: Project[] }, void>({
      query: () => '/api/projects',
      providesTags: ['Project'],
    }),
    
    // Get a specific project with its sessions
    getProject: builder.query<{ success: boolean; project: ProjectWithSessions }, string>({
      query: (projectId) => `/api/projects/${projectId}`,
      providesTags: (result, error, projectId) => [{ type: 'Project', id: projectId }],
    }),
    
    // Create a new project
    createProject: builder.mutation<{ success: boolean; project: Project }, CreateProjectRequest>({
      query: (data) => ({
        url: '/api/projects',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Project'],
    }),
    
    // Update a project
    updateProject: builder.mutation<
      { success: boolean; project: Project },
      { projectId: string; data: UpdateProjectRequest }
    >({
      query: ({ projectId, data }) => ({
        url: `/api/projects/${projectId}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'Project', id: projectId },
        'Project',
      ],
    }),
    
    // Delete a project
    deleteProject: builder.mutation<{ success: boolean; message: string }, string>({
      query: (projectId) => ({
        url: `/api/projects/${projectId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Project'],
    }),
    
    // Get sessions for a project
    getProjectSessions: builder.query<
      { success: boolean; sessions: CrawlSession[]; pagination: any },
      GetProjectSessionsParams
    >({
      query: ({ projectId, limit = 50, offset = 0 }) =>
        `/api/projects/${projectId}/sessions?limit=${limit}&offset=${offset}`,
      providesTags: (result, error, { projectId }) => [
        { type: 'Project', id: projectId },
        'Session',
      ],
    }),
    
    // Get a specific session
    getSession: builder.query<SessionResponse, number>({
      query: (sessionId) => `/api/sessions/${sessionId}`,
      providesTags: (result, error, sessionId) => [{ type: 'Session', id: sessionId }],
    }),

    // Start AEO analysis
    startAeoAnalysis: builder.mutation<AeoAnalyzeResponse, AeoAnalyzeRequest>({
      query: (data) => ({
        url: `/api/aeo/analyze`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (result, error, { sessionId }) => [{ type: 'Session', id: sessionId }],
    }),

    // Get AEO results
    getAeoResults: builder.query<AeoResultsResponse, number>({
      query: (sessionId) => `/api/aeo/results/${sessionId}`,
      providesTags: (result, error, sessionId) => [{ type: 'Session', id: sessionId }],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useGetProjectSessionsQuery,
  useLazyGetProjectQuery,
  useLazyGetProjectSessionsQuery,
  useGetSessionQuery,
  useStartAeoAnalysisMutation,
  useLazyGetAeoResultsQuery,
} = projectApi;

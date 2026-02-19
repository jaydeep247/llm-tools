import { baseApi } from './baseApi';
import { CrawlSession } from './sessionApi';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  status: 'ACTIVE' | 'ARCHIVED';
  _count?: {
    sessions: number;
  };
}

export interface ProjectWithSessions extends Project {
  sessions: CrawlSession[];
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: 'ACTIVE' | 'ARCHIVED';
}

export const projectApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get all projects for the current user
    getProjects: builder.query<{ success: boolean; projects: Project[] }, void>({
      query: () => '/projects',
      transformResponse: (response: { success: boolean; data: Project[] }) => ({
        success: response.success,
        projects: response.data,
      }),
      providesTags: ['Project'],
    }),
    
    // Get a specific project with its sessions
    getProject: builder.query<{ success: boolean; project: ProjectWithSessions }, string>({
      query: (projectId) => `/projects/${projectId}`,
      transformResponse: (response: { success: boolean; data: ProjectWithSessions }) => ({
        success: response.success,
        project: response.data,
      }),
      providesTags: (result, error, projectId) => [{ type: 'Project', id: projectId }],
    }),
    
    // Create a new project
    createProject: builder.mutation<{ success: boolean; project: Project }, CreateProjectRequest>({
      query: (data) => ({
        url: '/projects',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: Project }) => ({
        success: response.success,
        project: response.data,
      }),
      invalidatesTags: ['Project'],
    }),
    
    // Update a project
    updateProject: builder.mutation<
      { success: boolean; project: Project },
      { projectId: string; data: UpdateProjectRequest }
    >({
      query: ({ projectId, data }) => ({
        url: `/projects/${projectId}`,
        method: 'PUT',
        body: data,
      }),
      transformResponse: (response: { success: boolean; data: Project }) => ({
        success: response.success,
        project: response.data,
      }),
      invalidatesTags: (result, error, { projectId }) => [
        { type: 'Project', id: projectId },
        'Project',
      ],
    }),
    
    // Delete a project
    deleteProject: builder.mutation<{ success: boolean; message: string }, string>({
      query: (projectId) => ({
        url: `/projects/${projectId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Project'],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useGetProjectQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useLazyGetProjectQuery,
} = projectApi;

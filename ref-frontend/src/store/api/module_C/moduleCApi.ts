import { baseApi } from '../baseApi'

export interface ModuleCModules {
  ai_presence?: {
    score: number
    details?: Record<string, unknown>
  }
  answerability?: {
    score: number
    details?: Record<string, unknown>
  }
  knowledge_base?: {
    score: number
    details?: Record<string, unknown>
  }
  competitor_analysis?: {
    score: number
    details?: Record<string, unknown>
  }
  llm_simulator?: {
    simulations?: Record<string, unknown>
    cross_model_metrics?: {
      consistency_score?: number
    }
  }
  multi_model_insights?: Record<string, unknown>
  actionable_insights?: Record<string, unknown>
}

export interface ModuleCResult {
  jobId: string
  url: string
  timestamp: string
  overall_score: number
  modules: ModuleCModules
}

export interface ModuleCResultResponse {
  success: boolean
  message: string
  data?: ModuleCResult | null
}

export interface ModuleCResultsResponse {
  success: boolean
  message: string
  data?: {
    data: ModuleCResult[]
  }
}

export interface RunModuleCResponse {
  success: boolean
  message: string
  data?: {
    analysisJobId: string
    status: string
  }
}

export interface RunModuleCRequest {
  jobId: string
  url?: string
  query?: string
}

export const moduleCApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Get Module C result for a specific job
    getModuleCResult: builder.query<ModuleCResultResponse, string>({
      query: (jobId) => `/module-c/jobs/${jobId}`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: jobId }],
    }),

    // Get all Module C results for a job (multiple URLs)
    getAllModuleCResults: builder.query<ModuleCResultsResponse, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/all`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `all-${jobId}` }],
    }),

    // Get Module C results for a session
    getSessionModuleCResults: builder.query<ModuleCResultsResponse, string>({
      query: (sessionId) => `/module-c/sessions/${sessionId}`,
      providesTags: (_result, _error, sessionId) => [{ type: 'ModuleC' as const, id: `session-${sessionId}` }],
    }),

    // Run Module C analysis
    runModuleCAnalysis: builder.mutation<RunModuleCResponse, RunModuleCRequest>({
      query: ({ jobId, ...body }) => ({
        url: `/module-c/jobs/${jobId}/run`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, { jobId }) => [
        { type: 'ModuleC' as const, id: jobId },
        { type: 'ModuleC' as const, id: `all-${jobId}` },
      ],
    }),
  }),
})

export const {
  useGetModuleCResultQuery,
  useGetAllModuleCResultsQuery,
  useGetSessionModuleCResultsQuery,
  useRunModuleCAnalysisMutation,
} = moduleCApi

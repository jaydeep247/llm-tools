import { baseApi } from '../baseApi'

export interface ModuleEResult {
  jobId: string
  content_consistency?: {
    score?: number
    mandate?: {
      topic?: string
      audience?: string
      url?: string
      brand_name?: string
      location?: string
    }
    batch_scores?: number[]
  }
  entity_coverage?: {
    score?: number
    expected?: string[]
    observed?: string[]
    missing?: string[]
    found?: string[]
    total_expected?: number
  }
  brand_analysis?: {
    brand_name?: string
    total_mentions?: number
    sentiment?: {
      counts?: {
        positive?: number
        negative?: number
        neutral?: number
      }
      label?: string
    }
    frequency_trend?: Array<{
      date?: string
      count?: number
    }>
    top_sources?: Array<{
      domain?: string
    }>
  }
  sentiment_tracking?: {
    brand_name: string
    industry: string
    service_type: string
    sentiment: {
      overall_score: number
      distribution: {
        Positive: number
        Neutral: number
        Negative: number
      }
      by_model: Record<string, {
        score: number
        distribution: {
          Positive: number
          Neutral: number
          Negative: number
        }
        failed?: boolean
        error?: string
      }>
    }
    visibility: {
      overall_visibility_score: number
      overall_appearance_rate: number
      by_model: Record<string, {
        visibility_score: number
        appearance_rate: number
        appearances: number
        total_prompts: number
        avg_position_weight?: number
      }>
    }
    timestamp: string
  }
  score_history?: Array<{
    date: string
    sentimentScore: number
    visibilityScore: number
  }>
  createdAt?: string
}

export interface ModuleEResultResponse {
  success: boolean
  message: string
  data?: ModuleEResult
  error?: string
}

export const moduleEApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getModuleEResult: builder.query<ModuleEResultResponse, string>({
      query: (jobId) => `/module-e/jobs/${jobId}`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runModuleEAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/module-e/jobs/${jobId}/run`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runSentimentAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/module-e/jobs/${jobId}/run-sentiment`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
  }),
})

export const {
  useGetModuleEResultQuery,
  useRunModuleEAnalysisMutation,
  useRunSentimentAnalysisMutation,
} = moduleEApi

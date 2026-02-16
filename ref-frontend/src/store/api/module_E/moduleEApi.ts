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
  }),
})

export const { useGetModuleEResultQuery } = moduleEApi

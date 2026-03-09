import { baseApi } from '../baseApi'

export interface QuickStartResult {
  jobId: string
  brand_analysis?: {
    brand_name?: string
    total_mentions?: number
    sentiment?: {
      counts?: { positive?: number; negative?: number; neutral?: number }
      label?: string
    }
    frequency_trend?: Array<{ date?: string; count?: number }>
    top_sources?: Array<{ domain?: string }>
  }
  competitor_mentions?: {
    overall_sov: number
    data: Array<{ name: string; mentions: number; sentiment: string; trend: number[] }>
  }
  ai_share_of_voice?: {
    overall_sov: number
    visibility_tier?: string
    brand_known_by_models?: string[]
    brand_terms_checked?: string[]
    by_model: Record<
      string,
      { sov: number; brand_mentions: number; competitor_mentions: number; brand_known?: boolean }
    >
  }
  ai_sov_history?: Array<{
    date: string
    overall_sov: number
    visibility_tier?: string
    brand_known_by_models?: string[]
    by_model: Record<
      string,
      { sov: number; brand_mentions: number; competitor_mentions: number; brand_known?: boolean }
    >
  }>
  ranking_analysis?: {
    generated_prompts?: string[]
    ranking_position_per_prompt?: Array<{
      prompt: string
      model: string
      position: number | null
      total_cited: number
      percentile: number | null
      content_quality_score: number
    }>
    [key: string]: any
  }
  crawl_status?: 'running' | 'completed' | 'failed' | 'cancelled' | 'paused'
  crawlUpdatedAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface QuickStartResultResponse {
  success: boolean
  message: string
  data?: QuickStartResult | null
}

export const quickStartApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getQuickStartResult: builder.query<QuickStartResultResponse, string>({
      query: (jobId) => `/quick-start/jobs/${jobId}`,
      providesTags: (_result, _error, jobId) => [{ type: 'QuickStart' as const, id: jobId }],
    }),
    resumeCrawl: builder.mutation<{ success: boolean }, string>({
      query: (jobId) => ({
        url: `/quick-start/jobs/${jobId}/resume-crawl`,
        method: 'POST',
      }),
    }),
  }),
})

export const { useGetQuickStartResultQuery, useResumeCrawlMutation } = quickStartApi

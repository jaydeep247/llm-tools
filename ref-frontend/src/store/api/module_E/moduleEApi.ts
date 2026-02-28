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
  master_analysis?: {
    mandate?: {
      topic?: string
      audience?: string
      tone?: string
      brand_name?: string
      location?: string
    }
    expected_entities?: string[]
    models?: Array<{
      model: string
      accuracy_of_generated_response: number
      content_consistency: {
        score: number
        topic_density?: number
        audience_density?: number
        brand_density?: number
        mandate?: {
          topic?: string
          audience?: string
          tone?: string
          brand_name?: string
          location?: string
        }
      }
      entity_coverage: {
        score: number
        expected: string[]
        observed: string[]
        found: string[]
        missing: string[]
        total_expected: number
      }
      completeness_score: number
      model_wise_performance_score: number
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
  competitor_landscape?: {
    score: number
    total_referring_domains: number
    total_backlinks: number
    domain_quality: number
    diversity_score: number
    spam_score: number
    top_referring_domains: Array<{ name: string; count: number }>
    recommendations: string[]
  }
  competitor_mentions?: {
    overall_sov: number
    data: Array<{
      name: string
      mentions: number
      sentiment: string
      trend: number[]
    }>
  }
  ai_share_of_voice?: {
    overall_sov: number
    visibility_tier?: string
    brand_known_by_models?: string[]
    brand_terms_checked?: string[]
    by_model: Record<
      string,
      {
        sov: number
        brand_mentions: number
        competitor_mentions: number
        brand_known?: boolean
      }
    >
  }
  ai_sov_history?: Array<{
    date: string
    overall_sov: number
    visibility_tier?: string
    brand_known_by_models?: string[]
    by_model: Record<string, { sov: number; brand_mentions: number; competitor_mentions: number; brand_known?: boolean }>
  }>
  ranking_analysis?: {
    ranking_position_per_prompt: Array<{
      prompt: string
      model: string
      position: number | null
      total_cited: number
      citation_count?: number
      total_citations?: number
      source_diversity: number
      credibility_score: number
      percentile: number
      content_quality_score: number
      accuracy_score?: number
      sentiment_score?: number
      brand_text_mentioned?: boolean
      citation_matched?: boolean
      mention_status?: 'Cited' | 'Mentioned (No Link)' | 'Not Mentioned'
    }>
    percentile_by_prompt: Record<string, Record<string, number>>
    model_wise_comparison: Array<{ prompt: string;[model: string]: number | string | null }>
    content_quality: {
      overall_score: number
      by_prompt_model: Record<string, Record<string, number>>
    }
    metrics_summary?: {
      average_accuracy: number
      average_sentiment: number
    }
    entity_coverage: {
      score: number
      found_entities: string[]
      missing_entities: string[]
      total_expected: number
    }
    generated_prompts: string[]
    errors?: string[]
  }
  createdAt?: string
  updatedAt?: string
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
    runConsistencyAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/module-e/jobs/${jobId}/run-consistency`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runCompetitorAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/module-e/jobs/${jobId}/run-competitors`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runBrandAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/module-e/jobs/${jobId}/run-brand`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runRankingAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/module-e/jobs/${jobId}/run-ranking`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runAiSovAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/module-e/jobs/${jobId}/run-ai-sov`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
  }),
})

export const {
  useGetModuleEResultQuery,
  useRunModuleEAnalysisMutation,
  useRunBrandAnalysisMutation,
  useRunSentimentAnalysisMutation,
  useRunConsistencyAnalysisMutation,
  useRunCompetitorAnalysisMutation,
  useRunAiSovAnalysisMutation,
  useRunRankingAnalysisMutation,
} = moduleEApi

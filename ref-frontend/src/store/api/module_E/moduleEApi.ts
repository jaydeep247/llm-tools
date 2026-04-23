import { baseApi } from '../baseApi'

export interface ModuleEResult {
  jobId: string
  content_consistency?: {
    score?: number
    mandate?: {
      topic?: string
      audience?: string
      tone?: string
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
      url?: string
      title?: string
      snippet?: string
      mention_count?: number
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
  tracked_prompts_recommendations?: {
    recommendations: Array<{
      priority: number
      category: string
      severity: 'critical' | 'warning' | 'info'
      title: string
      issue: string
      fix: string
      impact: string
      fields_affected: string[]
    }>
    health_score: number
    summary: string
  }
  citations_recommendations?: {
    recommendations: Array<{
      priority: number
      category: string
      severity: 'critical' | 'warning' | 'info'
      title: string
      issue: string
      fix: string
      impact: string
      fields_affected: string[]
    }>
    health_score: number
    summary: string
  }
  sov_recommendations?: {
    recommendations: Array<{
      priority: number
      category: string
      severity: 'critical' | 'warning' | 'info'
      title: string
      issue: string
      fix: string
      impact: string
      fields_affected: string[]
    }>
    health_score: number
    summary: string
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

export interface ModuleEAskAIRequestBody {
  project_id: string
  question: string
  job_id?: string
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface ModuleEAskAIResult {
  answer: string
  question_type?: string
  sources?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
}

export interface ModuleEAskAIResponse {
  answer?: string
  question_type?: string
  sources?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
  data?: ModuleEAskAIResult | null
  success?: boolean
  message?: string
  error?: string
}

export interface PerceptionSourceDomain {
  domain: string
  totalUrls: number
  responses: number
  urls: Array<{
    url: string
    responses: number
    type?: string
  }>
}

export interface PerceptionSourcesApiData {
  success: boolean
  job_id: string
  totals: {
    unique_domains: number
    unique_urls: number
    responses: number
  }
  domains: PerceptionSourceDomain[]
}

export interface PerceptionSourcesResponse {
  success: boolean
  message: string
  data?: PerceptionSourcesApiData
  error?: string
}

export interface PerceptionSourceResponseRow {
  response_id: string
  prompt: string
  property: string
  llm: string
  timestamp: string | null
}

export interface PerceptionSourceResponsesApiData {
  success: boolean
  job_id: string
  domain: string
  count: number
  rows: PerceptionSourceResponseRow[]
}

export interface PerceptionSourceResponsesResponse {
  success: boolean
  message: string
  data?: PerceptionSourceResponsesApiData
  error?: string
}

export interface PerceptionSourcesQuery {
  job_id: string
  customer_root_domain: string
  search?: string
  llm?: string
  property?: string
  type?:
    | 'all'
    | 'owned'
    | 'third-party'
    | 'article'
    | 'blog'
    | 'case-study'
    | 'forum-community'
    | 'guide-tutorial'
    | 'homepage'
    | 'marketing-listing'
    | 'product-comparison'
    | 'product-page'
    | 'research'
    | 'broken'
}

export interface PerceptionSourceResponsesQuery {
  job_id: string
  domain: string
  customer_root_domain: string
  llm?: string
  property?: string
  type?:
    | 'all'
    | 'owned'
    | 'third-party'
    | 'article'
    | 'blog'
    | 'case-study'
    | 'forum-community'
    | 'guide-tutorial'
    | 'homepage'
    | 'marketing-listing'
    | 'product-comparison'
    | 'product-page'
    | 'research'
    | 'broken'
}

export interface PerceptionCell {
  property: string
  model: string
  model_version: string
  prompt: string
  rating: 'Exceptional' | 'Great' | 'Good' | 'Unavailable'
  rating_score: number
  depth_score: number
  accuracy_score: number
  positivity_score: number
  specificity_score: number
  raw_response_text: string
  citations: Array<{ source?: string }>
}

export interface PerceptionAnalysisData {
  job_id: string
  brand_name: string
  domain: string
  market: string
  language: string
  cells: PerceptionCell[]
  history?: Array<{
    run_at: string
    scores: Array<{
      property: string
      model_version: string
      model: string
      rating_score: number
      rating: 'Exceptional' | 'Great' | 'Good' | 'Unavailable'
    }>
  }>
}

export interface PerceptionAnalysisResponse {
  success: boolean
  message: string
  data?: {
    success: boolean
    job_id: string
    data: PerceptionAnalysisData
  }
  error?: string
}

export interface RunPerceptionRequest {
  job_id: string
  brand_name: string
  domain: string
  market?: string
  language?: string
  properties?: string[]
  models?: string[]
}

export interface PerceptionSourcesOverviewResponse {
  success: boolean
  message: string
  data?: {
    success: boolean
    job_id: string
    kpis: {
      total_sources: number
      unique_domains: number
    }
    domain_share: Array<{
      domain: string
      citations: number
      share_pct: number
    }>
    trend: {
      timeline: string[]
      series: Array<{
        domain: string
        points: Array<{
          week_start: string
          citations: number
          share_pct: number
        }>
      }>
    }
  }
  error?: string
}

export interface PerceptionSourcesOverviewQuery {
  job_id: string
  customer_root_domain: string
  llm?: string
  property?: string
  type?:
    | 'all'
    | 'owned'
    | 'third-party'
    | 'article'
    | 'blog'
    | 'case-study'
    | 'forum-community'
    | 'guide-tutorial'
    | 'homepage'
    | 'marketing-listing'
    | 'product-comparison'
    | 'product-page'
    | 'research'
    | 'broken'
}

export const moduleEApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getModuleEResult: builder.query<ModuleEResultResponse, string>({
      query: (jobId) => `/module-e/jobs/${jobId}`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    getPerceptionAnalysis: builder.query<PerceptionAnalysisResponse, string>({
      query: (jobId) => `/module-e/perception?${new URLSearchParams({ job_id: jobId }).toString()}`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runPerceptionAnalysis: builder.mutation<PerceptionAnalysisResponse, RunPerceptionRequest>({
      query: (body) => ({
        url: '/module-e/perception/run',
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, body) => [{ type: 'ModuleE' as const, id: body.job_id }],
    }),
    getPerceptionSources: builder.query<PerceptionSourcesResponse, PerceptionSourcesQuery>({
      query: ({ job_id, customer_root_domain, search, llm, property, type }) => {
        const params = new URLSearchParams({
          job_id,
          customer_root_domain,
          search: search ?? '',
          llm: llm ?? 'All Models',
          property: property ?? 'All Properties',
          type: type ?? 'all',
        })
        return `/module-e/perception-sources?${params.toString()}`
      },
      providesTags: (_result, _error, query) => [{ type: 'ModuleE' as const, id: query.job_id }],
    }),
    getPerceptionSourcesOverview: builder.query<PerceptionSourcesOverviewResponse, PerceptionSourcesOverviewQuery>({
      query: ({ job_id, customer_root_domain, llm, property, type }) => {
        const params = new URLSearchParams({
          job_id,
          customer_root_domain,
          llm: llm ?? 'All Models',
          property: property ?? 'All Topics',
          type: type ?? 'all',
        })
        return `/module-e/perception-sources-overview?${params.toString()}`
      },
      providesTags: (_result, _error, query) => [{ type: 'ModuleE' as const, id: query.job_id }],
    }),
    getPerceptionSourceResponses: builder.query<PerceptionSourceResponsesResponse, PerceptionSourceResponsesQuery>({
      query: ({ job_id, domain, customer_root_domain, llm, property, type }) => {
        const params = new URLSearchParams({
          job_id,
          domain,
          customer_root_domain,
          llm: llm ?? 'All Models',
          property: property ?? 'All Properties',
          type: type ?? 'all',
        })
        return `/module-e/perception-sources/responses?${params.toString()}`
      },
      providesTags: (_result, _error, query) => [{ type: 'ModuleE' as const, id: query.job_id }],
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
        url: `/jobs/${jobId}/module-e/sentiment`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runConsistencyAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/jobs/${jobId}/module-e/consistency`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runCompetitorAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/jobs/${jobId}/module-e/competitors`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runBrandAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/jobs/${jobId}/module-e/brand`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runRankingAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/jobs/${jobId}/module-e/ranking`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    runAiSovAnalysis: builder.mutation<ModuleEResultResponse, string>({
      query: (jobId) => ({
        url: `/jobs/${jobId}/module-e/ai-sov`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleE' as const, id: jobId }],
    }),
    askModuleEAI: builder.mutation<ModuleEAskAIResponse, ModuleEAskAIRequestBody>({
      query: (body) => ({
        url: '/module-e/ask-ai',
        method: 'POST',
        body,
      }),
    }),
    getModuleESuggestedQuestions: builder.mutation<{ questions?: string[] }, { project_id: string }>({
      query: (body) => ({
        url: '/module-e/ask-ai/suggested-questions',
        method: 'POST',
        body,
      }),
    }),
  }),
})

export const {
  useGetModuleEResultQuery,
  useGetPerceptionAnalysisQuery,
  useRunPerceptionAnalysisMutation,
  useGetPerceptionSourcesQuery,
  useGetPerceptionSourceResponsesQuery,
  useGetPerceptionSourcesOverviewQuery,
  useRunModuleEAnalysisMutation,
  useRunBrandAnalysisMutation,
  useRunSentimentAnalysisMutation,
  useRunConsistencyAnalysisMutation,
  useRunCompetitorAnalysisMutation,
  useRunAiSovAnalysisMutation,
  useRunRankingAnalysisMutation,
  useAskModuleEAIMutation,
  useGetModuleESuggestedQuestionsMutation,
} = moduleEApi

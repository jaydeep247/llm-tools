import { baseApi } from '../baseApi'

export interface ModuleFCompareVisibilityEntityRow {
  name: string
  visibility_score: number
  rank_difference_vs_brand?: number | null
  market_share_percent: number
  mentions_total: number
  mentioned_in_models: number
  avg_rank?: number | null
  avg_rank_percentile: number
  per_model: Record<
    string,
    {
      mentions: number
      rank?: number | null
      rank_percentile?: number | null
      first_position?: number | null
    }
  >
}

export interface ModuleFCompareVisibilityAgainstCompetitors {
  brand?: ModuleFCompareVisibilityEntityRow | null
  competitors?: ModuleFCompareVisibilityEntityRow[]
  topic?: string
  models?: string[]
  model_errors?: Record<string, string>
  error?: string
}

export interface ModuleFCompetitorWins {
  summary: {
    total_prompts: number
    brand_wins: number
    competitor_wins: number
    brand_win_rate: number
    competitor_win_rate: number
    avg_content_gap_score: number
    brand_prompt_mentions?: number
  }
  detailed_results: Array<{
    prompt: string
    winner: 'brand' | 'competitor' | 'none' | 'unknown'
    winner_name?: string | null
    brand_rank?: number | null
    ranks: Record<string, number>
    text_snippet: string
    coverage_gap_score: number
    intent_coverage?: {
      intent_coverage_score?: number
      has_list?: boolean
      direct_answer?: boolean
      reason?: string
    }
    winner_quality?: {
      quality_score?: number
      sentiment_score?: number
      specificity_score?: number
      context_snippet?: string
    }
    brand_quality?: {
      quality_score?: number
      sentiment_score?: number
      specificity_score?: number
      context_snippet?: string
    }
  }>
  competitor_breakdown?: Array<{
    competitor: string
    competitor_key?: string
    prompts_mentioned: number
    prompts_won: number
    win_percent: number
    content_gap_score: number
  }>
}

export interface ModuleFGapOpportunity {
  competitor: string
  gapScore: number
  missingPrompts: number
  potentialGainPercent: number
  potentialGainMentions?: number
  opportunities: Array<{
    prompt: string
    rank: number | null
    opportunityScore: number
  }>
}

export interface ModuleFSourceAnalysis {
  competitor_source_analysis: Array<{
    competitor: string
    source_domain_influence_score: number
    average_domain_authority: number
    credibility_score?: number
    citation_count: number
    source_diversity?: number
    unique_domains?: number
    citation_frequency?: Array<{
      domain: string
      count: number
    }>
    type_diversity?: number
    top_citations: Array<{
      domain: string
      url?: string
      authority_score: number
      citation_type?: string
    }>
  }>
}

export type ModuleFMetricRecommendation = {
  why: string
  fix: string
}

export type ModuleFRecommendations = Record<string, string | ModuleFMetricRecommendation>

export interface ModuleFEmergingTrends {
  competitor_changes: Array<{
    name: string
    delta_visibility: number
    delta_market_share: number
    status: 'rising' | 'falling' | 'new' | 'missing' | 'stable'
  }>
  prompt_swings: Array<{
    prompt: string
    from: string
    to: string
  }>
  model_targeting?: Record<string, string[]>
  summary?: {
    trends_detected: number
    avg_visibility_delta: number
    new_prompts: number
    threat_level: 'low' | 'medium' | 'high'
  }
}

export interface ModuleFResult {
  jobId: string
  url?: string
  compare_visibility_against_competitors?: ModuleFCompareVisibilityAgainstCompetitors
  competitor_wins?: ModuleFCompetitorWins
  gap_opportunities?: ModuleFGapOpportunity[]
  source_analysis?: ModuleFSourceAnalysis
  recommendations?: ModuleFRecommendations
  emerging_trends?: ModuleFEmergingTrends | null
  createdAt?: string
  updatedAt?: string
}

export interface ModuleFTrendPoint {
  date: string
  jobId: string
  brand: {
    name: string
    visibility_score: number
    market_share_percent: number
    mentions_total: number
  }
  competitors: Array<{
    name: string
    visibility_score: number
    market_share_percent: number
    mentions_total: number
  }>
}

export interface ModuleFTrends {
  history: ModuleFTrendPoint[]
  growth_rates: {
    brand_visibility: number
    brand_market_share: number
    competitors: Record<string, {
      visibility: number
      market_share: number
    }>
  }
}

export interface ModuleFTrendsResponse {
  success: boolean
  message: string
  data?: ModuleFTrends | null
  error?: string
}

export interface ModuleFResultResponse {
  success: boolean
  message: string
  data?: ModuleFResult | null
  error?: string
}

export const moduleFApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getModuleFResult: builder.query<ModuleFResultResponse, string>({
      query: (jobId) => `/module-f/jobs/${jobId}`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleF' as const, id: jobId }],
    }),
    getModuleFTrends: builder.query<ModuleFTrendsResponse, string>({
      query: (jobId) => `/module-f/jobs/${jobId}/trends`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleF' as const, id: jobId }],
    }),
    runModuleFAnalysis: builder.mutation<ModuleFResultResponse, string>({
      query: (jobId) => ({
        url: `/module-f/jobs/${jobId}/run`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, jobId) => [{ type: 'ModuleF' as const, id: jobId }],
    }),
  }),
})

export const { 
  useGetModuleFResultQuery, 
  useRunModuleFAnalysisMutation,
  useGetModuleFTrendsQuery
} = moduleFApi


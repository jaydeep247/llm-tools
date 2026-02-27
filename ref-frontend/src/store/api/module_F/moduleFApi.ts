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
  }
  detailed_results: Array<{
    prompt: string
    winner: 'brand' | 'competitor' | 'none' | 'unknown'
    winner_name?: string | null
    brand_rank?: number | null
    ranks: Record<string, number>
    text_snippet: string
    coverage_gap_score: number
  }>
}

export interface ModuleFGapOpportunity {
  competitor: string
  gapScore: number
  missingPrompts: number
  potentialGainPercent: number
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
    citation_count: number
    top_citations: Array<{
      domain: string
      authority_score: number
      citation_type?: string
    }>
  }>
}

export interface ModuleFResult {
  jobId: string
  url?: string
  compare_visibility_against_competitors?: ModuleFCompareVisibilityAgainstCompetitors
  competitor_wins?: ModuleFCompetitorWins
  gap_opportunities?: ModuleFGapOpportunity[]
  source_analysis?: ModuleFSourceAnalysis
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



// ── Changes vs original ───────────────────────────────────────────────────
//  1. ModuleFCompareVisibilityEntityRow — added sentiment, in_title,
//     citation_present, cited_urls, citation_count (from Python Fix 3–7)
//  2. per_model row extended with sentiment, in_title, citation_present,
//     cited_urls (all now produced by _run_models URL extraction fix)
//  3. Moat4GapType — added 'model_gap' (Issue 10 from rec engine)
//  4. Moat4Action — added effort_hours (sprint_backlog field) and
//     model_detail (sub-object for model_gap actions)
//  5. ModuleFResult — added alerts field (cbm_alerts from _write_cbm_alerts)
//  6. resolveAlerts() helper added — mirrors pattern of resolveGapAnalysis
//  7. resolveMoat4Recommendations — kept, null-safe (unchanged)
// ─────────────────────────────────────────────────────────────────────────

import { baseApi } from '../baseApi'

// ─────────────────────────────────────────────────────────────────────────────
// Per-model stats row
// Produced by _run_models() → _aggregate_benchmark_scores() in competitor_ai_intelligence.py
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleFPerModelStats {
  mentions: number
  rank?: number | null
  rank_percentile?: number | null
  first_position?: number | null
  // ── New fields from Fix 3 (URL extraction + rich entity stats) ───────────
  sentiment?: number | null          // -1.0 to +1.0 from _estimate_sentiment()
  in_title?: boolean                 // true if brand appears in a markdown heading
  citation_present?: boolean         // true if a URL from this domain was found in response
  cited_urls?: string[]              // actual URLs cited by this model for this entity
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity row in compare_visibility_against_competitors
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleFCompareVisibilityEntityRow {
  name: string
  entity_type?: 'client' | 'competitor'
  entity_id?: string | null
  display_order?: number
  visibility_score: number
  benchmark_score: number
  share_of_voice: number
  rank_position: number
  rank_difference_vs_brand?: number | null
  market_share_percent: number
  mentions_total: number
  mentioned_in_models: number
  avg_rank?: number | null
  avg_rank_percentile: number
  score_delta?: number
  rank_move?: number
  cited_urls?: string[]
  citation_count?: number
  per_model: Record<string, ModuleFPerModelStats>
}

export interface ModuleFCompareVisibilityAgainstCompetitors {
  brand?: ModuleFCompareVisibilityEntityRow | null
  competitors?: ModuleFCompareVisibilityEntityRow[]
  topic?: string
  models?: string[]
  model_errors?: Record<string, string>
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Competitor prompt win/loss (Screen 3)
// ─────────────────────────────────────────────────────────────────────────────

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
    winner_quality?: Record<string, unknown>
    brand_quality?: Record<string, unknown>
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

// ─────────────────────────────────────────────────────────────────────────────
// Gap analysis (Screen 5)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Source / cited URL analysis (Screen 4)
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleFSourceCitation {
  domain: string
  url?: string
  authority_score: number
  citation_type?: string
  content_type?: 'blog' | 'guide' | 'comparison' | 'tool' | 'faq' | 'page'
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
    citation_frequency?: Array<{ domain: string; count: number }>
    type_diversity?: number
    top_citations: ModuleFSourceCitation[]
  }>
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric-level why + fix recommendations (generate_metric_recommendations)
// ─────────────────────────────────────────────────────────────────────────────

export type ModuleFMetricRecommendation = {
  why: string
  fix: string
}

export interface ModuleFRecommendations {
  visibility_score?: ModuleFMetricRecommendation | string
  market_share?: ModuleFMetricRecommendation | string
  brand_win_rate?: ModuleFMetricRecommendation | string
  competitor_win_rate?: ModuleFMetricRecommendation | string
  content_gap_score?: ModuleFMetricRecommendation | string
  missing_prompts?: ModuleFMetricRecommendation | string
  potential_gain?: ModuleFMetricRecommendation | string
  source_influence?: ModuleFMetricRecommendation | string
  avg_domain_authority?: ModuleFMetricRecommendation | string
  total_citations?: ModuleFMetricRecommendation | string
  rank_delta?: ModuleFMetricRecommendation | string
  [key: string]: ModuleFMetricRecommendation | string | undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Emerging trends (Screen 6)
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleFEmergingTrends {
  competitor_changes: Array<{
    name: string
    delta_visibility: number
    delta_market_share: number
    status: 'rising' | 'falling' | 'new' | 'missing' | 'stable'
    score_delta?: number
    rank_delta?: number
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

// ─────────────────────────────────────────────────────────────────────────────
// cbm_alerts — written by runner._write_cbm_alerts() (Fix 11)
// Fires when |rank_move| ≥ 2 OR |score_delta| ≥ 10
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleFAlert {
  jobId: string
  projectId: string
  sessionId?: string
  entityName: string
  alertType: 'improvement' | 'drop' | 'rank_change'
  alertLevel?: 'high' | 'medium' | 'low'
  message: string
  scoreDelta: number
  rankMove: number
  currentRank?: number | null
  benchmarkScore?: number | null
  firedAt: string
  status: 'unread' | 'read' | 'dismissed'
}

// ─────────────────────────────────────────────────────────────────────────────
// D7 AIVS™ output — from moat7_aivs_bridge.run_d7_pipeline()
// ─────────────────────────────────────────────────────────────────────────────

export interface D7ParamBreakdown {
  sov:     { score?: number | null; raw_pct?: number | null }
  gaps:    { score?: number | null; count?: number | null }
  overlap: { score?: number | null; overlap_pct?: number | null }
}

export interface D7AivsOutput {
  d7_score:               number
  d7_grade:               string
  d7_delta:               number | null
  d7_delta_direction:     'improved' | 'dropped' | 'stable' | 'first_run'
  aivs_d7_contribution:   number
  aivs_d7_delta:          number | null
  projected_aivs_score:   number | null
  previous_aivs_score:    number | null
  previous_d7_score:      number | null
  previous_d7_grade:      string | null
  param_breakdown:        D7ParamBreakdown
  grade_change:           'improved' | 'dropped' | null
  alert_level:            'high' | 'medium' | 'low' | 'none'
  generated_at:           string
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan feature flags — from runner.PLAN_FEATURE_FLAGS
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleFFeatureFlags {
  max_competitors:         number
  leaderboard:             boolean
  model_breakdown_view:    boolean
  prompt_level_drilldown:  boolean
  competitor_cited_urls:   boolean
  gap_opportunities:       boolean | 'limited'
  trend_chart_days:        number
  benchmark_score_alerts:  boolean
  export:                  boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// MOAT 4 — Recommendation Engine types (module_f_recommendation_engine.py)
// ─────────────────────────────────────────────────────────────────────────────

export type Moat4DeltaClass =
  | 'competitor_threat'
  | 'critical_drop'
  | 'significant_drop'
  | 'plateau'
  | 'improvement'
  | 'stable'

export type Moat4GapType =
  | 'uncontested'
  | 'priority_fix'
  | 'comparison_page'
  | 'near_uncontested'
  | 'competitor_surge'
  | 'win_rate'
  | 'citation_gap'
  | 'schema'
  | 'score_drop'
  | 'entity_consistency'
  | 'model_gap'              // ← Fix: Issue 10 — model-specific rank gap

export interface Moat4Action {
  rec_id: string
  module: string
  action_title: string
  action_detail: string
  affected_urls: string[]
  impact_score: number
  effort_score: number       // inverted for display: high = low effort = quick win
  urgency_score: number
  priority_score: number     // IEU: (I×0.50) + ((11−E_raw)×0.30) + (U×0.20)
  gap_type: Moat4GapType | null
  competitor: string | null
  role_visibility: string[]
  status: 'pending' | 'completed' | 'dismissed'
  created_at?: string
  // ── Sprint backlog extras (role=seo_manager, Fix 12) ─────────────────────
  effort_hours?: number              // ~hrs estimate from effort_hrs_map
  dependency?: 'developer' | 'content_team'
  // ── model_gap sub-object (Issue 10, Fix 13) ──────────────────────────────
  model_detail?: {
    best_model: string
    best_rank: number
    worst_model: string
    worst_rank: number
    rank_spread: number
  } | null
}

export interface Moat4RoleOutput {
  role: string
  format:
    | 'executive_brief'
    | 'content_priority_brief'
    | 'sprint_backlog'
    | 'content_brief'
    | 'trend_analysis'
  headline: string
  summary: string
  top_risk?: string           // CXO brief only
  actions: Moat4Action[]
}

export interface Moat4Recommendations {
  delta_class: Moat4DeltaClass
  role_output: Moat4RoleOutput
  all_actions: Moat4Action[]
  generated_at: string
}

// ─────────────────────────────────────────────────────────────────────────────
// ModuleFResult — top-level document returned by GET /module-f/jobs/:jobId
//
// KEY CONTRACT (matches runner.py result dict):
//   gap_analysis           ← primary key  (was gap_opportunities — alias kept)
//   metric_recommendations ← primary key  (was recommendations — alias kept)
//   alerts                 ← new: cbm_alerts array from _write_cbm_alerts()
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleFResult {
  jobId: string
  job_id?: string
  url?: string
  plan?: string
  role?: string
  feature_flags?: ModuleFFeatureFlags
  compare_visibility_against_competitors?: ModuleFCompareVisibilityAgainstCompetitors
  competitor_wins?: ModuleFCompetitorWins
  gap_analysis?: ModuleFGapOpportunity[]
  gap_opportunities?: ModuleFGapOpportunity[]
  source_analysis?: ModuleFSourceAnalysis
  metric_recommendations?: ModuleFRecommendations
  recommendations?: ModuleFRecommendations
  moat4_recommendations?: Moat4Recommendations
  emerging_trends?: ModuleFEmergingTrends | null
  d7_aivs_output?: D7AivsOutput | null
  alerts?: ModuleFAlert[]
  createdAt?: string
  updatedAt?: string
  created_at?: string
  error?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Trend history types (GET /module-f/jobs/:jobId/trends)
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleFTrendPoint {
  date: string
  jobId: string
  brand: {
    name: string
    visibility_score: number
    market_share_percent: number
    mentions_total: number
    benchmark_score?: number
    share_of_voice?: number
    rank_position?: number
  }
  competitors: Array<{
    name: string
    visibility_score: number
    market_share_percent: number
    mentions_total: number
    benchmark_score?: number
    share_of_voice?: number
    rank_position?: number
  }>
}

export interface ModuleFTrends {
  history: ModuleFTrendPoint[]
  growth_rates: {
    brand_visibility: number
    brand_market_share: number
    competitors: Record<string, { visibility: number; market_share: number }>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API response wrappers
// ─────────────────────────────────────────────────────────────────────────────

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

export interface ModuleFAskAIResult {
  answer: string
  question_type?: string
  sources?: string[]
  recommendation_ids?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
}

export interface ModuleFAskAIResponse {
  success: boolean
  message: string
  data?: ModuleFAskAIResult | null
  error?: string
}

export interface ModuleFAskAIRequestBody {
  question: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

// ─────────────────────────────────────────────────────────────────────────────
// RTK Query endpoints
// ─────────────────────────────────────────────────────────────────────────────

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
    askModuleFAI: builder.mutation<
      ModuleFAskAIResponse,
      { jobId: string; body: ModuleFAskAIRequestBody }
    >({
      query: ({ jobId, body }) => ({
        url: `/module-f/jobs/${jobId}/ask-ai`,
        method: 'POST',
        body,
      }),
    }),
  }),
})

export const {
  useGetModuleFResultQuery,
  useRunModuleFAnalysisMutation,
  useGetModuleFTrendsQuery,
  useAskModuleFAIMutation,
} = moduleFApi

// ─────────────────────────────────────────────────────────────────────────────
// Resolver helpers
//
// Use these in ALL components instead of reading raw keys directly.
// They handle both old (backwards-compat) and new key names, and always
// return a safe default so components never need to null-check at the call site.
// ─────────────────────────────────────────────────────────────────────────────

/** Gap analysis (Screen 5) — handles gap_analysis / gap_opportunities alias */
export function resolveGapAnalysis(
  data: ModuleFResult | null | undefined
): ModuleFGapOpportunity[] {
  return data?.gap_analysis ?? data?.gap_opportunities ?? []
}

/** Metric why+fix recommendations — handles metric_recommendations / recommendations alias */
export function resolveRecommendations(
  data: ModuleFResult | null | undefined
): ModuleFRecommendations {
  return data?.metric_recommendations ?? data?.recommendations ?? {}
}

/** MOAT 4 engine output — returns null when not yet generated */
export function resolveMoat4Recommendations(
  data: ModuleFResult | null | undefined
): Moat4Recommendations | null {
  return data?.moat4_recommendations ?? null
}

/** cbm_alerts — returns empty array when no alerts */
export function resolveAlerts(
  data: ModuleFResult | null | undefined
): ModuleFAlert[] {
  return data?.alerts ?? []
}

/**
 * Normalise a metric recommendation value.
 * The backend can return either { why, fix } or a plain string.
 * Always returns { why, fix } so components can render uniformly.
 */
export function normaliseMetricRec(
  value: ModuleFMetricRecommendation | string | undefined
): ModuleFMetricRecommendation | null {
  if (!value) return null
  if (typeof value === 'string') return { why: '', fix: value }
  if (value.why || value.fix) return value
  return null
}

/** D7 AIVS™ output — returns null when not yet computed */
export function resolveD7Output(
  data: ModuleFResult | null | undefined
): D7AivsOutput | null {
  return data?.d7_aivs_output ?? null
}

const DEFAULT_FLAGS: ModuleFFeatureFlags = {
  max_competitors: 10,
  leaderboard: true,
  model_breakdown_view: true,
  prompt_level_drilldown: true,
  competitor_cited_urls: true,
  gap_opportunities: true,
  trend_chart_days: 90,
  benchmark_score_alerts: true,
  export: true,
}

/** Feature flags for the current plan — falls back to agency-level defaults */
export function resolveFeatureFlags(
  data: ModuleFResult | null | undefined
): ModuleFFeatureFlags {
  return data?.feature_flags ?? DEFAULT_FLAGS
}
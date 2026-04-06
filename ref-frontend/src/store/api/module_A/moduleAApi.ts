import { baseApi } from '../baseApi'

// ── Types ──────────────────────────────────────────────────────────────────

export interface SerpFeature {
  type: string
  present: boolean
  position: number | null
  data: Record<string, any> | null
}

export interface OrganicResult {
  rank_absolute: number
  rank_group: number
  url: string
  domain: string
  title: string
  description: string
  breadcrumb: string
  is_featured_snippet: boolean
}

export interface PaaQuestion {
  question: string
  answer: string | null
  answer_url: string | null
}

export interface AdResult {
  rank_absolute: number
  url: string
  domain: string
  title: string
  description: string
}

export interface KeywordSerpResult {
  keyword: string
  location_code: number
  language_code: string
  device: string
  timestamp: string
  target_rank: number | null
  target_rank_group: number | null
  target_url: string | null
  target_title: string | null
  target_description: string | null
  organic_results: OrganicResult[]
  features: Record<string, SerpFeature>
  paa_questions: PaaQuestion[]
  ad_results: AdResult[]
  competitor_ranks: Record<string, number>
  total_count: number
  items_count: number
  se_results_count: number
}

export interface SerpAnalyzerSummary {
  total_keywords: number
  ranked_keywords: number
  unranked_keywords: number
  avg_rank: number | null
  top3: number
  top10: number
  top20: number
  top100: number
  feature_frequency: Record<string, number>
}

export interface SerpVolatility {
  score: number
  level: 'stable' | 'medium' | 'high'
  rank_std_dev: number
}

export interface ContentGap {
  keyword: string
  target_rank: number | null
  top_ranking_url: string
  top_ranking_domain: string
  has_featured_snippet: boolean
  has_paa: boolean
  paa_questions: string[]
  opportunity_type: 'not_ranking' | 'low_ranking'
}

export interface SerpAnalyzerResult {
  jobId: string
  sessionId: string
  url: string
  target_domain: string
  keywords: string[]
  competitors: string[]
  location_code: number
  language_code: string
  device: string
  timestamp: string
  keyword_results: KeywordSerpResult[]
  summary: SerpAnalyzerSummary
  volatility: SerpVolatility
  content_gaps: ContentGap[]
  updatedAt?: string
}

export interface SerpAnalyzerResponse {
  success: boolean
  message: string
  data: SerpAnalyzerResult | null
}

export interface RunSerpAnalyzerRequest {
  keywords: string[]
  competitors?: string[]
  locationCode?: number
  languageCode?: string
  device?: 'desktop' | 'mobile'
}

export interface RunSerpAnalyzerResponse {
  success: boolean
  message: string
  data?: {
    jobId: string
    status: string
  }
}

export interface KeywordHistoryEntry {
  timestamp: string
  rank: number | null
  jobId: string
}

export interface ModuleAAskAIRequestBody {
  question: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface ModuleAAskAIResult {
  answer: string
  question_type?: string
  sources?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
}

export interface ModuleAAskAIResponse {
  answer?: string
  question_type?: string
  sources?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
  data?: ModuleAAskAIResult | null
  success?: boolean
  message?: string
  error?: string
}

// ── API ────────────────────────────────────────────────────────────────────

export const moduleAApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // GET /module-a/jobs/:jobId
    getSerpResult: builder.query<SerpAnalyzerResponse, string>({
      query: (jobId) => `/module-a/jobs/${jobId}`,
      providesTags: (_r, _e, jobId) => [{ type: 'ModuleA' as const, id: jobId }],
    }),

    // GET /module-a/sessions/:sessionId
    getSessionSerpResults: builder.query<
      { success: boolean; message: string; data: SerpAnalyzerResult[] },
      string
    >({
      query: (sessionId) => `/module-a/sessions/${sessionId}`,
      providesTags: (_r, _e, sessionId) => [{ type: 'ModuleA' as const, id: `session-${sessionId}` }],
    }),

    // GET /module-a/jobs/:jobId/keyword-history?keyword=xxx
    getKeywordHistory: builder.query<
      { success: boolean; message: string; data: KeywordHistoryEntry[] },
      { jobId: string; keyword: string }
    >({
      query: ({ jobId, keyword }) =>
        `/module-a/jobs/${jobId}/keyword-history?keyword=${encodeURIComponent(keyword)}`,
    }),

    // POST /module-a/jobs/:jobId/run
    runSerpAnalyzer: builder.mutation<
      RunSerpAnalyzerResponse,
      { jobId: string; sessionId: string; body: RunSerpAnalyzerRequest }
    >({
      query: ({ jobId, body }) => ({
        url: `/module-a/jobs/${jobId}/run`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { sessionId }) => [
        { type: 'ModuleA' as const, id: `session-${sessionId}` },
      ],
    }),
    askModuleAAI: builder.mutation<
      ModuleAAskAIResponse,
      { jobId: string; body: ModuleAAskAIRequestBody }
    >({
      query: ({ jobId, body }) => ({
        url: `/module-a/jobs/${jobId}/ask-ai`,
        method: 'POST',
        body,
      }),
    }),
    getModuleASuggestedQuestions: builder.query<{ questions?: string[] }, string>({
      query: (jobId) => ({
        url: `/module-a/jobs/${jobId}/ask-ai/suggested-questions`,
        method: 'GET',
      }),
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetSerpResultQuery,
  useGetSessionSerpResultsQuery,
  useGetKeywordHistoryQuery,
  useRunSerpAnalyzerMutation,
  useAskModuleAAIMutation,
  useLazyGetModuleASuggestedQuestionsQuery,
} = moduleAApi

import { baseApi } from '../baseApi'

// ─── New C1-C9 module shape interfaces ─────────────────────────────────────

export interface C5EntityExtraction {
  entities?: Array<{ text: string; label: string; count?: number }>
  topics?: string[]
  visible_text?: string
  word_count?: number
  sentence_count?: number
}

export interface C1AeoChecker {
  llm_friendliness_score?: number
  sub_scores?: {
    crawl_access?: Record<string, any>
    schema?: Record<string, any>
    content?: Record<string, any>
    tech_hygiene?: Record<string, any>
    structure?: Record<string, any>
  }
  entity_ratio?: Record<string, any>
  structured_data?: Record<string, any>
  readability?: Record<string, any>
  page_type?: string
  page_topic?: string
  word_count?: number
}

export interface C3EntityCoverage {
  coverage?: {
    entity_coverage_pct?: number
    matched_count?: number
    expected_count?: number
  }
  missing_entities?: Array<{
    name: string
    type: string
    importance: string
    pages_missing_from?: string[]
  }>
  critical_missing_count?: number
  critical_missing?: Array<{
    name: string
    type: string
    importance: string
    pages_missing_from?: string[]
  }>
  entity_relevance?: any[]
  page_type?: string
  entity_coverage_pct?: number
}

export interface C6MissingInfo {
  missing_entity_count?: number
  missing_fact_count?: number
  total_missing?: number
  missing_facts?: string[]
  present_facts?: string[]
  classification?: {
    critical?: Array<{ name: string; type: string; severity: string }>
    important?: Array<{ name: string; type: string; severity: string }>
    minor?: Array<{ name: string; type: string; severity: string }>
    critical_count?: number
    important_count?: number
    minor_count?: number
  }
  gap?: {
    gap_pct?: number
    risk_level?: string
    total_expected?: number
    total_missing?: number
  }
}

export interface C4AnswerCompleteness {
  completeness_score?: number
  pct_fully_answered?: number
  questions_generated?: number
  fully_answered?: number
  partially_answered?: number
  not_answered?: number
  results?: Array<{
    question: string
    status: string
    evidence: string
  }>
  missing_questions?: string[]
  partial_questions?: string[]
  gaps?: Record<string, string>
}

export interface C7LlmSimulator {
  prompts_used?: string[]
  accuracy?: {
    overall?: number
    per_model?: Record<string, number>
    claims_extracted?: number
  }
  completeness?: {
    overall?: number
    per_model?: Record<string, number>
  }
  consistency?: {
    consistency_score?: number
    pairwise_comparisons?: number
    flag?: string | null
    overall?: number
  }
  model_responses?: Record<string, Array<{
    prompt: string
    success: boolean
    answer_length: number
  }>>
  raw_answers?: Record<string, string[]>
}

export interface C9MultiModel {
  model_friendliness?: {
    per_model?: Record<string, number>
    average?: number
  }
  answer_variation?: {
    variation_score?: number
    avg_similarity?: number
    contradictions?: any[]
  }
  coverage_gaps?: {
    coverage_score?: number
    models_citing?: string[]
    models_not_citing?: string[]
    total_models?: number
  }
  overall?: number
}

export interface C8PageActions {
  total_actions?: number
  high_priority?: number
  medium_priority?: number
  low_priority?: number
  predicted_llm_friendliness_delta?: number
  current_llm_friendliness?: number
  predicted_llm_friendliness?: number
  actions?: Array<{
    action_type: string
    action: string
    category: string
    aivs_dimension: string
    dimension_weight: number
    competitor_has_it: boolean
    priority: string
  }>
}

export interface ModuleCModules {
  entity_extraction?: C5EntityExtraction
  aeo_checker?: C1AeoChecker
  entity_coverage?: C3EntityCoverage
  missing_info?: C6MissingInfo
  answer_completeness?: C4AnswerCompleteness
  bulk_audit?: Record<string, any>
  llm_simulator?: C7LlmSimulator
  multi_model?: C9MultiModel
  page_actions?: C8PageActions
}

export interface ModuleCResult {
  jobId: string
  url: string
  domain?: string
  industry?: string
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

export interface ModuleFieldResponse<T> {
  success: boolean
  message: string
  data?: {
    jobId: string
    url: string
    data: T | null
    timestamp: string
  }
}

export interface ModuleSummaryResponse {
  success: boolean
  message: string
  data?: {
    jobId: string
    url: string
    domain: string | null
    industry: string | null
    overall_score: number
    module_scores: {
      aeo_checker: number | null
      entity_coverage: number | null
      answer_completeness: number | null
      llm_simulator: number | null
      multi_model: number | null
    }
    c8_page_actions: {
      total_actions: number
      priority_breakdown: { high?: number; medium?: number; low?: number }
      current_score: number | null
      predicted_score: number | null
      improvement: number
    }
    timestamp: string
  }
}

export interface AIVisibilityIssue {
  title: string
  severity: 'High' | 'Medium' | 'Low'
  field: string
  explanation: string
}

export interface AIVisibilityRecommendation {
  issue: string
  why_it_matters: string
  how_to_fix: string
  example_fix: string | null
}

export interface AIVisibilityReport {
  summary: string
  issues: AIVisibilityIssue[]
  recommendations: AIVisibilityRecommendation[]
  positive_signals: string[]
  ai_readability: string
  priority_fixes: string[]
  estimated_impact: string
}

export interface AIVisibilityReportResponse {
  success: boolean
  message: string
  data?: {
    jobId: string
    url: string
    data: AIVisibilityReport | null
    timestamp: string
  } | null
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

    // ===== New C1-C9 Submodule Field Endpoints =====

    // C5 — Entity Extraction
    getC5EntityExtraction: builder.query<ModuleFieldResponse<C5EntityExtraction>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c5`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c5-${jobId}` }],
    }),

    // C1 — AEO Checker (LLM-friendliness score)
    getC1AeoChecker: builder.query<ModuleFieldResponse<C1AeoChecker>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c1`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c1-${jobId}` }],
    }),

    // C3 — Entity Coverage Audit
    getC3EntityCoverage: builder.query<ModuleFieldResponse<C3EntityCoverage>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c3`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c3-${jobId}` }],
    }),

    // C6 — Missing Information
    getC6MissingInfo: builder.query<ModuleFieldResponse<C6MissingInfo>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c6`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c6-${jobId}` }],
    }),

    // C4 — Answer Completeness
    getC4AnswerCompleteness: builder.query<ModuleFieldResponse<C4AnswerCompleteness>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c4`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c4-${jobId}` }],
    }),

    // C2 — Bulk Audit
    getC2BulkAudit: builder.query<ModuleFieldResponse<Record<string, any>>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c2`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c2-${jobId}` }],
    }),

    // C7 — LLM Simulator
    getC7LlmSimulator: builder.query<ModuleFieldResponse<C7LlmSimulator>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c7`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c7-${jobId}` }],
    }),

    // C9 — Multi-Model Insights
    getC9MultiModel: builder.query<ModuleFieldResponse<C9MultiModel>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c9`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c9-${jobId}` }],
    }),

    // C8 — Page Actions
    getC8PageActions: builder.query<ModuleFieldResponse<C8PageActions>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/c8`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `c8-${jobId}` }],
    }),

    // Get Summary (overall score + all module scores)
    getModuleSummary: builder.query<ModuleSummaryResponse, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/summary`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `summary-${jobId}` }],
    }),

    // Get AI Visibility Report
    getVisibilityReport: builder.query<AIVisibilityReportResponse, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/visibility-report`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `visibility-report-${jobId}` }],
    }),
  }),
})

export const {
  useGetModuleCResultQuery,
  useGetAllModuleCResultsQuery,
  useGetSessionModuleCResultsQuery,
  useRunModuleCAnalysisMutation,
  // New C1-C9 submodule hooks
  useGetC5EntityExtractionQuery,
  useGetC1AeoCheckerQuery,
  useGetC3EntityCoverageQuery,
  useGetC6MissingInfoQuery,
  useGetC4AnswerCompletenessQuery,
  useGetC2BulkAuditQuery,
  useGetC7LlmSimulatorQuery,
  useGetC9MultiModelQuery,
  useGetC8PageActionsQuery,
  // Summary & report
  useGetModuleSummaryQuery,
  useGetVisibilityReportQuery,
} = moduleCApi

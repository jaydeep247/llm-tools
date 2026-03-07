import { baseApi } from '../baseApi'

export interface ModuleCModules {
  ai_presence?: {
    score: number
    robots_checks?: {
      robots_gptbot?: boolean
      robots_google_extended?: boolean
      robots_claudebot?: boolean
      sitemap_present?: boolean
    }
    content_checks?: {
      org_schema_present?: boolean
      org_logo_present?: boolean
      sameas_wikidata_or_wikipedia?: boolean
      sameas_major_profiles_count?: number
      open_graph_present?: boolean
      twitter_card_present?: boolean
    }
    ai_understanding?: Record<string, {
      score?: number
      understanding_level?: string
      error?: string
      recommendations?: Array<{ action: string; priority: string; impact: number }>
    }>
    multi_model_consensus?: {
      consistency_score?: number
      variation_rating?: string
      variance?: number
    }
    recommendations?: Array<{ action: string; priority: string; impact: number }>
  }
  answerability?: {
    score: number
    completeness_score?: number
    depth_score?: number
    breadth_score?: number
    readability_score?: number
    metrics?: {
      question_count?: number
      answer_count?: number
      qa_balance?: number
      percent_questions_answered?: number
    }
    multi_model_scores?: Record<string, number>
    ai_analysis?: {
      ai_answerability_score?: number
      percent_questions_answered?: number
      answered_questions?: string[]
      missing_answers_gaps?: string[]
      missing_aspects?: string[]
      recommendations?: Array<{ action: string; priority: string; impact: number }>
    }
    recommendations?: string[]
  }
  knowledge_base?: {
    score: number
    fact_density?: number
    entity_coverage?: {
      topic?: string
      coverage_score?: number
      relevance_explanation?: string
      entites_analysis?: Array<{
        entity: string
        type: string
        relevance_score: number
        status: string
        importance: string
      }>
      found_entities?: string[]
      missing_entities?: string[]
      critical_entities_count?: number
      minor_entities_count?: number
      gap_percentage?: number
      recommendations?: Array<{ action: string; priority: string; impact: number }>
    }
  }
  llm_simulator?: {
    query?: string
    simulations?: Record<string, {
      answer?: string
      accuracy_score?: number
      completeness_score?: number
      eval_explanation?: string
    }>
    cross_model_metrics?: {
      consistency_score?: number
      variation_analysis?: {
        outcome_level?: { agreement?: string; score?: number; note?: string }
        reasoning_level?: { similarity?: number; approach?: string }
        specificity_level?: { depth_score?: number; completeness_score?: number }
        tone_analysis?: { confidence?: string; risk_posture?: string }
      }
      coverage_gaps?: (string | { type?: string; description?: string; missing_from?: string[]; present_in?: string[]; severity?: string })[]
      model_scores?: Record<string, { agreement?: number; depth?: number; overall?: number }>
    }
  }
  multi_model_insights?: {
    agreement?: Record<string, unknown>
    claim_matrix?: unknown[]
    coverage_gaps?: (string | { type?: string; description?: string; missing_from?: string[]; present_in?: string[]; severity?: string })[]
    scores?: Record<string, { agreement?: number; depth?: number; overall?: number }>
  }
  actionable_insights?: {
    totalActions?: number
    priorityBreakdown?: { high?: number; medium?: number; low?: number }
    currentScore?: number
    predictedScore?: number
    improvement?: number
    actions?: Array<{
      id: string
      type: string
      description: string
      priority: string
      impact: number
      category: string
    }>
  }
}

export interface ModuleCResult {
  jobId: string
  url: string
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
    overall_score: number
    module_scores: {
      ai_presence: number | null
      answerability: number | null
      knowledge_base: number | null
      llm_simulator: number | null
    }
    actionable_insights: {
      total_actions: number
      priority_breakdown: { high?: number; medium?: number; low?: number }
      current_score: number | null
      predicted_score: number | null
      improvement: number
    }
    timestamp: string
  }
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

    // ===== Individual Module Field Endpoints =====
    
    // Get AI Presence module data
    getAiPresence: builder.query<ModuleFieldResponse<ModuleCModules['ai_presence']>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/ai-presence`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `ai-presence-${jobId}` }],
    }),

    // Get Answerability module data
    getAnswerability: builder.query<ModuleFieldResponse<ModuleCModules['answerability']>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/answerability`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `answerability-${jobId}` }],
    }),

    // Get Knowledge Base module data
    getKnowledgeBase: builder.query<ModuleFieldResponse<ModuleCModules['knowledge_base']>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/knowledge-base`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `knowledge-base-${jobId}` }],
    }),

    // Get LLM Simulator module data
    getLlmSimulator: builder.query<ModuleFieldResponse<ModuleCModules['llm_simulator']>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/llm-simulator`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `llm-simulator-${jobId}` }],
    }),

    // Get Multi-Model Insights module data
    getMultiModelInsights: builder.query<ModuleFieldResponse<ModuleCModules['multi_model_insights']>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/multi-model-insights`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `multi-model-${jobId}` }],
    }),

    // Get Actionable Insights module data
    getActionableInsights: builder.query<ModuleFieldResponse<ModuleCModules['actionable_insights']>, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/actionable-insights`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `actionable-${jobId}` }],
    }),

    // Get Summary (overall score + all module scores)
    getModuleSummary: builder.query<ModuleSummaryResponse, string>({
      query: (jobId) => `/module-c/jobs/${jobId}/summary`,
      providesTags: (_result, _error, jobId) => [{ type: 'ModuleC' as const, id: `summary-${jobId}` }],
    }),
  }),
})

export const {
  useGetModuleCResultQuery,
  useGetAllModuleCResultsQuery,
  useGetSessionModuleCResultsQuery,
  useRunModuleCAnalysisMutation,
  // Individual module hooks
  useGetAiPresenceQuery,
  useGetAnswerabilityQuery,
  useGetKnowledgeBaseQuery,
  useGetLlmSimulatorQuery,
  useGetMultiModelInsightsQuery,
  useGetActionableInsightsQuery,
  useGetModuleSummaryQuery,
} = moduleCApi

import { baseApi } from '../baseApi'

export interface ModuleBAskAIRequestBody {
  question: string
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface ModuleBAskAIResult {
  answer: string
  question_type?: string
  sources?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
}

export interface ModuleBAskAIResponse {
  answer?: string
  question_type?: string
  sources?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
  data?: ModuleBAskAIResult | null
  success?: boolean
  message?: string
  error?: string
}

export const moduleBApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    askModuleBAI: builder.mutation<
      ModuleBAskAIResponse,
      { jobId: string; body: ModuleBAskAIRequestBody }
    >({
      query: ({ jobId, body }) => ({
        url: `/module-b/jobs/${jobId}/ask-ai`,
        method: 'POST',
        body,
      }),
    }),
    getModuleBSuggestedQuestions: builder.query<{ questions?: string[] }, string>({
      query: (jobId) => ({
        url: `/module-b/jobs/${jobId}/ask-ai/suggested-questions`,
        method: 'GET',
      }),
    }),
  }),
  overrideExisting: false,
})

export const {
  useAskModuleBAIMutation,
  useLazyGetModuleBSuggestedQuestionsQuery,
} = moduleBApi

import { baseApi } from '../baseApi'

export interface ModuleDAskAIRequestBody {
  project_id: string
  question: string
  job_id?: string
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface ModuleDAskAIResult {
  answer: string
  question_type?: string
  sources?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
}

export interface ModuleDAskAIResponse {
  answer?: string
  question_type?: string
  sources?: string[]
  data_available?: boolean
  context_snapshot?: Record<string, unknown>
  data?: ModuleDAskAIResult | null
  success?: boolean
  message?: string
  error?: string
}

export interface ModuleDSuggestedQuestionsResponse {
  questions?: string[]
}

export const moduleDApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    askModuleDAI: builder.mutation<ModuleDAskAIResponse, ModuleDAskAIRequestBody>({
      query: (body) => ({
        url: '/module-d/ask-ai',
        method: 'POST',
        body,
      }),
    }),
    getModuleDSuggestedQuestions: builder.mutation<ModuleDSuggestedQuestionsResponse, { project_id: string }>({
      query: (body) => ({
        url: '/module-d/ask-ai/suggested-questions',
        method: 'POST',
        body,
      }),
    }),
  }),
})

export const { useAskModuleDAIMutation, useGetModuleDSuggestedQuestionsMutation } = moduleDApi

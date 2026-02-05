import { baseApi } from '../baseApi';

export interface AnswerCompletenessRequest {
  sessionId: number;
}

export interface AnswerCompletenessResponse {
  success: boolean;
  data?: {
    overall_score: number;
    completeness_percentage: number;
    key_aspects_covered: string[];
    missing_aspects: string[];
    depth_score?: number;
    breadth_score?: number;
    relevance_score?: number;
    recommendations?: string[];
  };
  error?: string;
}

export const answerCompletenessApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAnswerCompleteness: builder.query<AnswerCompletenessResponse, number>({
      query: (sessionId) => `/api/answer-completeness/${sessionId}`,
      providesTags: (result, error, sessionId) => [{ type: 'AnswerCompleteness', id: sessionId }],
    }),
  }),
});

export const {
  useGetAnswerCompletenessQuery,
  useLazyGetAnswerCompletenessQuery,
} = answerCompletenessApi;

import { baseApi } from '../baseApi';

export interface LLMAnswer {
  query: string;
  answer: string;
  confidence: number;
  sources: string[];
  timestamp: string;
}

export interface SimulatorMetrics {
  totalQueries: number;
  averageConfidence: number;
  sourceCoverage: number;
  answerQuality: number;
  recentAnswers: LLMAnswer[];
  overallScore: number;
}

export interface SimulateQueryRequest {
  query: string;
  content: string;
  sessionId?: number;
}

export interface SimulateQueryResponse {
  success: boolean;
  data?: LLMAnswer;
  error?: string;
}

export interface AnalyzeContentRequest {
  content: string;
  queries?: string[];
}

export interface AnalyzeContentResponse {
  success: boolean;
  data?: SimulatorMetrics;
  error?: string;
}

export interface GetSimulatorResultsRequest {
  sessionId: number;
}

export interface GetSimulatorResultsResponse {
  url: any;
  session: any;
  statistics: any;
  totalPages: any;
  logs: boolean;
  results: GetSimulatorResultsResponse;
  success: boolean;
  data?: SimulatorMetrics;
  error?: string;
}

export interface SimulatorStatsResponse {
  success: boolean;
  data?: {
    totalSimulations: number;
    averageResponseTime: number;
    topQueries: { query: string; count: number }[];
  };
  error?: string;
}

export interface FetchUrlContentRequest {
  url: string;
}

export interface FetchUrlContentResponse {
  success: boolean;
  content?: string;
  title?: string;
  error?: string;
}

const getAuthToken = (): string => {
  const token = localStorage.getItem('authToken') || 
                sessionStorage.getItem('authToken') || 
                (window as any).__AUTH_TOKEN || 
                '';
  return token;
};

export const llmAnswerSimulatorApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    simulateQuery: builder.mutation<SimulateQueryResponse, SimulateQueryRequest>({
      query: (body) => ({
        url: '/api/llm-answer-simulator/simulate',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body,
      }),
    }),
    analyzeContent: builder.mutation<AnalyzeContentResponse, AnalyzeContentRequest>({
      query: (body) => ({
        url: '/api/llm-answer-simulator/analyze',
        method: 'POST',
        body,
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      }),
    }),
    getSimulatorResults: builder.query<GetSimulatorResultsResponse, number>({
      query: (sessionId) => ({
        url: `/api/llm-answer-simulator/results/${sessionId}`,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      }),
    }),
    getSimulatorStats: builder.query<SimulatorStatsResponse, void>({
      query: () => ({
        url: '/api/llm-answer-simulator/stats',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      }),
    }),
    fetchUrlContent: builder.mutation<FetchUrlContentResponse, FetchUrlContentRequest>({
      query: (body) => ({
        url: '/api/llm-answer-simulator/fetch-url',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body,
      }),
    }),
  }),
});

export const {
  useSimulateQueryMutation,
  useAnalyzeContentMutation,
  useGetSimulatorResultsQuery,
  useGetSimulatorStatsQuery,
  useFetchUrlContentMutation,
} = llmAnswerSimulatorApi;
export interface AnswerCompletenessData {
  overall_score: number;
  completeness_percentage: number;
  key_aspects_covered: string[];
  missing_aspects: string[];
  depth_score?: number;
  breadth_score?: number;
  relevance_score?: number;
  recommendations?: string[];
}

import { baseApi } from '../baseApi';

export interface AnalyzeRequest {
  url: string;
  sessionId?: number;
}

export interface AnalyzeResponse {
  success: boolean;
  results?: any;
  error?: string;
}

export interface AnalyzeBulkRequest {
  sitemap?: string;
  urls?: string[];
}

export interface AnalyzeBulkResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export interface SimulateAnswerRequest {
  url: string;
  query: string;
}

export interface SimulateAnswerResponse {
  success: boolean;
  results?: any;
  error?: string;
}

export interface WebsiteScoreRequest {
  url: string;
  sessionId?: number;
}

export interface WebsiteScoreResponse {
  success: boolean;
  scores?: any;
  error?: string;
}

export interface GenerateSchemaRequest {
  url: string;
  content?: string;
  schema_type?: string;
}

export interface GenerateSchemaResponse {
  success: boolean;
  schema?: any;
  results?: any;
  error?: string;
}

export interface CompetitorMentionsRequest {
  url: string;
  sessionId?: number;
}

export interface CompetitorMentionsResponse {
  success: boolean;
  data?: any;
  error?: string;
}

export const aeoApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    analyze: builder.mutation<AnalyzeResponse, AnalyzeRequest>({
      query: (data) => ({
        url: '/api/aeo/analyze',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['AEO'],
    }),
    getAnswerCompleteness: builder.query<AnswerCompletenessData | null, number>({
      query: (sessionId) => `/api/aeo/results/${sessionId}`,
      transformResponse: (response: AnalyzeResponse) => {
        // Extract answerCompletenessData from detailed_analysis
        const completeness = response?.results?.detailed_analysis?.answer_completeness;
        if (!completeness) return null;
        return {
          overall_score: Math.round(completeness.overall_score || 0),
          completeness_percentage: Math.round(completeness.completeness_percentage || 0),
          key_aspects_covered: completeness.key_aspects_covered || [],
          missing_aspects: completeness.missing_aspects || [],
          depth_score: Math.round(completeness.depth_score || 0),
          breadth_score: Math.round(completeness.breadth_score || 0),
          relevance_score: Math.round(completeness.relevance_score || 0),
          recommendations: completeness.recommendations || []
        };
      },
      providesTags: (result, error, sessionId) => [{ type: 'AEO', id: sessionId }],
    }),
    analyzeBulk: builder.mutation<AnalyzeBulkResponse, AnalyzeBulkRequest>({
      query: (data) => ({
        url: '/api/aeo/analyze-bulk',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['AEO'],
    }),
    simulateAnswer: builder.mutation<SimulateAnswerResponse, SimulateAnswerRequest>({
      query: (data) => ({
        url: '/api/aeo/simulate-answer',
        method: 'POST',
        body: data,
      }),
    }),
    getWebsiteScore: builder.query<WebsiteScoreResponse, WebsiteScoreRequest>({
      query: (params) => ({
        url: '/api/aeo/website-score',
        method: 'POST',
        body: params,
      }),
      providesTags: ['AEO'],
    }),
    getAeoResults: builder.query<AnalyzeResponse, number>({
      query: (sessionId) => `/api/aeo/results/${sessionId}`,
      providesTags: (result, error, sessionId) => [{ type: 'AEO', id: sessionId }],
    }),
    generateSchema: builder.mutation<GenerateSchemaResponse, GenerateSchemaRequest>({
      query: (data) => ({
        url: '/api/aeo/generate-schema',
        method: 'POST',
        body: data,
      }),
    }),
    analyzeCompetitorMentions: builder.mutation<CompetitorMentionsResponse, CompetitorMentionsRequest>({
      query: (data) => ({
        url: '/api/aeo/analyze-competitors-mentions',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['AEO'],
    }),
  }),
});

export const {
  useAnalyzeMutation,
  useAnalyzeBulkMutation,
  useSimulateAnswerMutation,
  useGetWebsiteScoreQuery,
  useLazyGetWebsiteScoreQuery,
  useGetAeoResultsQuery,
  useLazyGetAeoResultsQuery,
  useGetAnswerCompletenessQuery,
  useGenerateSchemaMutation,
  useAnalyzeCompetitorMentionsMutation,
} = aeoApi;

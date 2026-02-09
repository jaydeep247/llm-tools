import { baseApi } from '../baseApi';

export interface AnalyzeRequest {
  url: string;
  sessionId?: number;
}

export interface AnalyzeResponse {
  session: any;
  statistics: any;
  data: never[];
  totalPages: any;
  logs: boolean;
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
}

export interface GenerateSchemaResponse {
  success: boolean;
  schema?: any;
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
  useGenerateSchemaMutation,
  useAnalyzeCompetitorMentionsMutation,
} = aeoApi;

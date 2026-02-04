import { baseApi } from '../baseApi';

export interface EntityData {
  text: string;
  type: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export interface EntityMetrics {
  totalEntitiesDetected: number;
  entityTypes: {
    Person: number;
    Product: number;
    Location: number;
    Concept: number;
  };
  missingExpectedEntities: string[];
  extractedEntities: EntityData[];
  overallScore: number;
}

export interface ExtractEntitiesRequest {
  content: string;
  expectedEntities?: string[];
  sessionId?: number;
}

export interface ExtractEntitiesResponse {
  success: boolean;
  data?: EntityMetrics;
  error?: string;
}

export interface AnalyzeUrlRequest {
  url: string;
  expectedEntities?: string[];
}

export interface AnalyzeUrlResponse {
  success: boolean;
  data?: EntityMetrics;
  error?: string;
}

export interface GetSessionResultsResponse {
  success: boolean;
  data?: EntityMetrics;
  error?: string;
}

export interface GetStatsResponse {
  success: boolean;
  data?: {
    totalAnalyses: number;
    averageEntitiesPerAnalysis: number;
    mostCommonEntityType: string;
    averageScore: number;
    topEntities: Array<{
      text: string;
      type: string;
      frequency: number;
    }>;
  };
  error?: string;
}

export const entityExtractorApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    extractEntities: builder.mutation<ExtractEntitiesResponse, ExtractEntitiesRequest>({
      query: (data) => ({
        url: '/api/entity-extractor/extract',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Data'],
    }),
    analyzeEntityUrl: builder.mutation<AnalyzeUrlResponse, AnalyzeUrlRequest>({
      query: (data) => ({
        url: '/api/entity-extractor/analyze-url',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Data'],
    }),
    getSessionEntityResults: builder.query<GetSessionResultsResponse, number>({
      query: (sessionId) => `/api/entity-extractor/session/${sessionId}`,
      providesTags: (result, error, sessionId) => [{ type: 'Data', id: sessionId }],
    }),
    getEntityStats: builder.query<GetStatsResponse, void>({
      query: () => '/api/entity-extractor/stats',
      providesTags: ['Data'],
    }),
  }),
});

export const {
  useExtractEntitiesMutation,
  useAnalyzeEntityUrlMutation,
  useGetSessionEntityResultsQuery,
  useLazyGetSessionEntityResultsQuery,
  useGetEntityStatsQuery,
} = entityExtractorApi;
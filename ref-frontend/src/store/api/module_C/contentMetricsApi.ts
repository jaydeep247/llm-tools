import { baseApi } from '../baseApi';

export interface ContentMetricsRequest {
  sessionId: number;
}

export interface ContentMetricsResponse {
  success: boolean;
  data?: {
    content_metrics?: {
      content_type_accuracy: number;
      prompt_intent_match: number;
      visibility_impact: number;
      suggested_content_type: string;
      prompt_intent_details?: {
        matched_intents: string[];
        confidence: number;
        search_queries?: string[];
        intent_clusters?: {
          informational?: { prompt_count: number; example_prompts?: string[] };
          commercial?: { prompt_count: number; example_prompts?: string[] };
          comparative?: { prompt_count: number; example_prompts?: string[] };
          transactional?: { prompt_count: number; example_prompts?: string[] };
          agent_style?: { prompt_count: number; example_prompts?: string[] };
        };
        cluster_metrics?: {
          total_prompts: number;
          categorized_prompts: number;
          coverage_percentage: number;
          clustering_accuracy: number;
        };
      };
      visibility_factors?: {
        factors: string[];
        score_breakdown?: Record<string, number>;
        recommendations?: string[];
      };
    };
    entity_metrics?: {
      entities_detected_count: number;
      entity_coverage_score: number;
      entity_relevance_score: number;
      entity_relevance_details?: {
        relevance_explanation?: string;
        relevant_entities?: string[];
        irrelevant_entities?: string[];
      };
    };
  };
  error?: string;
}

export const contentMetricsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getContentMetrics: builder.query<ContentMetricsResponse, number>({
      query: (sessionId) => `/api/aeo/content-metrics/${sessionId}`,
      providesTags: (result, error, sessionId) => [{ type: 'ContentMetrics', id: sessionId }],
    }),
  }),
});

export const {
  useGetContentMetricsQuery,
  useLazyGetContentMetricsQuery,
} = contentMetricsApi;

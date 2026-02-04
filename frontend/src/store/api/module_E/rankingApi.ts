import { baseApi } from '../baseApi';

export interface RankingAnalysisRequest {
  url: string;
  prompts?: string[];
  sessionId?: number;
  location?: string;
  topicOverride?: string;
}

export interface RankingPositionItem {
  prompt: string;
  model: string;
  position: number | null;
  total_cited: number;
  percentile: number | null;
  source_diversity?: number;
  credibility_score?: number;
  content_quality_score?: number;
}

export interface ModelWiseRow {
  prompt: string;
  chat_gpt?: number | null;
  claude?: number | null;
  gemini?: number | null;
  perplexity?: number | null;
}

export interface EntityCoverage {
  score: number;
  found_entities: string[];
  missing_entities: string[];
  total_expected: number;
}

export interface ContentQuality {
  overall_score: number;
  by_prompt_model: Record<string, Record<string, number>>;
}

export interface RankingAnalysisResponse {
  success: boolean;
  url?: string;
  ranking_position_per_prompt?: RankingPositionItem[];
  percentile_by_prompt?: Record<string, Record<string, number | null>>;
  model_wise_comparison?: ModelWiseRow[];
  content_quality?: ContentQuality;
  entity_coverage?: EntityCoverage;
  errors?: string[] | null;
  error?: string;
  generated_prompts?: string[] | null;
}

export const rankingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    runRankingAnalysis: builder.mutation<
      RankingAnalysisResponse,
      RankingAnalysisRequest
    >({
      query: (data) => ({
        url: '/api/aeo/ranking-analysis',
        method: 'POST',
        body: data,
      }),
    }),
  }),
});

export const { useRunRankingAnalysisMutation } = rankingApi;

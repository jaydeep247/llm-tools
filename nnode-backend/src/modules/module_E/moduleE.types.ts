export interface ModuleEResult {
  jobId: string;
  content_consistency?: {
    score?: number;
    mandate?: {
      topic?: string;
      audience?: string;
      tone?: string;
      url?: string;
      location?: string;
    };
    batch_scores?: number[];
  };
  entity_coverage?: {
    score?: number;
    expected?: string[];
    observed?: string[];
    missing?: string[];
    found?: string[];
    total_expected?: number;
  };
  brand_analysis?: {
    brand_name?: string;
    total_mentions?: number;
    sentiment?: {
      counts?: {
        positive?: number;
        negative?: number;
        neutral?: number;
      };
      label?: string;
    };
    frequency_trend?: Array<{
      date?: string;
      count?: number;
    }>;
    top_sources?: Array<{
      domain?: string;
    }>;
  };
  sentiment_tracking?: {
    brand_name: string;
    industry: string;
    service_type: string;
    sentiment: {
      overall_score: number;
      distribution: {
        Positive: number;
        Neutral: number;
        Negative: number;
      };
      by_model: Record<
        string,
        {
          score: number;
          distribution: {
            Positive: number;
            Neutral: number;
            Negative: number;
          };
        }
      >;
    };
    visibility: {
      overall_visibility_score: number;
      overall_appearance_rate: number;
      by_model: Record<
        string,
        {
          visibility_score: number;
          appearance_rate: number;
          appearances: number;
          total_prompts: number;
          avg_position_weight?: number;
        }
      >;
    };
    timestamp: string;
  };
  score_history?: Array<{
    date: string;
    sentimentScore: number;
    visibilityScore: number;
  }>;

  competitor_mentions?: {
    overall_sov: number;
    data: Array<{
      name: string;
      mentions: number;
      sentiment: string;
      trend: number[];
    }>;
  };
  ai_share_of_voice?: {
    overall_sov: number;
    by_model: Record<
      string,
      {
        sov: number;
        brand_mentions: number;
        competitor_mentions: number;
      }
    >;
  };
  ai_sov_history?: Array<{
    date: string;
    overall_sov: number;
    by_model: Record<
      string,
      {
        sov: number;
        brand_mentions: number;
        competitor_mentions: number;
      }
    >;
  }>;
  ranking_analysis?: RankingAnalysisResult;
  createdAt?: string;
  updatedAt?: string;
}

export interface RankingAnalysisResult {
  ranking_position_per_prompt: Array<{
    prompt: string;
    model: string;
    position: number | null;
      total_cited: number;
      source_diversity: number;
      credibility_score: number;
      percentile: number;
      content_quality_score: number;
      accuracy_score?: number;
      sentiment_score?: number;
    }>;
    percentile_by_prompt: Record<string, Record<string, number>>;
  model_wise_comparison: Array<{ prompt: string;[model: string]: number | string | null }>;
  content_quality: {
    overall_score: number;
    by_prompt_model: Record<string, Record<string, number>>;
  };
  entity_coverage: {
    score: number;
    found_entities: string[];
    missing_entities: string[];
    total_expected: number;
  };
  generated_prompts: string[];
}

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
  createdAt?: string;
}

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
  master_analysis?: {
    mandate?: {
      topic?: string;
      audience?: string;
      tone?: string;
      brand_name?: string;
      location?: string;
    };
    expected_entities?: string[];
    models?: Array<{
      model: string;
      accuracy_of_generated_response: number;
      content_consistency: {
        score: number;
        topic_density?: number;
        audience_density?: number;
        brand_density?: number;
        mandate?: {
          topic?: string;
          audience?: string;
          tone?: string;
          brand_name?: string;
          location?: string;
        };
      };
      entity_coverage: {
        score: number;
        expected: string[];
        observed: string[];
        found: string[];
        missing: string[];
        total_expected: number;
      };
      completeness_score: number;
      model_wise_performance_score: number;
    }>;
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
      url?: string;
      title?: string;
      snippet?: string;
      mention_count?: number;
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
    visibility_tier?: string;
    brand_known_by_models?: string[];
    brand_terms_checked?: string[];
    by_model: Record<
      string,
      {
        sov: number;
        brand_mentions: number;
        competitor_mentions: number;
        brand_known?: boolean;
      }
    >;
  };
  ai_sov_history?: Array<{
    date: string;
    overall_sov: number;
    visibility_tier?: string;
    brand_known_by_models?: string[];
    by_model: Record<
      string,
      {
        sov: number;
        brand_mentions: number;
        competitor_mentions: number;
        brand_known?: boolean;
      }
    >;
  }>;
  ranking_analysis?: RankingAnalysisResult;

  /** Recommendations for the Tracked Prompts section */
  tracked_prompts_recommendations?: ModuleERecommendationBlock;

  /** Recommendations for the Citations Tracker section */
  citations_recommendations?: ModuleERecommendationBlock;

  /** Recommendations for the Share of Voice section */
  sov_recommendations?: ModuleERecommendationBlock;

  createdAt?: string;
  updatedAt?: string;
}

/** A single actionable improvement recommendation */
export interface ModuleERecommendation {
  priority: number;
  category: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  issue: string;
  fix: string;
  impact: string;
  fields_affected: string[];
}

/** The full recommendation block returned for a section */
export interface ModuleERecommendationBlock {
  recommendations: ModuleERecommendation[];
  health_score: number;
  summary: string;
}

export interface RankingAnalysisResult {
  ranking_position_per_prompt: Array<{
    prompt: string;
    model: string;
    position: number | null;
    total_cited: number;
    citation_count?: number;
    total_citations?: number;
    source_diversity: number;
    credibility_score: number;
    percentile: number | null;
    content_quality_score: number;
    accuracy_score?: number;
    sentiment_score?: number;
    brand_text_mentioned?: boolean;
    citation_matched?: boolean;
    mention_status?: 'Cited' | 'Mentioned (No Link)' | 'Not Mentioned';
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

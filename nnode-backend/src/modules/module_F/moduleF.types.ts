export interface ModuleFCompareVisibilityAgainstCompetitors {
  brand?: {
    name: string;
    visibility_score: number;
    rank_difference_vs_brand?: number | null;
    market_share_percent: number;
    mentions_total: number;
    mentioned_in_models: number;
    avg_rank?: number | null;
    avg_rank_percentile: number;
    per_model: Record<
      string,
      {
        mentions: number;
        rank?: number | null;
        rank_percentile?: number | null;
        first_position?: number | null;
      }
    >;
  } | null;
  competitors?: Array<{
    name: string;
    visibility_score: number;
    rank_difference_vs_brand?: number | null;
    market_share_percent: number;
    mentions_total: number;
    mentioned_in_models: number;
    avg_rank?: number | null;
    avg_rank_percentile: number;
    per_model: Record<
      string,
      {
        mentions: number;
        rank?: number | null;
        rank_percentile?: number | null;
        first_position?: number | null;
      }
    >;
  }>;
  topic?: string;
  models?: string[];
  model_errors?: Record<string, string>;
  error?: string;
}

export interface ModuleFCompetitorWins {
  summary: {
    total_prompts: number;
    brand_wins: number;
    competitor_wins: number;
    brand_win_rate: number;
    competitor_win_rate: number;
    avg_content_gap_score: number;
  };
  detailed_results: Array<{
    prompt: string;
    winner: 'brand' | 'competitor' | 'none' | 'unknown';
    winner_name?: string | null;
    brand_rank?: number | null;
    ranks: Record<string, number>;
    text_snippet: string;
    coverage_gap_score: number;
  }>;
}

export interface ModuleFGapOpportunity {
  competitor: string;
  gapScore: number;
  missingPrompts: number;
  potentialGainPercent: number;
  opportunities: Array<{
    prompt: string;
    rank: number | null;
    opportunityScore: number;
  }>;
}

export interface ModuleFSourceAnalysis {
  competitor_source_analysis: Array<{
    competitor: string;
    source_domain_influence_score: number;
    average_domain_authority: number;
    citation_count: number;
    top_citations: Array<{
      domain: string;
      authority_score: number;
      citation_type?: string;
    }>;
  }>;
}

export interface ModuleFMetricRecommendation {
  why: string;
  fix: string;
}

export interface ModuleFEmergingTrends {
  competitor_changes: Array<{
    name: string;
    delta_visibility: number;
    delta_market_share: number;
    status: 'rising' | 'falling' | 'new' | 'missing' | 'stable';
  }>;
  prompt_swings: Array<{
    prompt: string;
    from: string;
    to: string;
  }>;
  model_targeting?: Record<string, string[]>;
  summary?: {
    trends_detected: number;
    avg_visibility_delta: number;
    new_prompts: number;
    threat_level: 'low' | 'medium' | 'high';
  };
}

export interface ModuleFResult {
  jobId: string;
  url?: string;
  compare_visibility_against_competitors?: ModuleFCompareVisibilityAgainstCompetitors;
  competitor_wins?: ModuleFCompetitorWins;
  gap_opportunities?: ModuleFGapOpportunity[];
  source_analysis?: ModuleFSourceAnalysis;
  recommendations?: Record<string, string | ModuleFMetricRecommendation>;
  emerging_trends?: ModuleFEmergingTrends | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModuleFTrendPoint {
  date: string;
  jobId: string;
  brand: {
    name: string;
    visibility_score: number;
    market_share_percent: number;
    mentions_total: number;
  };
  competitors: Array<{
    name: string;
    visibility_score: number;
    market_share_percent: number;
    mentions_total: number;
  }>;
}

export interface ModuleFTrends {
  history: ModuleFTrendPoint[];
  growth_rates: {
    brand_visibility: number; // Percentage change vs previous run
    brand_market_share: number; // Absolute change vs previous run
    competitors: Record<string, {
      visibility: number;
      market_share: number;
    }>;
  };
}


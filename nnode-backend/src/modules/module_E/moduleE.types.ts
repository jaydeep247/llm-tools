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
  createdAt?: string;
}

export interface ModuleEResult {
  jobId: string;
  url: string;
  content_consistency?: {
    score?: number;
    mandate?: {
      topic?: string;
      audience?: string;
      tone?: string;
      brand_name?: string;
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
  createdAt?: string;
}

export interface ModuleCResult {
  jobId: string;
  url: string;
  domain?: string;
  industry?: string;
  timestamp: Date;
  overall_score: number;
  modules: {
    entity_extraction?: Record<string, any>;
    aeo_checker?: Record<string, any>;
    entity_coverage?: Record<string, any>;
    missing_info?: Record<string, any>;
    answer_completeness?: Record<string, any>;
    bulk_audit?: Record<string, any>;
    llm_simulator?: Record<string, any>;
    multi_model?: Record<string, any>;
    page_actions?: Record<string, any>;
  };
}

export interface AeoAnalysisResponse {
  success: boolean;
  message: string;
  data?: ModuleCResult | ModuleCResult[] | null;
}

export interface RunModuleCRequest {
  jobId: string;
  url?: string;
}

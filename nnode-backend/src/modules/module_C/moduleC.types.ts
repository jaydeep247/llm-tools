export interface ModuleCResult {
  jobId: string;
  url: string;
  timestamp: Date;
  overall_score: number;
  modules: {
    ai_presence?: {
      score: number;
      details?: Record<string, any>;
    };
    answerability?: {
      score: number;
      details?: Record<string, any>;
    };
    knowledge_base?: {
      score: number;
      details?: Record<string, any>;
    };
    llm_simulator?: {
      simulations?: Record<string, any>;
      cross_model_metrics?: {
        consistency_score?: number;
      };
    };
    multi_model_insights?: Record<string, any>;
    actionable_insights?: Record<string, any>;
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

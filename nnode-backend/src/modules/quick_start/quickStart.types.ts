import type { RankingAnalysisResult } from '../module_E/moduleE.types';

export interface QuickStartResult {
  jobId: string;
  brand_analysis?: {
    brand_name?: string;
    total_mentions?: number;
    sentiment?: {
      counts?: { positive?: number; negative?: number; neutral?: number };
      label?: string;
    };
    frequency_trend?: Array<{ date?: string; count?: number }>;
    top_sources?: Array<{ domain?: string }>;
  };
  competitor_mentions?: {
    overall_sov: number;
    data: Array<{ name: string; mentions: number; sentiment: string; trend: number[] }>;
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
      { sov: number; brand_mentions: number; competitor_mentions: number; brand_known?: boolean }
    >;
  }>;
  ranking_analysis?: RankingAnalysisResult;
  crawl_status?: 'running' | 'completed' | 'failed' | 'cancelled';
  crawlUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

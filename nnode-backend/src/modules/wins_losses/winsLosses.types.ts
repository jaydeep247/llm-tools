export type LLMModel = 'ChatGPT' | 'Gemini' | 'Perplexity' | 'Claude';
export type WinLossCategory = 'Citations' | 'Share of Voice' | 'AIVS Dimensions' | 'Prompt Coverage';
export type WinLossDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type ImpactLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface WinLossFix {
  title: string;
  issue: string;
  impact: ImpactLevel;
  effort: ImpactLevel;
  link: string;
}

export interface WinLossMetric {
  metric: string;
  category: WinLossCategory;
  model: LLMModel | null;
  prev: number;
  current: number;
  delta: number;
  direction: WinLossDirection;
  /** Only populated for LOSS rows */
  fix: WinLossFix | null;
}

export interface WinsLossesResponse {
  wins: WinLossMetric[];
  losses: WinLossMetric[];
  stable: WinLossMetric[];
  period_days: number;
  has_data: boolean;
  generated_at: string;
}

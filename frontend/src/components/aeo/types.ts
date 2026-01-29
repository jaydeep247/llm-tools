export interface AEOScore {
  overall: number;
  ai_presence: number;
  competitor_landscape: number;
  strategy_review: number;
  structured_data?: number;
}

export interface AIPlatform {
  name: string;
  icon: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  details?: {
    understanding_level?: string;
    clarity_score?: number;
    key_topics?: string[];
    main_issues?: string[];
    recommendations?: string[];
    bot_accessibility_score?: number;
    understanding_score?: number;
    scoreType?: 'bot_accessibility' | 'ai_understanding' | 'combined';
    [key: string]: any;
  };
}

export interface Competitor {
  name: string;
  count: number;
}

export interface StrategyMetric {
  name: string;
  score: number;
  status: 'LIVE' | 'OFFLINE';
  color: 'green' | 'orange' | 'red';
}

export interface ContentMetrics {
  content_type_accuracy: number;
  prompt_intent_match: number;
  visibility_impact: number;
  suggested_content_type: string;
  prompt_intent_details: {
    matched_intents: string[];
    confidence: number;
    search_queries: string[];
    // New: prompt intent clustering details from backend
    intent_clusters?: {
      informational?: { prompt_count?: number; example_prompts?: string[] };
      commercial?: { prompt_count?: number; example_prompts?: string[] };
      comparative?: { prompt_count?: number; example_prompts?: string[] };
      transactional?: { prompt_count?: number; example_prompts?: string[] };
      agent_style?: { prompt_count?: number; example_prompts?: string[] };
      [key: string]: any;
    };
    cluster_metrics?: {
      total_prompts?: number;
      categorized_prompts?: number;
      coverage_percentage?: number;
      clustering_accuracy?: number;
      [key: string]: any;
    };
    [key: string]: any;
  };
  visibility_factors: {
    factors: string[];
    score_breakdown: Record<string, number>;
    recommendations: string[];
  };
}

export interface AEODashboardProps {
  sessionId?: number | null;
  url?: string;
  result?: any;
  onAnalyze?: (url: string) => void;
  runCrawl?: boolean;
  isCrawling?: boolean;
  crawlStatus?: 'idle' | 'running' | 'auditing' | 'completed' | 'cancelled';
  pageCount?: number;
  crawlStats?: {
    count: number;
    duration: number;
    pagesPerSecond: number;
  } | null;
  logs?: { message: string; timestamp: string }[];
  discoveredPages?: any[];
}

export type ActiveView = 'crawler' | 'data' | 'links' | 'tree' | 'audits' | 'schema' | 'intelligence' | 'simulator' | 'page_metrics' | 'wordcount_analysis' | 'broken_links' | 'module_e' | 'content_metrics';
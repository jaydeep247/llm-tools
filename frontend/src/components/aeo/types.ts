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

export interface AEODashboardProps {
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

export type ActiveView = 'crawler' | 'data' | 'links' | 'tree' | 'audits' | 'schema' | 'intelligence' | 'simulator' | 'page_metrics' | 'module_e';
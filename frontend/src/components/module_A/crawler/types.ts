export interface CrawlHistoryItem {
  session?: {
    id: number;
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    mode: string;
    startedAt: string;
    completedAt?: string;
    totalPages: number;
    totalResources: number;
    duration: number;
    status: 'running' | 'completed' | 'failed' | 'auditing' | 'cancelled';
  };
  // Legacy flat format support
  id?: number;
  startUrl?: string;
  start_url?: string;
  startedAt?: string;
  started_at?: string;
  totalPages?: number;
  total_pages?: number;
  duration?: number;
  duration_ms?: number;
  status?: 'running' | 'completed' | 'failed' | 'auditing' | 'cancelled';
  
  aeoResult?: {
    grade: string;
    gradeColor: string;
    overallScore: number;
    analysisTimestamp: string;
  } | null;
  aeo_grade?: string;
  isReused?: boolean;
}
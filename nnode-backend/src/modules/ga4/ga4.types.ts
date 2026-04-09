export interface GA4Property {
  id: string;           // e.g. "properties/123456789"
  displayName: string;
  accountId: string;    // e.g. "accounts/123456"
  accountName: string;
}

export interface GA4PageTraffic {
  pageTitle: string;
  pagePath: string;
  sessions: number;
  views: number;
  activeUsers: number;
  viewsPerActiveUser: number;
  avgEngagementTime: number; // seconds
  eventCount: number;
  keyEvents: number;
}

export interface GA4TrafficResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  totalViews: number;
  totalActiveUsers: number;
  totalEventCount: number;
  totalKeyEvents: number;
  pages: GA4PageTraffic[];
}

export interface GA4ConnectionStatus {
  connected: boolean;
  selectedPropertyId?: string;
}

// ── LLM Traffic types ─────────────────────────────────────────────────────────

export interface LLMSourceMapEntry {
  source_domain: string;
  display_name: string;
  is_active: boolean;
  added_at: Date;
}

export interface LLMSourceMap {
  [sourceDomain: string]: string; // e.g. 'chatgpt.com' → 'ChatGPT'
}

export interface LLMPlatformBreakdown {
  platform: string;       // 'ChatGPT', 'Gemini', etc.
  sourceDomain: string;   // raw GA4 dimension value
  sessions: number;
  users: number;
  bounceRate: number;     // 0–100
  avgSessionDuration: number; // seconds
  percentOfLLMTotal: number; // 0–100
}

export interface LLMDailyTrend {
  date: string;           // 'YYYY-MM-DD'
  platform: string;
  sessions: number;
}

export interface LLMTrafficResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalLLMSessions: number;
  totalSiteSessions: number;
  llmPercentOfTotal: number;  // 0–100
  previousPeriod: {
    totalLLMSessions: number;
    llmPercentOfTotal: number;
  };
  breakdown: LLMPlatformBreakdown[];
  trend: LLMDailyTrend[];
  lastSyncedAt: string;       // ISO timestamp
  fromCache: boolean;
}

// ── Top Landing Pages types ──────────────────────────────────────────────────

export interface LLMTopLandingPage {
  path: string;                // GA4 landing page path (e.g. '/blog/seo-guide')
  url: string;                 // Full URL (path prepended with session base domain)
  llmSessions: number;         // Total sessions from all LLM sources
  users: number;
  bounceRate: number;          // 0–100
  citationCount: number;       // From cbm_citation_snapshots
  primaryModel: string;        // Most frequently citing LLM model
  citationTrafficRatio: number | null; // llmSessions / citationCount; null if no citations
  gapFlag: 'OPPORTUNITY_GAP' | 'PERFORMING' | null;
  platformBreakdown: Record<string, number>; // platform → sessions
}

export interface LLMTopLandingPagesResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalLLMPages: number;
  topPage: { url: string; path: string; llmSessions: number } | null;
  avgBounceRate: number;
  pages: LLMTopLandingPage[];
  pagination: { total: number; page: number; pageSize: number };
  fromCache: boolean;
}

export interface CitationSparklinePoint {
  week: string;       // YYYY-MM-DD (Monday start of ISO week)
  citations: number;
}

export interface CitationSparklineResponse {
  url: string;
  dataPoints: CitationSparklinePoint[];
}

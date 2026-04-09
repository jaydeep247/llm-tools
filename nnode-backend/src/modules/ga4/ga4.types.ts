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
  bounceRate: number;    // percentage 0-100
  newUsers: number;
  engagementRate: number; // percentage 0-100
}

export interface GA4TrafficResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  totalViews: number;
  totalActiveUsers: number;
  totalNewUsers: number;
  totalEventCount: number;
  totalKeyEvents: number;
  totalBounceRate: number;    // percentage 0-100
  totalEngagementRate: number; // percentage 0-100
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

// ── Events & Conversions types ───────────────────────────────────────────────

export interface TrackedConversionEvent {
  id: string;           // UUID
  domain_id: string;    // matches the GA4 property ID stored by user
  ga4_event_name: string;
  display_label: string;
  is_active: boolean;
  added_at: Date;
}

export interface ConversionPlatformBreakdown {
  platform: string;
  conversions: number;
  conversion_rate: number;
  revenue: number | null;
}

export interface ConversionTopPage {
  page_url: string;
  llm_sessions: number;
  conversions: number;
  conversion_rate: number;
  primary_event: string;
  revenue: number | null;
}

export type ConversionStatus = 'success' | 'no_events_configured' | 'not_connected';

export interface LLMConversionsResponse {
  status: ConversionStatus;
  total_conversions: number;
  conversion_rate: number;       // LLM conversion rate %
  site_conversion_rate: number;  // Site-wide benchmark %
  revenue: number | null;        // null when ecommerce not enabled
  platform_breakdown: ConversionPlatformBreakdown[];
  top_pages: ConversionTopPage[];
  last_synced_at: string;
  from_cache: boolean;
}

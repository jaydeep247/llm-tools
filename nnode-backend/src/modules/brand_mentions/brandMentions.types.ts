// ─── DB document ────────────────────────────────────────────────────────────

export interface BrandMentionDoc {
  _id?: string;
  userId: string;
  brandName: string;
  domain: string;
  query: string;
  rank: number;
  found_url: string;
  title: string;
  snippet: string;
  /** hostname extracted from found_url, e.g. "example.com" */
  source_domain: string;
  found_date: Date;
}

// ─── API response shapes ─────────────────────────────────────────────────────

export interface MentionResult {
  id: string;
  brandName: string;
  domain: string;
  query: string;
  rank: number;
  found_url: string;
  title: string;
  snippet: string;
  source_domain: string;
  found_date: string;
}

export interface ScanResult {
  scanned_queries: number;
  new_mentions: number;
  duplicate_skipped: number;
  results: MentionResult[];
}

export interface DashboardData {
  total_mentions: number;
  new_mentions_last_7d: number;
  top_domains: { domain: string; count: number }[];
  recent_mentions: MentionResult[];
}

export interface MentionsListResponse {
  mentions: MentionResult[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ─── Request bodies / query params ───────────────────────────────────────────

export interface ScanRequestBody {
  brandName: string;
  domain: string;
  /** Optional custom queries. If omitted, defaults are generated. */
  queries?: string[];
}

export interface ListQueryParams {
  page?: string;
  limit?: string;
  dateFrom?: string;
  dateTo?: string;
  query?: string;
  sourceDomain?: string;
  brandName?: string;
  domain?: string;
}

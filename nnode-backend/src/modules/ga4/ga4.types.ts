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

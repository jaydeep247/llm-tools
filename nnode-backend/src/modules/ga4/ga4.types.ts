export interface GA4Property {
  id: string;           // e.g. "properties/123456789"
  displayName: string;
  accountId: string;    // e.g. "accounts/123456"
  accountName: string;
}

export interface GA4PageTraffic {
  pagePath: string;
  sessions: number;
}

export interface GA4TrafficResponse {
  propertyId: string;
  dateRange: { startDate: string; endDate: string };
  totalSessions: number;
  pages: GA4PageTraffic[];
}

export interface GA4ConnectionStatus {
  connected: boolean;
  selectedPropertyId?: string;
}

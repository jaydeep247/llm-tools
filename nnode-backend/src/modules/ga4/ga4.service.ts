import { OAuth2Client } from 'google-auth-library';
import { UserRepository } from '../user/user.repository';
import { env } from '../../config/env';
import { GA4Property, GA4TrafficResponse, GA4PageTraffic } from './ga4.types';
import { logger } from '../../shared/logger/logger';

export class GA4Service {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Build a refreshed OAuth2Client from stored tokens.
   */
  private async getAuthenticatedClient(userId: string): Promise<OAuth2Client> {
    const user = await this.userRepository.findById(userId);
    if (!user?.googleAnalytics?.connected) {
      throw new Error('GA4_NOT_CONNECTED');
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth is not configured on this server.');
    }

    const { accessToken, refreshToken, expiryDate } = user.googleAnalytics;

    const client = new OAuth2Client({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });

    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken ?? undefined,
      expiry_date: expiryDate ?? undefined,
    });

    const isExpired = expiryDate ? Date.now() >= expiryDate - 60_000 : false;
    if (isExpired && refreshToken) {
      try {
        const { credentials } = await client.refreshAccessToken();
        await this.userRepository.update(userId, {
          googleAnalytics: {
            connected: true,
            accessToken: credentials.access_token ?? null,
            refreshToken: credentials.refresh_token ?? refreshToken ?? null,
            expiryDate: credentials.expiry_date ?? null,
            selectedPropertyId: user.googleAnalytics.selectedPropertyId ?? null,
          },
        });
        client.setCredentials(credentials);
      } catch (err) {
        logger.warn(`GA4: token refresh failed for user ${userId}: ${(err as Error).message}`);
      }
    }

    return client;
  }

  /**
   * Check if user has GA4 connected.
   */
  async getStatus(userId: string): Promise<{ connected: boolean; selectedPropertyId?: string | null }> {
    const user = await this.userRepository.findById(userId);
    return {
      connected: user?.googleAnalytics?.connected === true,
      selectedPropertyId: user?.googleAnalytics?.selectedPropertyId ?? null,
    };
  }

  /**
   * List all GA4 properties the user has access to.
   */
  async listProperties(userId: string): Promise<GA4Property[]> {
    const client = await this.getAuthenticatedClient(userId);
    const tokenResult = await client.getAccessToken();
    const accessToken = tokenResult.token;
    if (!accessToken) throw new Error('Failed to obtain access token');

    const res = await fetch('https://analyticsadmin.googleapis.com/v1alpha/accountSummaries', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error?.message || `Analytics Admin API error ${res.status}`);
    }

    const data = (await res.json()) as any;
    const properties: GA4Property[] = [];

    for (const account of data.accountSummaries ?? []) {
      for (const prop of account.propertySummaries ?? []) {
        properties.push({
          id: prop.property,
          displayName: prop.displayName,
          accountId: account.account,
          accountName: account.displayName,
        });
      }
    }

    return properties;
  }

  /**
   * Save the user's selected GA4 property ID.
   */
  async selectProperty(userId: string, propertyId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user?.googleAnalytics?.connected) {
      throw new Error('GA4_NOT_CONNECTED');
    }
    await this.userRepository.update(userId, {
      googleAnalytics: {
        ...user.googleAnalytics,
        selectedPropertyId: propertyId,
      },
    });
  }

  /**
   * Fetch 30-day sessions per page from GA4.
   * Returns sessions count for each page path.
   */
  async getTraffic(
    userId: string,
    propertyId: string,
    startDate: string = '30daysAgo',
    endDate: string = 'today',
  ): Promise<GA4TrafficResponse> {
    const client = await this.getAuthenticatedClient(userId);
    const tokenResult = await client.getAccessToken();
    const accessToken = tokenResult.token;
    if (!accessToken) throw new Error('Failed to obtain access token');

    const propertyPath = propertyId.startsWith('properties/')
      ? propertyId
      : `properties/${propertyId}`;

    const requestBody = {
      dimensions: [{ name: 'pageTitle' }, { name: 'pagePath' }],
      metrics: [
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'activeUsers' },
        { name: 'userEngagementDuration' },
        { name: 'eventCount' },
        { name: 'conversions' },
      ],
      dateRanges: [{ startDate, endDate }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10000,
      metricAggregations: ['TOTAL'],
    };

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyPath}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error?.message || `Analytics Data API error ${res.status}`);
    }

    const data = (await res.json()) as any;

    const pages: GA4PageTraffic[] = (data.rows ?? []).map((row: any) => {
      const views = parseInt(row.metricValues?.[1]?.value ?? '0', 10);
      const activeUsers = parseInt(row.metricValues?.[2]?.value ?? '0', 10);
      const totalEngagement = parseFloat(row.metricValues?.[3]?.value ?? '0');
      return {
        pageTitle: row.dimensionValues?.[0]?.value ?? '(not set)',
        pagePath: row.dimensionValues?.[1]?.value ?? '/',
        sessions: parseInt(row.metricValues?.[0]?.value ?? '0', 10),
        views,
        activeUsers,
        viewsPerActiveUser: activeUsers > 0 ? parseFloat((views / activeUsers).toFixed(2)) : 0,
        avgEngagementTime: activeUsers > 0 ? parseFloat((totalEngagement / activeUsers).toFixed(1)) : 0,
        eventCount: parseInt(row.metricValues?.[4]?.value ?? '0', 10),
        keyEvents: parseInt(row.metricValues?.[5]?.value ?? '0', 10),
      };
    });

    const totalsRow = (data.totals ?? [])[0]?.metricValues ?? [];
    const totalSessions = parseInt(totalsRow[0]?.value ?? '0', 10);
    const totalViews = parseInt(totalsRow[1]?.value ?? '0', 10);
    const totalActiveUsers = parseInt(totalsRow[2]?.value ?? '0', 10);
    const totalEventCount = parseInt(totalsRow[4]?.value ?? '0', 10);
    const totalKeyEvents = parseInt(totalsRow[5]?.value ?? '0', 10);

    return {
      propertyId,
      dateRange: { startDate, endDate },
      totalSessions,
      totalViews,
      totalActiveUsers,
      totalEventCount,
      totalKeyEvents,
      pages,
    };
  }

  /**
   * Disconnect GA4 integration.
   */
  async disconnect(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      googleAnalytics: {
        connected: false,
        accessToken: null,
        refreshToken: null,
        expiryDate: null,
        selectedPropertyId: null,
      },
    });
  }
}

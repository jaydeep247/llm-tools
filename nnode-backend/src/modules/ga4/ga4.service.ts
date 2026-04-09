import { OAuth2Client } from 'google-auth-library';
import { UserRepository } from '../user/user.repository';
import { env } from '../../config/env';
import { GA4Property, GA4TrafficResponse, GA4PageTraffic, LLMTrafficResponse, LLMPlatformBreakdown, LLMDailyTrend, LLMTopLandingPage, LLMTopLandingPagesResponse, CitationSparklineResponse, LLMConversionsResponse, ConversionPlatformBreakdown, ConversionTopPage } from './ga4.types';
import { logger } from '../../shared/logger/logger';
import { getRedisClient } from '../../config/redis';
import { connectToMongo } from '../../config/mongo';
import { getLLMSourceMap, getTrackedConversionEvents, saveTrackedConversionEvents } from './ga4.repository';

const LLM_CACHE_TTL_SECONDS = 4 * 60 * 60; // 4 hours
const llmCacheKey = (userId: string, propertyId: string, startDate: string, endDate: string) =>
  `ga4:llm:${userId}:${propertyId}:${startDate}:${endDate}`;

const TOP_LANDING_PAGES_TTL_SECONDS = 10 * 60; // 10 minutes
const topLandingPagesCacheKey = (
  userId: string,
  propertyId: string,
  startDate: string,
  endDate: string,
  projectId: string,
) => `ga4:tlp:${userId}:${propertyId}:${startDate}:${endDate}:${projectId}`;

const CONVERSIONS_TTL_SECONDS = 4 * 60 * 60; // 4 hours
const conversionsCacheKey = (userId: string, propertyId: string, startDate: string, endDate: string) =>
  `ga4:conv:${userId}:${propertyId}:${startDate}:${endDate}`;

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

    // Treat a missing expiryDate as expired so we proactively refresh and
    // store the new expiry — prevents silent 401s when expiryDate was never persisted.
    const isExpired = expiryDate ? Date.now() >= expiryDate - 60_000 : true;
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

    const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
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
        { name: 'keyEvents' },
        { name: 'bounceRate' },
        { name: 'newUsers' },
        { name: 'engagementRate' },
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
        bounceRate: parseFloat((parseFloat(row.metricValues?.[6]?.value ?? '0') * 100).toFixed(1)),
        newUsers: parseInt(row.metricValues?.[7]?.value ?? '0', 10),
        engagementRate: parseFloat((parseFloat(row.metricValues?.[8]?.value ?? '0') * 100).toFixed(1)),
      };
    });

    const totalsRow = (data.totals ?? [])[0]?.metricValues ?? [];
    const totalSessions = parseInt(totalsRow[0]?.value ?? '0', 10);
    const totalViews = parseInt(totalsRow[1]?.value ?? '0', 10);
    const totalActiveUsers = parseInt(totalsRow[2]?.value ?? '0', 10);
    const totalEventCount = parseInt(totalsRow[4]?.value ?? '0', 10);
    const totalKeyEvents = parseInt(totalsRow[5]?.value ?? '0', 10);
    const totalBounceRate = parseFloat((parseFloat(totalsRow[6]?.value ?? '0') * 100).toFixed(1));
    const totalNewUsers = parseInt(totalsRow[7]?.value ?? '0', 10);
    const totalEngagementRate = parseFloat((parseFloat(totalsRow[8]?.value ?? '0') * 100).toFixed(1));

    return {
      propertyId,
      dateRange: { startDate, endDate },
      totalSessions,
      totalViews,
      totalActiveUsers,
      totalNewUsers,
      totalEventCount,
      totalKeyEvents,
      totalBounceRate,
      totalEngagementRate,
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

  // ── LLM Traffic ────────────────────────────────────────────────────────────

  /**
   * Fetch LLM traffic data from GA4, with 4-hour Redis caching.
   * Pass forceRefresh=true to bypass cache (Sync Now button).
   */
  async getLLMTraffic(
    userId: string,
    propertyId: string,
    startDate: string = '30daysAgo',
    endDate: string = 'today',
    forceRefresh = false,
  ): Promise<LLMTrafficResponse> {
    const redis = getRedisClient();
    const cacheKey = llmCacheKey(userId, propertyId, startDate, endDate);

    if (!forceRefresh) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as LLMTrafficResponse;
          parsed.fromCache = true;
          return parsed;
        }
      } catch (err) {
        logger.warn(`GA4 LLM cache read failed: ${(err as Error).message}`);
      }
    }

    const data = await this._fetchLLMTrafficFromGA4(userId, propertyId, startDate, endDate);

    try {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', LLM_CACHE_TTL_SECONDS);
    } catch (err) {
      logger.warn(`GA4 LLM cache write failed: ${(err as Error).message}`);
    }

    return data;
  }

  /**
   * Core GA4 API calls for LLM traffic — used by getLLMTraffic. Not cached.
   */
  private async _fetchLLMTrafficFromGA4(
    userId: string,
    propertyId: string,
    startDate: string,
    endDate: string,
  ): Promise<LLMTrafficResponse> {
    const client = await this.getAuthenticatedClient(userId);
    const tokenResult = await client.getAccessToken();
    const accessToken = tokenResult.token;
    if (!accessToken) throw new Error('Failed to obtain access token');

    const propertyPath = propertyId.startsWith('properties/')
      ? propertyId
      : `properties/${propertyId}`;

    const sourceMap = await getLLMSourceMap();
    const sourceDomains = Object.keys(sourceMap);

    // If no LLM sources are configured yet, return empty result to avoid
    // GA4 API error caused by inListFilter with empty values array.
    if (sourceDomains.length === 0) {
      return {
        propertyId,
        dateRange: { startDate, endDate },
        totalLLMSessions: 0,
        totalSiteSessions: 0,
        llmPercentOfTotal: 0,
        previousPeriod: { totalLLMSessions: 0, llmPercentOfTotal: 0 },
        breakdown: [],
        trend: [],
        lastSyncedAt: new Date().toISOString(),
        fromCache: false,
      };
    }

    // ── 1. LLM sessions broken down by sessionSource ──────────────────────
    const llmReportBody = {
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSource',
          inListFilter: { values: sourceDomains },
        },
      },
      metricAggregations: ['TOTAL'],
      limit: 100,
    };

    // ── 2. Total site sessions (no filter) ────────────────────────────────
    const totalReportBody = {
      dimensions: [],
      metrics: [{ name: 'sessions' }],
      dateRanges: [{ startDate, endDate }],
      metricAggregations: ['TOTAL'],
      limit: 1,
    };

    // ── 3. Previous period — equal-length window before current start ─────
    const prevRange = this._previousPeriodRange(startDate, endDate);

    const prevLLMReportBody = {
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      dateRanges: [prevRange],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSource',
          inListFilter: { values: sourceDomains },
        },
      },
      metricAggregations: ['TOTAL'],
      limit: 100,
    };

    // ── 4. Daily trend per LLM platform ────────────────────────────────────
    const trendBody = {
      dimensions: [{ name: 'date' }, { name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSource',
          inListFilter: { values: sourceDomains },
        },
      },
      orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
      limit: 3000,
    };

    const GA4_URL = `https://analyticsdata.googleapis.com/v1beta/${propertyPath}:runReport`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const [llmRes, totalRes, prevRes, trendRes] = await Promise.all([
      fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(llmReportBody) }),
      fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(totalReportBody) }),
      fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(prevLLMReportBody) }),
      fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(trendBody) }),
    ]);

    if (!llmRes.ok) {
      const e = (await llmRes.json().catch(() => ({}))) as any;
      throw new Error(e.error?.message || `GA4 LLM report error ${llmRes.status}`);
    }
    if (!totalRes.ok) {
      const e = (await totalRes.json().catch(() => ({}))) as any;
      throw new Error(e.error?.message || `GA4 total sessions error ${totalRes.status}`);
    }

    const llmData = (await llmRes.json()) as any;
    const totalData = (await totalRes.json()) as any;
    const prevData = prevRes.ok ? ((await prevRes.json()) as any) : null;
    const trendData = trendRes.ok ? ((await trendRes.json()) as any) : null;

    // ── Parse LLM breakdown ───────────────────────────────────────────────
    const aggregated: Record<string, { sessions: number; users: number; bounceRate: number; avgDuration: number; sourceDomain: string }> = {};

    for (const row of llmData.rows ?? []) {
      const sourceDomain: string = row.dimensionValues?.[0]?.value ?? '';
      const platform = sourceMap[sourceDomain] ?? sourceDomain;
      const sessions = parseInt(row.metricValues?.[0]?.value ?? '0', 10);
      const users = parseInt(row.metricValues?.[1]?.value ?? '0', 10);
      const bounceRate = parseFloat(row.metricValues?.[2]?.value ?? '0') * 100; // GA4 returns 0–1
      const avgDuration = parseFloat(row.metricValues?.[3]?.value ?? '0');

      if (!aggregated[platform]) {
        aggregated[platform] = { sessions: 0, users: 0, bounceRate: 0, avgDuration: 0, sourceDomain };
      }
      aggregated[platform].sessions += sessions;
      aggregated[platform].users += users;
      // Weighted bounce-rate average
      const prev = aggregated[platform];
      const total = prev.sessions + sessions;
      aggregated[platform].bounceRate =
        total > 0
          ? (prev.bounceRate * prev.sessions + bounceRate * sessions) / total
          : 0;
      aggregated[platform].avgDuration =
        total > 0
          ? (prev.avgDuration * prev.sessions + avgDuration * sessions) / total
          : 0;
      aggregated[platform].sessions = total;
    }

    const totalLLMSessions = Object.values(aggregated).reduce((s, p) => s + p.sessions, 0);

    const breakdown: LLMPlatformBreakdown[] = Object.entries(aggregated)
      .sort((a, b) => b[1].sessions - a[1].sessions)
      .map(([platform, p]) => ({
        platform,
        sourceDomain: p.sourceDomain,
        sessions: p.sessions,
        users: p.users,
        bounceRate: parseFloat(p.bounceRate.toFixed(1)),
        avgSessionDuration: parseFloat(p.avgDuration.toFixed(1)),
        percentOfLLMTotal:
          totalLLMSessions > 0
            ? parseFloat(((p.sessions / totalLLMSessions) * 100).toFixed(1))
            : 0,
      }));

    // ── Total site sessions ───────────────────────────────────────────────
    const totalSessions = parseInt(
      (totalData.totals?.[0]?.metricValues?.[0]?.value ?? (totalData.rows?.[0]?.metricValues?.[0]?.value ?? '0')),
      10,
    );

    // ── Previous period ───────────────────────────────────────────────────
    let prevLLMSessions = 0;
    for (const row of prevData?.rows ?? []) {
      prevLLMSessions += parseInt(row.metricValues?.[0]?.value ?? '0', 10);
    }
    const prevTotalBody = {
      dimensions: [],
      metrics: [{ name: 'sessions' }],
      dateRanges: [prevRange],
      metricAggregations: ['TOTAL'],
      limit: 1,
    };
    const prevTotalRes = await fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(prevTotalBody) });
    const prevTotalData = prevTotalRes.ok ? ((await prevTotalRes.json()) as any) : null;
    const prevTotalSessions = parseInt(
      (prevTotalData?.totals?.[0]?.metricValues?.[0]?.value ?? '0'),
      10,
    );

    // ── Daily trend ───────────────────────────────────────────────────────
    const trend: LLMDailyTrend[] = [];
    for (const row of trendData?.rows ?? []) {
      const rawDate: string = row.dimensionValues?.[0]?.value ?? '';
      const sourceDomain: string = row.dimensionValues?.[1]?.value ?? '';
      const sessions = parseInt(row.metricValues?.[0]?.value ?? '0', 10);
      const platform = sourceMap[sourceDomain] ?? sourceDomain;
      trend.push({
        date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
        platform,
        sessions,
      });
    }

    return {
      propertyId,
      dateRange: { startDate, endDate },
      totalLLMSessions,
      totalSiteSessions: totalSessions,
      llmPercentOfTotal:
        totalSessions > 0
          ? parseFloat(((totalLLMSessions / totalSessions) * 100).toFixed(2))
          : 0,
      previousPeriod: {
        totalLLMSessions: prevLLMSessions,
        llmPercentOfTotal:
          prevTotalSessions > 0
            ? parseFloat(((prevLLMSessions / prevTotalSessions) * 100).toFixed(2))
            : 0,
      },
      breakdown,
      trend,
      lastSyncedAt: new Date().toISOString(),
      fromCache: false,
    };
  }

  /**
   * Calculate an equal-length previous-period date range.
   * Works for GA4 relative strings (NdaysAgo / today / yesterday) and YYYY-MM-DD.
   */
  private _previousPeriodRange(
    startDate: string,
    endDate: string,
  ): { startDate: string; endDate: string } {
    const resolve = (d: string): Date => {
      if (d === 'today') return new Date();
      if (d === 'yesterday') {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return y;
      }
      const m = d.match(/^(\d+)daysAgo$/);
      if (m) {
        const t = new Date();
        t.setDate(t.getDate() - parseInt(m[1], 10));
        return t;
      }
      return new Date(d);
    };

    const toStr = (d: Date): string => d.toISOString().slice(0, 10);

    const start = resolve(startDate);
    const end = resolve(endDate);
    const rangeMs = end.getTime() - start.getTime();
    const prevEnd = new Date(start.getTime() - 86_400_000);
    const prevStart = new Date(prevEnd.getTime() - rangeMs);

    return { startDate: toStr(prevStart), endDate: toStr(prevEnd) };
  }

  /**
   * Resolve a GA4 relative date string (e.g. '30daysAgo', 'today') to YYYY-MM-DD.
   */
  private _resolveDate(d: string): string {
    if (d === 'today') return new Date().toISOString().slice(0, 10);
    if (d === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      return y.toISOString().slice(0, 10);
    }
    const m = d.match(/^(\d+)daysAgo$/);
    if (m) {
      const t = new Date();
      t.setDate(t.getDate() - parseInt(m[1], 10));
      return t.toISOString().slice(0, 10);
    }
    return d; // already YYYY-MM-DD
  }

  /**
   * Fetch Top Landing Pages: GA4 LLM-sourced landing pages enriched with
   * citation snapshot data from cbm_citation_snapshots.
   */
  async getTopLandingPages(
    userId: string,
    propertyId: string,
    startDate: string,
    endDate: string,
    projectId: string,
    sessionUrl?: string,
    platform?: string,
    page: number = 1,
    pageSize: number = 50,
  ): Promise<LLMTopLandingPagesResponse> {
    const redis = getRedisClient();
    const cacheKey = topLandingPagesCacheKey(userId, propertyId, startDate, endDate, projectId);

    // ── Cache check ──────────────────────────────────────────────────────
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as LLMTopLandingPagesResponse;
        // Re-apply pagination on cached full page list
        const allPages = parsed.pages;
        const start = (page - 1) * pageSize;
        const pageSlice = allPages.slice(start, start + pageSize);
        return {
          ...parsed,
          pages: pageSlice,
          pagination: { total: allPages.length, page, pageSize },
          fromCache: true,
        };
      }
    } catch (err) {
      logger.warn(`GA4 TLP cache read failed: ${(err as Error).message}`);
    }

    const client = await this.getAuthenticatedClient(userId);
    const tokenResult = await client.getAccessToken();
    const accessToken = tokenResult.token;
    if (!accessToken) throw new Error('Failed to obtain access token');

    const propertyPath = propertyId.startsWith('properties/')
      ? propertyId
      : `properties/${propertyId}`;

    const sourceMap = await getLLMSourceMap();
    const sourceDomains = Object.keys(sourceMap);

    // ── Optional platform filter ─────────────────────────────────────────
    let filteredSources = sourceDomains;
    if (platform && platform !== 'ALL') {
      const platformUpper = platform.toUpperCase();
      filteredSources = sourceDomains.filter((d) => {
        const mapped = (sourceMap[d] ?? '').toUpperCase();
        return mapped === platformUpper || mapped.startsWith(platformUpper);
      });
      if (filteredSources.length === 0) filteredSources = sourceDomains;
    }

    // Guard: inListFilter with empty values causes GA4 API 400
    if (filteredSources.length === 0) {
      return {
        propertyId,
        dateRange: { startDate, endDate },
        totalLLMPages: 0,
        topPage: null,
        avgBounceRate: 0,
        pages: [],
        pagination: { total: 0, page, pageSize },
        fromCache: false,
      };
    }

    // ── GA4: landingPage + sessionSource breakdown ────────────────────────
    const reportBody = {
      dimensions: [{ name: 'landingPage' }, { name: 'sessionSource' }],
      metrics: [
        { name: 'sessions' },
        { name: 'totalUsers' },
        { name: 'bounceRate' },
      ],
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSource',
          inListFilter: { values: filteredSources },
        },
      },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 5000,
    };

    const GA4_URL = `https://analyticsdata.googleapis.com/v1beta/${propertyPath}:runReport`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(GA4_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(reportBody),
    });

    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as any;
      throw new Error(e.error?.message || `GA4 Top Landing Pages error ${res.status}`);
    }

    const data = (await res.json()) as any;

    // ── Step 1: Aggregate GA4 rows by landingPage ────────────────────────
    type PageAgg = {
      llmSessions: number;
      users: number;
      bounceRateWeighted: number;
      platformBreakdown: Record<string, number>;
    };

    const pageAgg: Record<string, PageAgg> = {};

    for (const row of data.rows ?? []) {
      const path: string = row.dimensionValues?.[0]?.value ?? '/';
      const source: string = row.dimensionValues?.[1]?.value ?? '';
      const sessions = parseInt(row.metricValues?.[0]?.value ?? '0', 10);
      const users = parseInt(row.metricValues?.[1]?.value ?? '0', 10);
      const bounceRate = parseFloat(row.metricValues?.[2]?.value ?? '0') * 100;
      const platformName = sourceMap[source] ?? source;

      if (!pageAgg[path]) {
        pageAgg[path] = { llmSessions: 0, users: 0, bounceRateWeighted: 0, platformBreakdown: {} };
      }

      const prev = pageAgg[path];
      const combined = prev.llmSessions + sessions;
      prev.bounceRateWeighted =
        combined > 0
          ? (prev.bounceRateWeighted * prev.llmSessions + bounceRate * sessions) / combined
          : 0;
      prev.llmSessions = combined;
      prev.users += users;
      prev.platformBreakdown[platformName] = (prev.platformBreakdown[platformName] ?? 0) + sessions;
    }

    // Sort by LLM sessions descending — NO slice here, full list kept for pagination
    const sortedPaths = Object.entries(pageAgg)
      .sort(([, a], [, b]) => b.llmSessions - a.llmSessions);

    if (sortedPaths.length === 0) {
      return {
        propertyId,
        dateRange: { startDate, endDate },
        totalLLMPages: 0,
        topPage: null,
        avgBounceRate: 0,
        pages: [],
        pagination: { total: 0, page, pageSize },
        fromCache: false,
      };
    }

    // ── Step 2: Construct full URLs from session domain (if provided) ────
    let baseUrl = '';
    if (sessionUrl) {
      try {
        const u = new URL(sessionUrl.startsWith('http') ? sessionUrl : `https://${sessionUrl}`);
        baseUrl = `${u.protocol}//${u.hostname}`;
      } catch {
        baseUrl = '';
      }
    }

    const topPaths = sortedPaths.map(([p]) => p);
    const fullUrls = baseUrl ? topPaths.map((p) => `${baseUrl}${p}`) : [];

    // ── Step 3: Batch-query citation snapshots ───────────────────────────
    const fromDateStr = this._resolveDate(startDate);
    const citationMap: Record<string, { count: number; modelCounts: Record<string, number> }> = {};

    if (projectId && fullUrls.length > 0) {
      try {
        const db = await connectToMongo();
        const snapshots = await db
          .collection('cbm_citation_snapshots')
          .aggregate([
            {
              $match: {
                projectId,
                citedUrl: { $in: fullUrls },
                snapshotDate: { $gte: fromDateStr },
                citationPresent: true,
              },
            },
            {
              $group: {
                _id: '$citedUrl',
                count: { $sum: 1 },
                models: { $push: '$llmModel' },
              },
            },
          ])
          .toArray();

        for (const snap of snapshots) {
          const citedUrl = snap._id as string;
          const modelCounts: Record<string, number> = {};
          for (const m of (snap.models as string[]) ?? []) {
            modelCounts[m] = (modelCounts[m] ?? 0) + 1;
          }
          citationMap[citedUrl] = { count: snap.count as number, modelCounts };
        }
      } catch (err) {
        logger.warn(`getTopLandingPages: citation lookup failed: ${(err as Error).message}`);
      }
    }

    // ── Step 4: Build enriched page list ────────────────────────────────
    const pages: LLMTopLandingPage[] = sortedPaths.map(([path, agg]) => {
      const url = baseUrl ? `${baseUrl}${path}` : path;
      const citData = citationMap[url] ?? null;
      const citationCount = citData?.count ?? 0;

      const primaryModel =
        citData
          ? Object.entries(citData.modelCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? ''
          : '';

      const citationTrafficRatio =
        citationCount > 0 ? parseFloat((agg.llmSessions / citationCount).toFixed(2)) : null;

      let gapFlag: LLMTopLandingPage['gapFlag'] = null;
      if (citationCount > 20 && agg.llmSessions < 50) {
        gapFlag = 'OPPORTUNITY_GAP';
      } else if (citationCount > 20 && agg.llmSessions >= 50) {
        gapFlag = 'PERFORMING';
      }

      return {
        path,
        url,
        llmSessions: agg.llmSessions,
        users: agg.users,
        bounceRate: parseFloat(agg.bounceRateWeighted.toFixed(1)),
        citationCount,
        primaryModel,
        citationTrafficRatio,
        gapFlag,
        platformBreakdown: agg.platformBreakdown,
      };
    });

    // ── Step 5: Summary metrics ──────────────────────────────────────────
    const totalBounce =
      pages.length > 0
        ? pages.reduce((s, p) => s + p.bounceRate * p.llmSessions, 0) /
          pages.reduce((s, p) => s + p.llmSessions, 0)
        : 0;

    const topPage = pages[0]
      ? { url: pages[0].url, path: pages[0].path, llmSessions: pages[0].llmSessions }
      : null;

    // ── Cache the full page list before slicing ──────────────────────────
    const fullResponse: LLMTopLandingPagesResponse = {
      propertyId,
      dateRange: { startDate, endDate },
      totalLLMPages: pages.length,
      topPage,
      avgBounceRate: parseFloat(totalBounce.toFixed(1)),
      pages, // full list
      pagination: { total: pages.length, page: 1, pageSize },
      fromCache: false,
    };

    try {
      await redis.set(cacheKey, JSON.stringify(fullResponse), 'EX', TOP_LANDING_PAGES_TTL_SECONDS);
    } catch (err) {
      logger.warn(`GA4 TLP cache write failed: ${(err as Error).message}`);
    }

    // ── Apply pagination ─────────────────────────────────────────────────
    const start = (page - 1) * pageSize;
    return {
      ...fullResponse,
      pages: pages.slice(start, start + pageSize),
      pagination: { total: pages.length, page, pageSize },
    };
  }

  /**
   * Citation sparkline: weekly citation counts for a specific URL.
   * Returns up to 8 weekly data points for rendering as a sparkline.
   */
  async getCitationSparkline(
    projectId: string,
    url: string,
    startDate: string,
    endDate: string,
  ): Promise<CitationSparklineResponse> {
    const fromDateStr = this._resolveDate(startDate);
    const toDateStr = this._resolveDate(endDate);

    const db = await connectToMongo();
    const snapshots = await db
      .collection('cbm_citation_snapshots')
      .find({
        projectId,
        citedUrl: url,
        snapshotDate: { $gte: fromDateStr, $lte: toDateStr },
        citationPresent: true,
      })
      .toArray();

    // Bucket by ISO week start (Monday)
    const weekMap: Record<string, number> = {};
    for (const snap of snapshots) {
      const d = new Date(snap.snapshotDate as string);
      const day = d.getUTCDay(); // 0=Sun
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setUTCDate(d.getUTCDate() + diff);
      const weekKey = monday.toISOString().slice(0, 10);
      weekMap[weekKey] = (weekMap[weekKey] ?? 0) + 1;
    }

    const dataPoints = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([week, citations]) => ({ week, citations }));

    return { url, dataPoints };
  }

  // ── Events & Conversions ──────────────────────────────────────────────────

  /**
   * Return all conversion events the user has configured.
   */
  async getConversionEvents(userId: string) {
    return getTrackedConversionEvents(userId);
  }

  /**
   * Save (replace) the conversion event configuration for a user.
   */
  async saveConversionEvents(
    userId: string,
    events: Array<{ ga4_event_name: string; display_label: string }>,
  ): Promise<void> {
    // Validate: ga4_event_name must be a non-empty string without special chars
    const namePattern = /^[a-zA-Z0-9_]{1,100}$/;
    for (const e of events) {
      if (!namePattern.test(e.ga4_event_name)) {
        throw new Error(`Invalid GA4 event name: ${e.ga4_event_name}`);
      }
    }
    await saveTrackedConversionEvents(userId, events);
  }

  /**
   * List all GA4 event names available in the property so the user can
   * pick which ones to track as conversions.
   */
  async listGA4Events(
    userId: string,
    propertyId: string,
    startDate: string = '30daysAgo',
    endDate: string = 'today',
  ): Promise<string[]> {
    const client = await this.getAuthenticatedClient(userId);
    const tokenResult = await client.getAccessToken();
    const accessToken = tokenResult.token;
    if (!accessToken) throw new Error('Failed to obtain access token');

    const propertyPath = propertyId.startsWith('properties/')
      ? propertyId
      : `properties/${propertyId}`;

    const body = {
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dateRanges: [{ startDate, endDate }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 200,
    };

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${propertyPath}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as any;
      throw new Error(err.error?.message || `GA4 events list error ${res.status}`);
    }

    const data = (await res.json()) as any;
    return (data.rows ?? []).map((r: any) => r.dimensionValues?.[0]?.value ?? '').filter(Boolean);
  }

  /**
   * Fetch LLM-attributed conversion data from GA4, with 4-hour caching.
   */
  async getLLMConversions(
    userId: string,
    propertyId: string,
    startDate: string = '30daysAgo',
    endDate: string = 'today',
    forceRefresh = false,
  ): Promise<LLMConversionsResponse> {
    // Step 01 — Check setup
    const trackedEvents = await getTrackedConversionEvents(userId);
    if (trackedEvents.length === 0) {
      return {
        status: 'no_events_configured',
        total_conversions: 0,
        conversion_rate: 0,
        site_conversion_rate: 0,
        revenue: null,
        platform_breakdown: [],
        top_pages: [],
        last_synced_at: new Date().toISOString(),
        from_cache: false,
      };
    }

    const redis = getRedisClient();
    const cacheKey = conversionsCacheKey(userId, propertyId, startDate, endDate);

    if (!forceRefresh) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as LLMConversionsResponse;
          parsed.from_cache = true;
          return parsed;
        }
      } catch (err) {
        logger.warn(`GA4 conversions cache read failed: ${(err as Error).message}`);
      }
    }

    const data = await this._fetchLLMConversionsFromGA4(
      userId,
      propertyId,
      startDate,
      endDate,
      trackedEvents,
    );

    try {
      await redis.set(cacheKey, JSON.stringify(data), 'EX', CONVERSIONS_TTL_SECONDS);
    } catch (err) {
      logger.warn(`GA4 conversions cache write failed: ${(err as Error).message}`);
    }

    return data;
  }

  private async _fetchLLMConversionsFromGA4(
    userId: string,
    propertyId: string,
    startDate: string,
    endDate: string,
    trackedEvents: Awaited<ReturnType<typeof getTrackedConversionEvents>>,
  ): Promise<LLMConversionsResponse> {
    const client = await this.getAuthenticatedClient(userId);
    const tokenResult = await client.getAccessToken();
    const accessToken = tokenResult.token;
    if (!accessToken) throw new Error('Failed to obtain access token');

    const propertyPath = propertyId.startsWith('properties/')
      ? propertyId
      : `properties/${propertyId}`;

    const sourceMap = await getLLMSourceMap();
    const sourceDomains = Object.keys(sourceMap);
    const eventNames = trackedEvents.map((e) => e.ga4_event_name);

    // Guard: avoid GA4 API 400 from inListFilter with empty values
    if (sourceDomains.length === 0) {
      return {
        status: 'success',
        total_conversions: 0,
        conversion_rate: 0,
        site_conversion_rate: 0,
        revenue: null,
        platform_breakdown: [],
        top_pages: [],
        last_synced_at: new Date().toISOString(),
        from_cache: false,
      } as LLMConversionsResponse;
    }

    const GA4_URL = `https://analyticsdata.googleapis.com/v1beta/${propertyPath}:runReport`;
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    // ── Step 02 — LLM conversions report ─────────────────────────────────
    const llmConvBody = {
      dimensions: [
        { name: 'eventName' },
        { name: 'sessionSource' },
        { name: 'landingPage' },
      ],
      metrics: [
        { name: 'eventCount' },
        { name: 'keyEvents' },
        { name: 'purchaseRevenue' },
      ],
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        andGroup: {
          expressions: [
            {
              filter: {
                fieldName: 'sessionSource',
                inListFilter: { values: sourceDomains },
              },
            },
            {
              filter: {
                fieldName: 'eventName',
                inListFilter: { values: eventNames },
              },
            },
          ],
        },
      },
      metricAggregations: ['TOTAL'],
      limit: 10000,
    };

    // ── Step 05 — Site benchmark: eventCount for tracked events across all traffic ──
    const siteBenchmarkBody = {
      dimensions: [],
      metrics: [
        { name: 'eventCount' },
        { name: 'sessions' },
      ],
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: eventNames },
        },
      },
      metricAggregations: ['TOTAL'],
      limit: 1,
    };

    // ── Step 02b — Total LLM sessions per platform (for overall conversion rate) ──
    const llmSessionsBody = {
      dimensions: [{ name: 'sessionSource' }],
      metrics: [{ name: 'sessions' }],
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSource',
          inListFilter: { values: sourceDomains },
        },
      },
      metricAggregations: ['TOTAL'],
      limit: 100,
    };

    // ── LLM sessions broken down by landing page (for per-page conversion rate) ──
    const pageLLMSessionsBody = {
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }],
      dateRanges: [{ startDate, endDate }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionSource',
          inListFilter: { values: sourceDomains },
        },
      },
      limit: 10000,
    };

    const [convRes, benchmarkRes, llmSessRes, pageSessRes] = await Promise.all([
      fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(llmConvBody) }),
      fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(siteBenchmarkBody) }),
      fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(llmSessionsBody) }),
      fetch(GA4_URL, { method: 'POST', headers, body: JSON.stringify(pageLLMSessionsBody) }),
    ]);

    if (!convRes.ok) {
      const e = (await convRes.json().catch(() => ({}))) as any;
      throw new Error(e.error?.message || `GA4 conversions report error ${convRes.status}`);
    }

    const convData = (await convRes.json()) as any;
    const benchmarkData = benchmarkRes.ok ? ((await benchmarkRes.json()) as any) : null;
    const llmSessData = llmSessRes.ok ? ((await llmSessRes.json()) as any) : null;
    const pageSessData = pageSessRes.ok ? ((await pageSessRes.json()) as any) : null;

    // ── Step 04A — Total conversions ─────────────────────────────────────
    let totalConversions = 0;
    let totalRevenue = 0;
    let hasRevenue = false;

    // Platform → aggregated data
    const platformMap: Record<string, { conversions: number; revenue: number; sessions: number }> = {};
    // Landing page → aggregated data
    const pageMap: Record<string, { conversions: number; revenue: number; sessions: number; events: Record<string, number> }> = {};

    for (const row of convData.rows ?? []) {
      const eventName: string = row.dimensionValues?.[0]?.value ?? '';
      const sourceDomain: string = row.dimensionValues?.[1]?.value ?? '';
      const landingPage: string = row.dimensionValues?.[2]?.value ?? '/';
      const eventCount = parseInt(row.metricValues?.[0]?.value ?? '0', 10);
      // Use eventCount as the conversion signal — GA4's 'conversions' metric only
      // counts events explicitly marked as key events in GA4 admin settings.
      const conversions = eventCount;
      const revenue = parseFloat(row.metricValues?.[2]?.value ?? '0');

      totalConversions += conversions;
      if (revenue > 0) { totalRevenue += revenue; hasRevenue = true; }

      const platform = sourceMap[sourceDomain] ?? sourceDomain;
      if (!platformMap[platform]) platformMap[platform] = { conversions: 0, revenue: 0, sessions: 0 };
      platformMap[platform].conversions += conversions;
      platformMap[platform].revenue += revenue;

      if (!pageMap[landingPage]) pageMap[landingPage] = { conversions: 0, revenue: 0, sessions: 0, events: {} };
      pageMap[landingPage].conversions += conversions;
      pageMap[landingPage].revenue += revenue;
      pageMap[landingPage].events[eventName] = (pageMap[landingPage].events[eventName] ?? 0) + eventCount;
    }

    // ── Total LLM sessions per platform (for conversion rate) ────────────
    let totalLLMSessions = 0;
    for (const row of llmSessData?.rows ?? []) {
      const sourceDomain: string = row.dimensionValues?.[0]?.value ?? '';
      const sessions = parseInt(row.metricValues?.[0]?.value ?? '0', 10);
      totalLLMSessions += sessions;
      const platform = sourceMap[sourceDomain] ?? sourceDomain;
      if (platformMap[platform]) platformMap[platform].sessions += sessions;
    }

    // ── Per-page LLM sessions (for accurate per-page conversion rate) ────
    for (const row of pageSessData?.rows ?? []) {
      const landingPage: string = row.dimensionValues?.[0]?.value ?? '/';
      const sessions = parseInt(row.metricValues?.[0]?.value ?? '0', 10);
      if (pageMap[landingPage]) {
        pageMap[landingPage].sessions += sessions;
      }
    }

    // ── Step 04B — Conversion rate ────────────────────────────────────────
    const llmConversionRate =
      totalLLMSessions > 0
        ? parseFloat(((totalConversions / totalLLMSessions) * 100).toFixed(2))
        : 0;

    // ── Step 03 — Platform breakdown ─────────────────────────────────────
    const platformBreakdown: ConversionPlatformBreakdown[] = Object.entries(platformMap)
      .sort((a, b) => b[1].conversions - a[1].conversions)
      .map(([platform, p]) => ({
        platform,
        conversions: p.conversions,
        conversion_rate:
          p.sessions > 0
            ? parseFloat(((p.conversions / p.sessions) * 100).toFixed(2))
            : 0,
        revenue: hasRevenue ? parseFloat(p.revenue.toFixed(2)) : null,
      }));

    // ── Step 05 — Site benchmark ─────────────────────────────────────────
    const benchmarkTotals = benchmarkData?.totals?.[0]?.metricValues ?? [];
    const siteConversions = parseFloat(benchmarkTotals[0]?.value ?? '0');
    const siteSessions = parseFloat(benchmarkTotals[1]?.value ?? '1');
    const siteConversionRate =
      siteSessions > 0
        ? parseFloat(((siteConversions / siteSessions) * 100).toFixed(2))
        : 0;

    // ── Step 06 — Top converting pages ───────────────────────────────────
    const topPages: ConversionTopPage[] = Object.entries(pageMap)
      .filter(([, p]) => p.conversions > 0)
      .sort((a, b) => {
        const rateA = a[1].sessions > 0 ? a[1].conversions / a[1].sessions : 0;
        const rateB = b[1].sessions > 0 ? b[1].conversions / b[1].sessions : 0;
        return rateB - rateA;
      })
      .slice(0, 20)
      .map(([page, p]) => {
        const primaryEvent =
          Object.entries(p.events).sort(([, a], [, b]) => b - a)[0]?.[0] ?? eventNames[0];
        const displayLabel =
          trackedEvents.find((e) => e.ga4_event_name === primaryEvent)?.display_label ?? primaryEvent;
        return {
          page_url: page,
          llm_sessions: p.sessions,
          conversions: p.conversions,
          conversion_rate:
            p.sessions > 0
              ? parseFloat(((p.conversions / p.sessions) * 100).toFixed(2))
              : 0,
          primary_event: displayLabel,
          revenue: hasRevenue ? parseFloat(p.revenue.toFixed(2)) : null,
        };
      });

    return {
      status: 'success',
      total_conversions: totalConversions,
      conversion_rate: llmConversionRate,
      site_conversion_rate: siteConversionRate,
      revenue: hasRevenue ? parseFloat(totalRevenue.toFixed(2)) : null,
      platform_breakdown: platformBreakdown,
      top_pages: topPages,
      last_synced_at: new Date().toISOString(),
      from_cache: false,
    };
  }
}

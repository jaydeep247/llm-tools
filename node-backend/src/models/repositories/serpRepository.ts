import { prisma } from '../../config/prismaClient.js';
import type { SerpSnapshot } from '../types.js';

export class SerpRepository {
  private map(row: any): SerpSnapshot {
    if (!row) return row;
    return {
      id: row.id,
      keyword: row.keyword,
      targetDomain: row.targetDomain,
      normalizedDomain: row.normalizedDomain,
      searchEngine: row.searchEngine,
      location: row.location,
      device: row.device,
      maxResults: row.maxResults,
      runAt: row.runAt.toISOString ? row.runAt.toISOString() : row.runAt,
      position: row.position ?? null,
      rankingUrl: row.rankingUrl ?? null,
      rankStatus: row.rankStatus,
      change: row.change ?? null,
      changeLabel: row.changeLabel ?? null,
      intent: row.intent,
      topCompetitors: row.topCompetitors ?? [],
      serpFeatures: row.serpFeatures ?? {
        featured_snippet: false,
        paa: false,
        video: false,
        images: false,
      },
      serp: row.serp ?? [],
      sessionId: row.sessionId ?? null,
    };
  }

  async createSnapshot(data: Omit<SerpSnapshot, 'id' | 'runAt'>): Promise<SerpSnapshot> {
    const created = await prisma.serpSnapshot.create({
      data: {
        keyword: data.keyword,
        targetDomain: data.targetDomain,
        normalizedDomain: data.normalizedDomain,
        searchEngine: data.searchEngine,
        location: data.location,
        device: data.device,
        maxResults: data.maxResults,
        position: data.position ?? null,
        rankingUrl: data.rankingUrl ?? null,
        rankStatus: data.rankStatus,
        change: data.change ?? null,
        changeLabel: data.changeLabel ?? null,
        intent: data.intent,
        topCompetitors: data.topCompetitors,
        serpFeatures: data.serpFeatures,
        serp: data.serp,
        sessionId: data.sessionId ?? null,
      },
    });
    return this.map(created);
  }

  async getLatestSnapshot(
    keyword: string,
    normalizedDomain: string,
    location: string,
    device: string,
  ): Promise<SerpSnapshot | null> {
    const row = await prisma.serpSnapshot.findFirst({
      where: {
        keyword,
        normalizedDomain,
        location,
        device,
      },
      orderBy: {
        runAt: 'desc',
      },
    });
    return row ? this.map(row) : null;
  }

  async getHistory(
    keyword: string,
    normalizedDomain: string,
    location?: string,
    device?: string,
    limit: number = 50,
  ): Promise<SerpSnapshot[]> {
    const where: any = {
      keyword,
      normalizedDomain,
    };
    if (location) where.location = location;
    if (device) where.device = device;

    const rows = await prisma.serpSnapshot.findMany({
      where,
      orderBy: { runAt: 'asc' },
      take: limit,
    });
    return rows.map((r) => this.map(r));
  }
}


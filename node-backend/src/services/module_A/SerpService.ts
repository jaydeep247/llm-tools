import { getDatabase } from '../DatabaseService.js';

export interface SerpAnalyzeInput {
  keyword: string;
  targetDomain: string;
  location: string;
  device: 'desktop' | 'mobile';
  maxResults?: number;
  sessionId?: number | null;
}

export interface SerpResultItem {
  position: number;
  url: string;
  title: string;
  type?: string;
}

export interface SerpFeatures {
  featured_snippet: boolean;
  paa: boolean;
  video: boolean;
  images: boolean;
}

export interface SerpAnalyzeOutput {
  keyword: string;
  targetDomain: string;
  normalizedDomain: string;
  searchEngine: string;
  location: string;
  device: 'desktop' | 'mobile';
  maxResults: number;
  runAt: string;
  position: number | null;
  rankingUrl: string | null;
  rankStatus: 'ranked' | 'not_ranked' | 'lost';
  change: number | null;
  changeLabel: string | null;
  intent: string;
  topCompetitors: { domain: string; count: number }[];
  serpFeatures: SerpFeatures;
  serp: SerpResultItem[];
  sessionId?: number | null;
}

function getPythonApiBase(): string {
  const base = process.env.PY_API_BASE || 'http://localhost:8000';
  return base.replace(/\/$/, '');
}

function normalizeDomain(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return trimmed;

  try {
    let url = trimmed;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const u = new URL(url);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return host;
  } catch {
    return trimmed.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  }
}

function detectRanking(results: SerpResultItem[], targetDomain: string) {
  const normTarget = normalizeDomain(targetDomain);
  let position: number | null = null;
  let rankingUrl: string | null = null;

  for (const r of results) {
    const candidateDomain = normalizeDomain(r.url);
    if (!candidateDomain || !normTarget) continue;

    if (candidateDomain === normTarget || candidateDomain.endsWith(`.${normTarget}`) || normTarget.endsWith(`.${candidateDomain}`)) {
      position = r.position;
      rankingUrl = r.url;
      break;
    }
  }

  let rankStatus: 'ranked' | 'not_ranked' | 'lost' = 'ranked';
  if (position == null) rankStatus = 'not_ranked';

  return { position, rankingUrl, rankStatus };
}

function computeCompetition(results: SerpResultItem[]): { domain: string; count: number }[] {
  const top10 = results.filter((r) => r.position <= 10);
  const counts = new Map<string, number>();

  for (const r of top10) {
    const d = normalizeDomain(r.url);
    if (!d) continue;
    counts.set(d, (counts.get(d) || 0) + 1);
  }

  return Array.from(counts.entries()).map(([domain, count]) => ({ domain, count }));
}

function detectIntent(results: SerpResultItem[], keyword: string): string {
  const top = results.slice(0, 10);

  let blogLike = 0;
  let productLike = 0;
  let comparisonLike = 0;

  const comparisonWords = ['vs', 'best', 'top', 'review', 'compare', 'comparison', 'alternative', 'alternatives'];

  for (const r of top) {
    const title = (r.title || '').toLowerCase();
    const url = (r.url || '').toLowerCase();

    const isBlog =
      /blog|guide|how to|tips|what is|learn|explained|definition/.test(title) ||
      /\/blog\//.test(url) ||
      url.includes('blog.');

    const isProduct =
      /product|pricing|plans|buy|order|shop|deal|coupon|price/.test(title) ||
      /\/product|\/pricing|\/shop/.test(url);

    const isComparison = comparisonWords.some((w) => title.includes(w) || keyword.toLowerCase().includes(w));

    if (isBlog) blogLike++;
    if (isProduct) productLike++;
    if (isComparison) comparisonLike++;
  }

  if (comparisonLike >= Math.max(blogLike, productLike)) return 'Commercial';
  if (blogLike > productLike) return 'Informational';
  if (productLike > blogLike) return 'Transactional';
  return 'Mixed';
}

export class SerpService {
  static async analyze(input: SerpAnalyzeInput): Promise<SerpAnalyzeOutput> {
    const maxResults = input.maxResults ?? 100;
    const pythonBase = getPythonApiBase();

    const body = {
      keyword: input.keyword,
      location: input.location,
      device: input.device,
      max_results: maxResults,
    };

    const resp = await fetch(`${pythonBase}/api/serp/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => resp.statusText);
      throw new Error(`Python SERP API error ${resp.status}: ${text}`);
    }

    const json = (await resp.json()) as { results: SerpResultItem[]; features: SerpFeatures };
    const results = (json.results || []).map((r) => ({
      position: Number(r.position),
      url: r.url,
      title: r.title,
      type: r.type,
    }));

    const features: SerpFeatures = json.features || {
      featured_snippet: false,
      paa: false,
      video: false,
      images: false,
    };

    const normalizedDomain = normalizeDomain(input.targetDomain);
    const db = getDatabase();

    const previous = await db.getLatestSerpSnapshot(
      input.keyword,
      normalizedDomain,
      input.location,
      input.device,
    );

    const { position, rankingUrl, rankStatus: initialRankStatus } = detectRanking(results, input.targetDomain);

    let rankStatus: 'ranked' | 'not_ranked' | 'lost' = initialRankStatus;
    let change: number | null = null;
    let changeLabel: string | null = null;

    if (!previous) {
      changeLabel = 'New';
    } else if (previous.position != null && position != null) {
      change = previous.position - position;
      changeLabel = change > 0 ? `+${change}` : `${change}`;
    } else if (previous.position != null && position == null) {
      changeLabel = 'Lost';
      rankStatus = 'lost';
    } else if (previous.position == null && position != null) {
      changeLabel = 'New';
    }

    const competition = computeCompetition(results);
    const intent = detectIntent(results, input.keyword);

    const snapshot = await db.createSerpSnapshot({
      keyword: input.keyword,
      targetDomain: input.targetDomain,
      normalizedDomain,
      searchEngine: 'google',
      location: input.location,
      device: input.device,
      maxResults,
      position: position ?? null,
      rankingUrl: rankingUrl ?? null,
      rankStatus,
      change: change ?? null,
      changeLabel,
      intent,
      topCompetitors: competition,
      serpFeatures: features,
      serp: results,
      sessionId: input.sessionId ?? null,
    });

    return {
      keyword: snapshot.keyword,
      targetDomain: snapshot.targetDomain,
      normalizedDomain: snapshot.normalizedDomain,
      searchEngine: snapshot.searchEngine,
      location: snapshot.location,
      device: snapshot.device as 'desktop' | 'mobile',
      maxResults: snapshot.maxResults,
      runAt: snapshot.runAt,
      position: snapshot.position,
      rankingUrl: snapshot.rankingUrl,
      rankStatus: snapshot.rankStatus,
      change: snapshot.change,
      changeLabel: snapshot.changeLabel,
      intent: snapshot.intent,
      topCompetitors: snapshot.topCompetitors,
      serpFeatures: snapshot.serpFeatures,
      serp: snapshot.serp,
      sessionId: snapshot.sessionId ?? null,
    };
  }
}


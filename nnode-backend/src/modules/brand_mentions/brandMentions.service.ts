import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';
import { BrandMentionsRepository } from './brandMentions.repository';
import type {
  ScanRequestBody,
  ScanResult,
  DashboardData,
  MentionsListResponse,
  BrandMentionDoc,
  ListQueryParams,
} from './brandMentions.types';

// ─── SerpAPI helpers ──────────────────────────────────────────────────────────

interface SerpResult {
  title: string;
  link: string;
  snippet?: string;
}

interface SerpResponse {
  organic_results?: SerpResult[];
  error?: string;
}

function buildDefaultQueries(brandName: string, domain: string): string[] {
  return [
    `"${brandName}" -site:${domain}`,
    `"${domain}" -site:${domain}`,
    `"${brandName} SEO" -site:${domain}`,
    `"${brandName} reviews" -site:${domain}`,
    `"${brandName}" OR "${domain}" -site:${domain}`,
  ];
}

function extractSourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function fetchSerpResults(query: string, apiKey: string, num: number = 10): Promise<SerpResult[]> {
  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('engine', 'google');
  url.searchParams.set('num', String(num));
  url.searchParams.set('gl', 'us');
  url.searchParams.set('hl', 'en');

  const resp = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`SerpAPI error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as SerpResponse;

  if (data.error) {
    throw new Error(`SerpAPI: ${data.error}`);
  }

  return data.organic_results ?? [];
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class BrandMentionsService {
  private repo = new BrandMentionsRepository();

  async scan(userId: string, body: ScanRequestBody): Promise<ScanResult> {
    const apiKey = env.SERPAPI_KEY;

    if (!apiKey) {
      throw new Error('SERPAPI_KEY must be set in environment variables');
    }

    const { brandName, domain } = body;
    const queries = body.queries?.length
      ? body.queries
      : buildDefaultQueries(brandName, domain);

    const collected: Omit<BrandMentionDoc, '_id'>[] = [];
    const seenUrls = new Set<string>();

    for (const query of queries) {
      try {
        const items = await fetchSerpResults(query, apiKey);

        for (let i = 0; i < items.length; i++) {
          const item = items[i];

          // Skip own domain
          const srcDomain = extractSourceDomain(item.link);
          const ownDomain = domain.replace(/^www\./, '').toLowerCase();
          if (srcDomain === ownDomain || item.link.toLowerCase().includes(ownDomain)) continue;

          // Skip duplicates within this scan batch
          if (seenUrls.has(item.link)) continue;
          seenUrls.add(item.link);

          collected.push({
            userId,
            brandName,
            domain,
            query,
            rank: i + 1,
            found_url: item.link,
            title: item.title,
            snippet: item.snippet ?? '',
            source_domain: srcDomain,
            found_date: new Date(),
          });
        }
      } catch (err: any) {
        // Log and continue with remaining queries rather than aborting the whole scan
        logger.error(`[BRAND_MENTIONS] scan query "${query}" failed: ${err.message}`);
      }
    }

    const { inserted, skipped } = await this.repo.insertNew(collected);

    // Return only newly inserted results (map from collected, trim to inserted count)
    const newDocs = collected.slice(0, inserted + skipped).filter((_, idx) => idx < inserted);

    return {
      scanned_queries: queries.length,
      new_mentions: inserted,
      duplicate_skipped: skipped,
      results: newDocs.map((d, idx) => ({
        id: `scan-${idx}`,
        brandName: d.brandName,
        domain: d.domain,
        query: d.query,
        rank: d.rank,
        found_url: d.found_url,
        title: d.title,
        snippet: d.snippet,
        source_domain: d.source_domain,
        found_date: d.found_date.toISOString(),
      })),
    };
  }

  async list(userId: string, params: ListQueryParams): Promise<MentionsListResponse> {
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(params.limit ?? '20', 10)));

    const { mentions, total } = await this.repo.list(userId, params);
    return {
      mentions,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async dashboard(userId: string): Promise<DashboardData> {
    const { total, newLast7d, topDomains, recent } = await this.repo.dashboard(userId);
    return {
      total_mentions: total,
      new_mentions_last_7d: newLast7d,
      top_domains: topDomains,
      recent_mentions: recent,
    };
  }

  /** Returns RFC 4180 CSV string for all matching mentions */
  async exportCsv(userId: string, params: ListQueryParams): Promise<string> {
    const rows = await this.repo.exportAll(userId, params);

    const escapeCsv = (v: unknown): string => {
      const s = v != null ? String(v) : '';
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = ['brand_name', 'domain', 'query', 'rank', 'title', 'found_url', 'source_domain', 'snippet', 'found_date'];
    const lines: string[] = [header.join(',')];

    for (const r of rows) {
      lines.push(
        [r.brandName, r.domain, r.query, r.rank, r.title, r.found_url, r.source_domain, r.snippet, r.found_date]
          .map(escapeCsv)
          .join(','),
      );
    }

    return lines.join('\n');
  }

  /**
   * Free-form search — runs any raw query against SerpAPI and returns results.
   * Results are NOT saved to the database.
   */
  async search(query: string, num: number = 10): Promise<{
    query: string;
    total_results: number;
    results: { rank: number; title: string; url: string; snippet: string; source_domain: string }[];
  }> {
    const apiKey = env.SERPAPI_KEY;
    if (!apiKey) throw new Error('SERPAPI_KEY must be set in environment variables');

    const items = await fetchSerpResults(query, apiKey, Math.min(num, 100));

    return {
      query,
      total_results: items.length,
      results: items.map((item, i) => ({
        rank: i + 1,
        title: item.title,
        url: item.link,
        snippet: item.snippet ?? '',
        source_domain: extractSourceDomain(item.link),
      })),
    };
  }
}

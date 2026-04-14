/**
 * CSV export service — streams data from MongoDB as RFC 4180 CSV.
 * All exports include: domain column + timestamp column + data columns.
 */
import { connectToMongo } from '../../config/mongo';
import { JobRepository } from '../job/job.repository';
import type { CsvDataType } from './export.types';

function escapeCsv(v: unknown): string {
  const s = v != null ? String(v) : '';
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cols: unknown[]): string {
  return cols.map(escapeCsv).join(',') + '\n';
}

export class ExportCsvService {
  private jobRepo = new JobRepository();

  async generate(
    type: CsvDataType,
    jobId: string,
    domain: string,
    fromDate?: string,
    toDate?: string,
  ): Promise<string> {
    const db = await connectToMongo();
    const effectiveId = await this.jobRepo.resolveEffectiveJobId(jobId);

    const dateFilter = this.buildDateFilter(fromDate, toDate);

    switch (type) {
      case 'crawl-data':
        return this.crawlData(db, effectiveId, domain, dateFilter);
      case 'citations':
        return this.citationsData(db, effectiveId, domain, dateFilter);
      case 'prompts':
        return this.promptsData(db, effectiveId, domain, dateFilter);
      case 'competitors':
        return this.competitorsData(db, effectiveId, domain, dateFilter);
      case 'alerts':
        return this.alertsData(db, effectiveId, domain, dateFilter);
      default:
        throw new Error(`Unknown CSV type: ${type}`);
    }
  }

  private buildDateFilter(from?: string, to?: string): Record<string, unknown> | null {
    if (!from && !to) return null;
    const filter: Record<string, Date> = {};
    if (from) filter.$gte = new Date(from);
    if (to) { const t = new Date(to); t.setHours(23, 59, 59, 999); filter.$lte = t; }
    return filter;
  }

  private async crawlData(db: any, jobId: string, domain: string, dateFilter: any): Promise<string> {
    const query: any = { jobId };
    if (dateFilter) query.createdAt = dateFilter;

    const pages = await db.collection('pages').find(query, {
      projection: {
        url: 1,
        status_code: 1,
        statusCode: 1,
        title: 1,
        title_length: 1,
        meta_description: 1,
        description_length: 1,
        word_count: 1,
        crawl_depth: 1,
        canonical_url: 1,
        meta_robots: 1,
        response_time: 1,
        page_size_bytes: 1,
        h1: 1,
        h2_count: 1,
        internal_links_count: 1,
        external_links_count: 1,
        indexable: 1,
        redirect_url: 1,
        createdAt: 1,
      },
    }).limit(5000).toArray();

    const headers = row([
      'domain', 'timestamp', 'url', 'status_code', 'title', 'title_length',
      'meta_description', 'description_length', 'word_count', 'crawl_depth',
      'canonical_url', 'meta_robots', 'response_time_ms', 'page_size_bytes',
      'h1', 'h2_count', 'internal_links', 'external_links', 'indexable', 'redirect_url',
    ]);
    const dataRows = pages.map((p: any) =>
      row([
        domain,
        p.createdAt ? new Date(p.createdAt).toISOString() : '',
        p.url ?? '',
        p.status_code ?? p.statusCode ?? '',
        p.title ?? '',
        p.title_length ?? '',
        p.meta_description ?? '',
        p.description_length ?? '',
        p.word_count ?? '',
        p.crawl_depth ?? '',
        p.canonical_url ?? '',
        p.meta_robots ?? '',
        p.response_time ?? '',
        p.page_size_bytes ?? '',
        p.h1 ?? '',
        p.h2_count ?? '',
        p.internal_links_count ?? '',
        p.external_links_count ?? '',
        p.indexable !== undefined ? (p.indexable ? 'yes' : 'no') : '',
        p.redirect_url ?? '',
      ]),
    );
    return headers + dataRows.join('');
  }

  private async citationsData(db: any, jobId: string, domain: string, dateFilter: any): Promise<string> {
    const moduleE = await db.collection('module_e').findOne({ jobId });
    // frequency_trend is the per-date citation trend
    const mentions: any[] = (moduleE as any)?.brand_analysis?.frequency_trend ?? [];
    const brandName: string = (moduleE as any)?.brand_analysis?.brand_name ?? '';
    const totalMentions: number = (moduleE as any)?.brand_analysis?.total_mentions ?? 0;
    const sentimentLabel: string = (moduleE as any)?.brand_analysis?.sentiment?.label ?? '';

    const filtered = dateFilter
      ? mentions.filter((m: any) => {
          if (!m.date) return true;
          const d = new Date(m.date);
          if (dateFilter.$gte && d < dateFilter.$gte) return false;
          if (dateFilter.$lte && d > dateFilter.$lte) return false;
          return true;
        })
      : mentions;

    const headers = row(['domain', 'timestamp', 'brand_name', 'total_mentions', 'overall_sentiment', 'date', 'citation_count', 'model', 'source']);
    const dataRows = filtered.map((m: any) =>
      row([domain, new Date().toISOString(), brandName, totalMentions, sentimentLabel, m.date ?? '', m.count ?? '', m.model ?? 'all', m.source ?? '']),
    );
    return headers + dataRows.join('');
  }

  private async promptsData(db: any, jobId: string, domain: string, dateFilter: any): Promise<string> {
    const query: any = { jobId };
    if (dateFilter) query.created_at = dateFilter;

    const prompts = await db.collection('prompt_tracking').find(query, {
      projection: { prompt: 1, model: 1, rank: 1, cited: 1, citation_count: 1, credibility_score: 1, mention_status: 1, percentile: 1, created_at: 1 },
    }).limit(2000).toArray();

    const headers = row(['domain', 'timestamp', 'prompt', 'model', 'rank', 'cited', 'citation_count', 'credibility_score', 'mention_status', 'percentile']);
    const dataRows = prompts.map((p: any) =>
      row([
        domain,
        p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
        p.prompt ?? '',
        p.model ?? '',
        p.rank ?? '',
        p.cited ? 'yes' : 'no',
        p.citation_count ?? '',
        p.credibility_score ?? '',
        p.mention_status ?? '',
        p.percentile ?? '',
      ]),
    );
    return headers + dataRows.join('');
  }

  private async competitorsData(db: any, jobId: string, domain: string, _dateFilter: any): Promise<string> {
    const jobRepo = new JobRepository();
    const effectiveId = await jobRepo.resolveEffectiveJobId(jobId);
    
    // Try to find Module F result first
    const fDoc = await db.collection('module_f').findOne({ 
      $or: [{ jobId: jobId }, { jobId: effectiveId }] 
    });
    
    const compareVis = fDoc?.compare_visibility_against_competitors ?? {};
    const brandData = compareVis.brand ?? {};
    const competitors: any[] = compareVis.competitors ?? [];
    
    // Fallback to Module E if Module F is empty
    if (competitors.length === 0) {
      const moduleE = await db.collection('module_e').findOne({ jobId });
      const eCompetitors: any[] = (moduleE as any)?.competitor_mentions?.data ?? [];
      const brandSov: number = (moduleE as any)?.ai_share_of_voice?.overall_sov ?? 0;

      const headers = row(['domain', 'timestamp', 'brand_overall_sov', 'competitor', 'mention_count', 'sentiment', 'trend_direction', 'models_cited']);
      const dataRows = eCompetitors.map((c: any) => {
        const trend: number[] = Array.isArray(c.trend) ? c.trend : [];
        const trendDir = trend.length > 1
          ? (trend[trend.length - 1] > trend[0] ? 'UP' : trend[trend.length - 1] < trend[0] ? 'DOWN' : 'STABLE')
          : '';
        return row([
          domain,
          new Date().toISOString(),
          brandSov.toFixed(2),
          c.name ?? c.domain ?? c.brand ?? '',
          c.mention_count ?? c.mentions ?? c.total_mentions ?? '',
          c.sentiment?.label ?? c.sentiment ?? '',
          trendDir,
          Array.isArray(c.models) ? c.models.join(';') : '',
        ]);
      });
      return headers + dataRows.join('');
    }

    // Module F data
    const headers = row(['domain', 'timestamp', 'competitor', 'primary_model', 'sov_percent', 'sov_delta', 'citations', 'citation_delta', 'visibility_score', 'avg_rank']);
    
    const brandRow = row([
      domain,
      new Date().toISOString(),
      'YOUR BRAND',
      brandData.primary_model ?? 'n/a',
      (brandData.market_share_percent ?? 0).toFixed(2),
      (brandData.market_share_delta ?? 0).toFixed(2),
      brandData.mentions_total ?? 0,
      brandData.mentions_delta ?? 0,
      (brandData.visibility_score ?? 0).toFixed(2),
      brandData.avg_rank ?? '—',
    ]);

    const compRows = competitors.map((c: any) => {
      return row([
        domain,
        new Date().toISOString(),
        c.name ?? '—',
        c.primary_model ?? 'n/a',
        (c.market_share_percent ?? 0).toFixed(2),
        (c.market_share_delta ?? 0).toFixed(2),
        c.mentions_total ?? 0,
        c.mentions_delta ?? 0,
        (c.visibility_score ?? 0).toFixed(2),
        c.avg_rank ?? '—',
      ]);
    });
    
    return headers + brandRow + compRows.join('');
  }

  private async alertsData(db: any, jobId: string, domain: string, dateFilter: any): Promise<string> {
    const query: any = { jobId };
    if (dateFilter) query.triggered_at = dateFilter;

    const alerts = await db.collection('cbm_alerts').find(query, {
      projection: { alert_type: 1, severity: 1, message: 1, triggered_at: 1, resolved_at: 1, is_dismissed: 1 },
    }).limit(2000).toArray();

    const headers = row(['domain', 'timestamp', 'alert_type', 'severity', 'message', 'triggered_at', 'resolved_at', 'dismissed']);
    const dataRows = alerts.map((a: any) =>
      row([
        domain,
        a.triggered_at ? new Date(a.triggered_at).toISOString() : new Date().toISOString(),
        a.alert_type ?? '',
        a.severity ?? '',
        a.message ?? '',
        a.triggered_at ? new Date(a.triggered_at).toISOString() : '',
        a.resolved_at ? new Date(a.resolved_at).toISOString() : '',
        a.is_dismissed ? 'yes' : 'no',
      ]),
    );
    return headers + dataRows.join('');
  }
}

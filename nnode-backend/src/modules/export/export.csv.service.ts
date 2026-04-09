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
        return this.competitorsData(db, effectiveId, domain);
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
      projection: { url: 1, status_code: 1, title: 1, meta_description: 1, word_count: 1, crawl_depth: 1, createdAt: 1 },
    }).limit(5000).toArray();

    const headers = row(['domain', 'timestamp', 'url', 'status_code', 'title', 'meta_description', 'word_count', 'crawl_depth']);
    const dataRows = pages.map((p: any) =>
      row([
        domain,
        p.createdAt ? new Date(p.createdAt).toISOString() : '',
        p.url ?? '',
        p.status_code ?? p.statusCode ?? '',
        p.title ?? '',
        p.meta_description ?? '',
        p.word_count ?? '',
        p.crawl_depth ?? '',
      ]),
    );
    return headers + dataRows.join('');
  }

  private async citationsData(db: any, jobId: string, domain: string, dateFilter: any): Promise<string> {
    const query: any = { jobId };
    if (dateFilter) query.createdAt = dateFilter;

    // Pull from module_e brand_analysis
    const moduleE = await db.collection('module_e').findOne({ jobId });
    const mentions: any[] = (moduleE as any)?.brand_analysis?.frequency_trend ?? [];

    const headers = row(['domain', 'timestamp', 'date', 'citation_count', 'model', 'source']);
    const dataRows = mentions.map((m: any) =>
      row([domain, new Date().toISOString(), m.date ?? '', m.count ?? '', m.model ?? 'all', m.source ?? '']),
    );
    return headers + dataRows.join('');
  }

  private async promptsData(db: any, jobId: string, domain: string, dateFilter: any): Promise<string> {
    const query: any = { jobId };
    if (dateFilter) query.created_at = dateFilter;

    const prompts = await db.collection('prompt_tracking').find(query, {
      projection: { prompt: 1, model: 1, rank: 1, cited: 1, created_at: 1 },
    }).limit(2000).toArray();

    const headers = row(['domain', 'timestamp', 'prompt', 'model', 'rank', 'cited']);
    const dataRows = prompts.map((p: any) =>
      row([
        domain,
        p.created_at ? new Date(p.created_at).toISOString() : new Date().toISOString(),
        p.prompt ?? '',
        p.model ?? '',
        p.rank ?? '',
        p.cited ? 'yes' : 'no',
      ]),
    );
    return headers + dataRows.join('');
  }

  private async competitorsData(db: any, jobId: string, domain: string): Promise<string> {
    const moduleE = await db.collection('module_e').findOne({ jobId });
    const competitors: any[] = (moduleE as any)?.competitor_mentions ?? [];

    const headers = row(['domain', 'timestamp', 'competitor', 'mention_count', 'sentiment', 'models_cited']);
    const dataRows = competitors.map((c: any) =>
      row([
        domain,
        new Date().toISOString(),
        c.domain ?? c.brand ?? '',
        c.mention_count ?? c.total_mentions ?? '',
        c.sentiment?.label ?? '',
        Array.isArray(c.models) ? c.models.join(';') : '',
      ]),
    );
    return headers + dataRows.join('');
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

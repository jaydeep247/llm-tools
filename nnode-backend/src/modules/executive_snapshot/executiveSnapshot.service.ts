import { getMongoDb } from '../../config/mongo';
import { JobRepository } from '../job/job.repository';
import { JobService } from '../job/job.service';
import { JobStatus } from '../job/job.types';
import { logger } from '../../shared/logger/logger';
import type {
  ExecutiveSnapshotResponse,
  KpiStatus,
  ImpactLevel,
  EffortLevel,
  TopAction,
} from './executiveSnapshot.types';

const CATEGORY_TO_MODULE_LINK: Record<string, string> = {
  schema: 'structured-data',
  structured_data: 'structured-data',
  meta: 'technical-audit',
  seo: 'technical-audit',
  title: 'technical-audit',
  description: 'technical-audit',
  redirect: 'technical-audit',
  canonical: 'technical-audit',
  content: 'content-audit',
  readability: 'content-audit',
  links: 'url-explorer',
  performance: 'performance',
  heading: 'content-audit',
};

const CATEGORY_TO_EFFORT: Record<string, EffortLevel> = {
  schema: 'LOW',
  structured_data: 'LOW',
  meta: 'LOW',
  title: 'LOW',
  description: 'LOW',
  canonical: 'LOW',
  redirect: 'MEDIUM',
  content: 'HIGH',
  readability: 'MEDIUM',
  links: 'MEDIUM',
  performance: 'MEDIUM',
  heading: 'LOW',
  seo: 'LOW',
};

function resolveStatus(score: number | null): KpiStatus {
  if (score === null) return 'NEEDS_ATTENTION';
  if (score >= 80) return 'HEALTHY';
  if (score >= 60) return 'NEEDS_ATTENTION';
  return 'AT_RISK';
}

function resolveImpact(severity: string): ImpactLevel {
  if (severity === 'critical') return 'HIGH';
  if (severity === 'warning') return 'MEDIUM';
  return 'LOW';
}

function resolveEffort(category: string): EffortLevel {
  const key = (category || '').toLowerCase().replace(/\s+/g, '_');
  return CATEGORY_TO_EFFORT[key] ?? 'MEDIUM';
}

function resolveModuleLink(category: string): string {
  const key = (category || '').toLowerCase().replace(/\s+/g, '_');
  return CATEGORY_TO_MODULE_LINK[key] ?? 'technical-audit';
}

interface KpiData {
  aivs_score: number | null;
  health_score: number | null;
  citation_count: number | null;
  sov_percent: number | null;
  pages_crawled: number | null;
  last_crawl: string | null;
  crawl_status: 'success' | 'failed' | 'running' | 'pending' | null;
}

async function fetchKpiData(db: ReturnType<typeof getMongoDb>, jobId: string): Promise<KpiData> {
  const [aivsDoc, healthAgg, citationAgg, jobSummary] = await Promise.all([
    // AIVS score from module_c
    db
      .collection('module_c')
      .findOne({ jobId }, { projection: { overall_score: 1 }, sort: { timestamp: -1 } } as any),

    // Health score: average across all pages in fields
    db
      .collection('fields')
      .aggregate([
        { $match: { jobId } },
        {
          $group: {
            _id: null,
            avg_health_score: {
              $avg: { $ifNull: ['$recommendations.health_score', 100] },
            },
          },
        },
      ])
      .toArray(),

    db
      .collection('cbm_citation_snapshots')
      .aggregate([
        { $match: { jobId, entityType: 'client' } },
        {
          $group: {
            _id: null,
            citations: { $sum: { $cond: [{ $eq: ['$citationPresent', true] }, 1, 0] } },
            sovSum: { $sum: { $cond: [{ $isNumber: '$shareOfVoice' }, '$shareOfVoice', 0] } },
            sovN: { $sum: { $cond: [{ $isNumber: '$shareOfVoice' }, 1, 0] } },
          },
        },
      ])
      .toArray(),

    // Crawl stats from job_summaries
    db
      .collection('job_summaries')
      .findOne({ jobId }, { projection: { total_pages: 1, crawl_status: 1, completed_at: 1 } }),
  ]);

  const aivsScore =
    typeof aivsDoc?.overall_score === 'number' ? Math.round(aivsDoc.overall_score) : null;
  const healthScore =
    healthAgg.length > 0 && healthAgg[0]?.avg_health_score != null
      ? Math.round(healthAgg[0].avg_health_score)
      : null;
  const citationCount =
    citationAgg.length > 0 && typeof (citationAgg[0] as any)?.citations === 'number'
      ? (citationAgg[0] as any).citations
      : null;
  const sovPercent =
    citationAgg.length > 0 &&
    typeof (citationAgg[0] as any)?.sovSum === 'number' &&
    typeof (citationAgg[0] as any)?.sovN === 'number' &&
    (citationAgg[0] as any).sovN > 0
      ? parseFloat((((citationAgg[0] as any).sovSum / (citationAgg[0] as any).sovN) as number).toFixed(1))
      : null;

  const rawCrawlStatus = (jobSummary as any)?.crawl_status ?? null;
  const mappedCrawlStatus: KpiData['crawl_status'] =
    rawCrawlStatus === 'completed' || rawCrawlStatus === 'success'
      ? 'success'
      : rawCrawlStatus === 'failed' || rawCrawlStatus === 'error'
      ? 'failed'
      : rawCrawlStatus === 'running'
      ? 'running'
      : rawCrawlStatus === 'pending'
      ? 'pending'
      : null;

  const pagesCount =
    typeof (jobSummary as any)?.total_pages === 'number'
      ? (jobSummary as any).total_pages
      : null;

  const completedAt =
    typeof (jobSummary as any)?.completed_at === 'string'
      ? (jobSummary as any).completed_at
      : null;

  return {
    aivs_score: aivsScore,
    health_score: healthScore,
    citation_count: citationCount,
    sov_percent: sovPercent,
    pages_crawled: pagesCount,
    last_crawl: completedAt,
    crawl_status: mappedCrawlStatus,
  };
}

async function fetchTopActions(db: ReturnType<typeof getMongoDb>, jobId: string): Promise<TopAction[]> {
  // Aggregate all recommendations across all pages, group by title, prioritise by severity
  const rows = await db
    .collection('fields')
    .aggregate([
      { $match: { jobId } },
      { $unwind: { path: '$recommendations.recommendations', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: '$recommendations.recommendations.title',
          title: { $first: '$recommendations.recommendations.title' },
          issue: { $first: '$recommendations.recommendations.issue' },
          fix: { $first: '$recommendations.recommendations.fix' },
          severity: { $first: '$recommendations.recommendations.severity' },
          category: { $first: '$recommendations.recommendations.category' },
          page_count: { $sum: 1 },
        },
      },
      {
        $addFields: {
          severity_order: {
            $switch: {
              branches: [
                { case: { $eq: ['$severity', 'critical'] }, then: 1 },
                { case: { $eq: ['$severity', 'warning'] }, then: 2 },
              ],
              default: 3,
            },
          },
        },
      },
      { $sort: { severity_order: 1, page_count: -1 } },
      { $limit: 3 },
    ])
    .toArray();

  return rows.map((row: any): TopAction => ({
    title: row.title ?? 'Review this item',
    issue: row.issue ?? '',
    impact: resolveImpact(row.severity),
    effort: resolveEffort(row.category),
    urgency: row.severity === 'critical' ? 'HIGH' : row.severity === 'warning' ? 'MEDIUM' : 'LOW',
    module_link: resolveModuleLink(row.category),
    category: row.category ?? 'general',
    severity: row.severity ?? 'info',
    page_count: row.page_count ?? 0,
  }));
}

export class ExecutiveSnapshotService {
  private jobRepository = new JobRepository();
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
  }

  async getSnapshot(userId: string, jobId: string, periodDays: number = 7): Promise<ExecutiveSnapshotResponse> {
    // Validate ownership
    const job = await this.jobService.getJobById(userId, jobId);
    const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
    const db = getMongoDb();

    // Fetch current KPIs and top actions in parallel
    const [current, topActions] = await Promise.all([
      fetchKpiData(db, effectiveId),
      fetchTopActions(db, effectiveId),
    ]);

    // Derive has_data: true if at least one KPI has a non-null value
    const hasData =
      current.aivs_score !== null ||
      current.health_score !== null ||
      current.citation_count !== null ||
      current.sov_percent !== null;

    // ── Delta computation ────────────────────────────────────────────────────
    // Find the most recent COMPLETED job for this project BEFORE the current job
    let aivsBaseline: number | null = null;
    let healthBaseline: number | null = null;
    let citationBaseline: number | null = null;
    let sovBaseline: number | null = null;

    try {
      const baselineCutoff = new Date(job.createdAt);
      baselineCutoff.setDate(baselineCutoff.getDate() - Math.max(1, periodDays));

      const previousJob = await db
        .collection('jobs')
        .findOne(
          {
            projectId: job.projectId,
            id: { $ne: effectiveId },
            status: JobStatus.COMPLETED,
            createdAt: { $lt: baselineCutoff },
          },
          { sort: { createdAt: -1 } },
        );

      if (previousJob) {
        const prevEffectiveId = previousJob.cacheSourceJobId
          ? String(previousJob.cacheSourceJobId)
          : String((previousJob as any).id);
        const baseline = await fetchKpiData(db, prevEffectiveId);
        aivsBaseline = baseline.aivs_score;
        healthBaseline = baseline.health_score;
        citationBaseline = baseline.citation_count;
        sovBaseline = baseline.sov_percent;
      }
    } catch (err) {
      logger.warn('[EXECUTIVE_SNAPSHOT] Delta computation failed, returning null deltas:', err);
    }

    return {
      aivs_score: current.aivs_score,
      aivs_delta:
        current.aivs_score !== null && aivsBaseline !== null
          ? parseFloat((current.aivs_score - aivsBaseline).toFixed(1))
          : null,
      aivs_status: resolveStatus(current.aivs_score),

      health_score: current.health_score,
      health_delta:
        current.health_score !== null && healthBaseline !== null
          ? parseFloat((current.health_score - healthBaseline).toFixed(1))
          : null,
      health_status: resolveStatus(current.health_score),

      citation_count: current.citation_count,
      citation_delta:
        current.citation_count !== null && citationBaseline !== null
          ? current.citation_count - citationBaseline
          : null,

      sov_percent: current.sov_percent,
      sov_delta:
        current.sov_percent !== null && sovBaseline !== null
          ? parseFloat((current.sov_percent - sovBaseline).toFixed(1))
          : null,

      last_crawl: current.last_crawl,
      crawl_status: current.crawl_status,
      pages_crawled: current.pages_crawled,

      top_actions: topActions,
      has_data: hasData,
      snapshot_date: new Date().toISOString(),
    };
  }
}

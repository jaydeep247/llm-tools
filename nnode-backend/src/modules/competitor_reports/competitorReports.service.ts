import { connectToMongo } from '../../config/mongo';
import { ProjectService } from '../project/project.service';
import { logger } from '../../shared/logger/logger';
import type { CRPeriod, CompetitorReportsResponse, CompetitorReportRow, CompetitorTopPagesBlock } from './competitorReports.types';

function normalizeModelName(m: string): string {
  const s = String(m || '').trim().toLowerCase();
  if (s.includes('chatgpt') || s.includes('openai')) return 'ChatGPT';
  if (s.includes('gemini') || s.includes('bard')) return 'Gemini';
  if (s.includes('perplex')) return 'Perplexity';
  if (s.includes('claude') || s.includes('anthropic')) return 'Claude';
  return m ? String(m) : 'Unknown';
}

export class CompetitorReportsService {
  private projectService = new ProjectService();

  async getReport(userId: string, projectId: string, period: CRPeriod = '7d'): Promise<CompetitorReportsResponse> {
    await this.projectService.getProjectById(projectId, userId);
    const periodDays = period === '30d' ? 30 : 7;

    const db = await connectToMongo();

    // Resolve current + baseline job IDs using createdAt cutoff (matches PDF "Last 7/30 days" baseline logic).
    const currentJob = await db.collection('jobs').findOne(
      { projectId, status: 'COMPLETED' },
      { sort: { createdAt: -1 }, projection: { id: 1, createdAt: 1 } },
    );
    if (!currentJob?.id || !currentJob?.createdAt) {
      return {
        meta: {
          project_id: projectId,
          period,
          period_days: periodDays,
          current_job_id: '',
          prior_job_id: '',
          compared_to_label: '',
        },
        competitors: [],
        top_pages: [],
      };
    }

    const baselineCutoff = new Date(currentJob.createdAt);
    baselineCutoff.setDate(baselineCutoff.getDate() - periodDays);
    const priorJob = await db.collection('jobs').findOne(
      { projectId, status: 'COMPLETED', createdAt: { $lte: baselineCutoff } },
      { sort: { createdAt: -1 }, projection: { id: 1, createdAt: 1 } },
    );

    const currentJobId = String(currentJob.id);
    const priorJobId = priorJob?.id ? String(priorJob.id) : '';

    // Aggregate SoV + citations per competitor per model for both jobs.
    type RowAgg = {
      competitor: string;
      model: string;
      citations: number;
      sovAvg: number | null;
    };

    const aggForJob = async (jobId: string): Promise<RowAgg[]> => {
      const rows = await db.collection('cbm_citation_snapshots').aggregate([
        { $match: { projectId, jobId, entityType: 'competitor' } },
        {
          $group: {
            _id: { competitor: '$entityName', model: '$llmModel' },
            citations: { $sum: { $cond: [{ $eq: ['$citationPresent', true] }, 1, 0] } },
            sovAvg: { $avg: '$shareOfVoice' },
          },
        },
        {
          $project: {
            _id: 0,
            competitor: '$_id.competitor',
            model: '$_id.model',
            citations: 1,
            sovAvg: 1,
          },
        },
      ]).toArray();
      return rows as any;
    };

    const [curAgg, priAgg] = await Promise.all([
      aggForJob(currentJobId),
      priorJobId ? aggForJob(priorJobId) : Promise.resolve([] as RowAgg[]),
    ]);

    const byKey = (rows: RowAgg[]) => {
      const out = new Map<string, RowAgg>();
      for (const r of rows) {
        const competitor = String(r.competitor || '').trim();
        if (!competitor) continue;
        const model = normalizeModelName(String(r.model || 'Unknown'));
        out.set(`${competitor}||${model}`, { ...r, competitor, model });
      }
      return out;
    };

    const curMap = byKey(curAgg);
    const priMap = byKey(priAgg);
    const allKeys = new Set([...curMap.keys(), ...priMap.keys()]);

    const byCompetitor: Record<string, CompetitorReportRow> = {};
    const ensure = (name: string): CompetitorReportRow => {
      if (!byCompetitor[name]) {
        byCompetitor[name] = {
          name,
          per_model: {},
          citations_total: 0,
          citations_prev_total: 0,
          citations_delta_total: 0,
          sov_avg_percent: null,
          sov_prev_avg_percent: null,
          sov_delta_avg: null,
        };
      }
      return byCompetitor[name];
    };

    // Track sums for sov averages (ignore nulls)
    const sovSumCur: Record<string, { sum: number; n: number }> = {};
    const sovSumPri: Record<string, { sum: number; n: number }> = {};

    for (const key of allKeys) {
      const c = curMap.get(key);
      const p = priMap.get(key);
      const competitor = (c?.competitor ?? p?.competitor ?? '').trim();
      const model = (c?.model ?? p?.model ?? 'Unknown').trim();
      if (!competitor) continue;
      const row = ensure(competitor);

      const citations = c?.citations ?? 0;
      const citations_prev = p?.citations ?? 0;
      const citations_delta = citations - citations_prev;

      const sov_percent = typeof c?.sovAvg === 'number' ? parseFloat((c!.sovAvg as number).toFixed(2)) : null;
      const sov_prev_percent = typeof p?.sovAvg === 'number' ? parseFloat((p!.sovAvg as number).toFixed(2)) : null;
      const sov_delta =
        sov_percent !== null && sov_prev_percent !== null
          ? parseFloat((sov_percent - sov_prev_percent).toFixed(2))
          : null;

      row.per_model[model] = {
        citations,
        citations_prev,
        citations_delta,
        sov_percent,
        sov_prev_percent,
        sov_delta,
      };

      row.citations_total += citations;
      row.citations_prev_total += citations_prev;

      if (sov_percent !== null) {
        sovSumCur[competitor] = sovSumCur[competitor] ?? { sum: 0, n: 0 };
        sovSumCur[competitor].sum += sov_percent;
        sovSumCur[competitor].n += 1;
      }
      if (sov_prev_percent !== null) {
        sovSumPri[competitor] = sovSumPri[competitor] ?? { sum: 0, n: 0 };
        sovSumPri[competitor].sum += sov_prev_percent;
        sovSumPri[competitor].n += 1;
      }
    }

    const competitors: CompetitorReportRow[] = Object.values(byCompetitor).map((r) => {
      r.citations_delta_total = r.citations_total - r.citations_prev_total;
      const cur = sovSumCur[r.name];
      const pri = sovSumPri[r.name];
      r.sov_avg_percent = cur && cur.n > 0 ? parseFloat((cur.sum / cur.n).toFixed(2)) : null;
      r.sov_prev_avg_percent = pri && pri.n > 0 ? parseFloat((pri.sum / pri.n).toFixed(2)) : null;
      r.sov_delta_avg =
        r.sov_avg_percent !== null && r.sov_prev_avg_percent !== null
          ? parseFloat((r.sov_avg_percent - r.sov_prev_avg_percent).toFixed(2))
          : null;
      return r;
    });

    competitors.sort((a, b) => (b.sov_avg_percent ?? 0) - (a.sov_avg_percent ?? 0));

    // Top cited competitor pages (current job).
    const topPageRows = await db.collection('cbm_competitor_cited_urls').aggregate([
      { $match: { projectId, jobId: currentJobId } },
      { $sort: { citationCount: -1 } },
      {
        $group: {
          _id: '$competitorName',
          pages: {
            $push: {
              url: '$citedUrl',
              citation_count: '$citationCount',
              primary_model: '$llmModel',
              page_title: '$pageTitle',
              content_type: '$contentType',
            },
          },
        },
      },
      { $project: { _id: 0, name: '$_id', pages: { $slice: ['$pages', 5] } } },
    ]).toArray();

    const top_pages: CompetitorTopPagesBlock[] = (topPageRows as any[]).map((r) => ({
      name: String(r.name),
      pages: Array.isArray(r.pages) ? r.pages.map((p: any) => ({
        url: String(p.url),
        citation_count: Number(p.citation_count) || 0,
        primary_model: normalizeModelName(String(p.primary_model || 'Unknown')),
        page_title: p.page_title ?? null,
        content_type: p.content_type ?? null,
      })) : [],
    }));

    const comparedLabel = priorJobId ? `Compared to ${priorJobId}` : 'Current analysis snapshot';
    logger.info(`[COMPETITOR_REPORTS] project=${projectId} period=${period} cur=${currentJobId} prior=${priorJobId} competitors=${competitors.length}`);

    return {
      meta: {
        project_id: projectId,
        period,
        period_days: periodDays,
        current_job_id: currentJobId,
        prior_job_id: priorJobId,
        compared_to_label: comparedLabel,
      },
      competitors,
      top_pages,
    };
  }
}


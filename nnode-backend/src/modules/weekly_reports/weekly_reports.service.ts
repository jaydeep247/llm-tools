import { randomUUID } from 'crypto';
import { connectToMongo } from '../../config/mongo';
import { logger } from '../../shared/logger/logger';
import { WinsLossesService } from '../wins_losses/winsLosses.service';
import { JobService } from '../job/job.service';
import { ProjectService } from '../project/project.service';
import type {
  WeeklyReportData,
  WeeklyReportDoc,
  WeeklyReportLossRow,
  WeeklyReportWinRow,
} from './weekly_reports.types';

const COLLECTION = 'weekly_reports';
const PERIOD_DAYS = 7;

/** Last completed Mon–Sun week in UTC (for week_start / week_end labels). */
export function lastCompletedWeekRangeUtc(ref = new Date()): { weekStart: string; weekEnd: string } {
  const utc = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = utc.getUTCDay();
  const daysSinceLastSunday = dow === 0 ? 7 : dow;
  const end = new Date(utc);
  end.setUTCDate(utc.getUTCDate() - daysSinceLastSunday);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  };
}

function impactOrder(impact: string): number {
  if (/high/i.test(impact)) return 3;
  if (/medium/i.test(impact)) return 2;
  return 1;
}

function pickRecommendations(moduleEDoc: Record<string, any> | null | undefined): WeeklyReportData['recommendations'] {
  const out: WeeklyReportData['recommendations'] = [];
  const pushFrom = (recs: any[] | undefined, link: string) => {
    if (!Array.isArray(recs)) return;
    for (const r of recs) {
      if (!r?.title) continue;
      out.push({
        action: r.title,
        impact: String(r.impact ?? 'LOW'),
        effort: String(r.effort ?? 'MEDIUM'),
        module_link: link,
      });
    }
  };
  pushFrom(moduleEDoc?.citations_recommendations?.recommendations, 'prompt-opportunities');
  pushFrom(moduleEDoc?.sov_recommendations?.recommendations, 'share-of-voice');
  pushFrom(moduleEDoc?.tracked_prompts_recommendations?.recommendations, 'keyword-intelligence');
  out.sort((a, b) => impactOrder(b.impact) - impactOrder(a.impact));
  return out.slice(0, 3);
}

export class WeeklyReportsService {
  private winsLosses = new WinsLossesService();
  private jobService = new JobService();
  private projectService = new ProjectService();

  async ensureIndexes(): Promise<void> {
    try {
      const db = await connectToMongo();
      await db.collection(COLLECTION).createIndex({ projectId: 1, weekStart: 1 }, { unique: true });
      await db.collection(COLLECTION).createIndex({ id: 1 }, { unique: true });
    } catch (e: any) {
      logger.warn(`[WEEKLY_REPORTS] index ensure: ${e?.message}`);
    }
  }

  async listForProject(userId: string, projectId: string, limit = 12): Promise<WeeklyReportDoc[]> {
    await this.projectService.getProjectById(projectId, userId);
    const db = await connectToMongo();
    const rows = await db
      .collection(COLLECTION)
      .find({ projectId })
      .sort({ weekStart: -1 })
      .limit(Math.min(Math.max(limit, 1), 52))
      .toArray();
    return rows.map((r) => this.toDoc(r));
  }

  async getById(userId: string, reportId: string): Promise<WeeklyReportDoc | null> {
    const db = await connectToMongo();
    const row = await db.collection(COLLECTION).findOne({ id: reportId });
    if (!row) return null;
    await this.projectService.getProjectById(row.projectId as string, userId);
    return this.toDoc(row);
  }

  private toDoc(row: any): WeeklyReportDoc {
    return {
      id: row.id,
      projectId: row.projectId,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      jobId: row.jobId,
      reportData: row.reportData,
      generatedAt: row.generatedAt instanceof Date ? row.generatedAt : new Date(row.generatedAt),
      deliveredVia: row.deliveredVia ?? null,
    };
  }

  async buildReportData(userId: string, jobId: string, domainLabel: string): Promise<WeeklyReportData> {
    const wl = await this.winsLosses.getWinsLosses(jobId, userId, PERIOD_DAYS);

    const metrics =
      Array.isArray(wl.all_metrics) && wl.all_metrics.length > 0
        ? wl.all_metrics
        : [...(wl.wins ?? []), ...(wl.losses ?? [])];

    const wins: WeeklyReportWinRow[] = (wl.wins ?? []).slice(0, 3).map((r) => ({
      metric: r.metric,
      model: r.model,
      previous: r.prev,
      current: r.current,
      delta: r.delta,
    }));

    const losses: WeeklyReportLossRow[] = (wl.losses ?? []).slice(0, 3).map((r) => ({
      metric: r.metric,
      model: r.model,
      previous: r.prev,
      current: r.current,
      delta: r.delta,
      fix_title: r.fix?.title ?? null,
      fix_link: r.fix?.link ?? null,
    }));

    let aivsScore: number | null = null;
    let aivsDelta: number | null = null;
    let sovSum = 0;
    let sovPrevSum = 0;
    let sovN = 0;
    let visSum = 0;
    let visPrevSum = 0;
    let visN = 0;

    const job = await this.jobService.getJobById(userId, jobId);
    const projectId = (job as any).projectId as string;
    const db = await connectToMongo();

    const now = new Date();
    const currentFrom = new Date(now);
    currentFrom.setDate(currentFrom.getDate() - PERIOD_DAYS);
    const priorFrom = new Date(now);
    priorFrom.setDate(priorFrom.getDate() - PERIOD_DAYS * 2);

    let citationCount: number;
    let citationPrev: number;
    if (wl.has_baseline && metrics.length > 0) {
      let cc = 0;
      let cp = 0;
      for (const r of metrics) {
        if (r.category === 'Citations') {
          cc += r.current;
          cp += r.prev;
        }
      }
      citationCount = cc;
      citationPrev = cp;
    } else {
      [citationCount, citationPrev] = await Promise.all([
        db.collection('cbm_citation_snapshots').countDocuments({
          projectId,
          entityType: 'client',
          createdAt: { $gte: currentFrom },
          citationPresent: true,
        }),
        db.collection('cbm_citation_snapshots').countDocuments({
          projectId,
          entityType: 'client',
          createdAt: { $gte: priorFrom, $lt: currentFrom },
          citationPresent: true,
        }),
      ]);
    }

    for (const r of metrics) {
      if (r.category === 'AIVS' && r.model === 'Overall') {
        aivsScore = r.current;
        aivsDelta = r.delta;
      }
      if (r.category === 'Share of Voice') {
        sovSum += r.current;
        sovPrevSum += r.prev;
        sovN += 1;
      }
      if (r.category === 'Visibility') {
        visSum += r.current;
        visPrevSum += r.prev;
        visN += 1;
      }
    }

    const sovPercent = sovN > 0 ? parseFloat((sovSum / sovN).toFixed(2)) : null;
    const sovDelta =
      sovN > 0 ? parseFloat(((sovSum - sovPrevSum) / sovN).toFixed(2)) : null;

    const visAvg = visN > 0 ? visSum / visN : null;
    const visPrevAvg = visN > 0 ? visPrevSum / visN : null;
    const visDeltaAvg =
      visN > 0 && visPrevAvg !== null
        ? parseFloat((visAvg! - visPrevAvg).toFixed(2))
        : null;

    let healthScore: number | null = null;
    let healthDelta: number | null = null;
    if (aivsScore !== null && visAvg !== null) {
      healthScore = parseFloat(((aivsScore + visAvg) / 2).toFixed(2));
    } else if (aivsScore !== null) {
      healthScore = aivsScore;
    } else if (visAvg !== null) {
      healthScore = parseFloat(visAvg.toFixed(2));
    }
    if (aivsDelta !== null && visDeltaAvg !== null) {
      healthDelta = parseFloat(((aivsDelta + visDeltaAvg) / 2).toFixed(2));
    } else {
      healthDelta = aivsDelta ?? visDeltaAvg;
    }

    const clientSnapMatch: Record<string, unknown> = {
      projectId,
      entityType: 'client',
      citationPresent: true,
      citedUrl: { $exists: true, $nin: [null, ''] },
    };
    if (wl.baseline_job_ids) {
      clientSnapMatch.jobId = wl.baseline_job_ids.current;
    } else {
      clientSnapMatch.createdAt = { $gte: currentFrom };
    }

    const topPagesAgg = await db
      .collection('cbm_citation_snapshots')
      .aggregate([
        {
          $match: clientSnapMatch,
        },
        {
          $group: {
            _id: '$citedUrl',
            count: { $sum: 1 },
            models: { $addToSet: '$llmModel' },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 3 },
      ])
      .toArray();

    const top_pages = topPagesAgg.map((g: any) => ({
      url: String(g._id),
      citations: g.count as number,
      primary_model: String((g.models && g.models[0]) || '—'),
    }));

    const moduleEDoc = await db.collection('module_e').findOne(
      { jobId },
      {
        projection: {
          citations_recommendations: 1,
          sov_recommendations: 1,
          tracked_prompts_recommendations: 1,
        },
      },
    );
    const recommendations = pickRecommendations(moduleEDoc as any);

    const compCurFilter = wl.baseline_job_ids
      ? { projectId, entityType: 'competitor' as const, jobId: wl.baseline_job_ids.current }
      : { projectId, entityType: 'competitor' as const, createdAt: { $gte: currentFrom } };
    const compPriFilter = wl.baseline_job_ids
      ? { projectId, entityType: 'competitor' as const, jobId: wl.baseline_job_ids.prior }
      : {
          projectId,
          entityType: 'competitor' as const,
          createdAt: { $gte: priorFrom, $lt: currentFrom },
        };

    const compCurrent = await db
      .collection('cbm_citation_snapshots')
      .find(compCurFilter, { projection: { entityName: 1, citationPresent: 1, shareOfVoice: 1 } })
      .toArray();

    const compPrior = await db
      .collection('cbm_citation_snapshots')
      .find(compPriFilter, { projection: { entityName: 1, citationPresent: 1, shareOfVoice: 1 } })
      .toArray();

    type Agg = { cites: number; sovSum: number; sovN: number };
    const merge = (rows: any[], target: Record<string, Agg>) => {
      for (const s of rows) {
        const name = String(s.entityName || '').trim();
        if (!name) continue;
        if (!target[name]) target[name] = { cites: 0, sovSum: 0, sovN: 0 };
        if (s.citationPresent === true) target[name].cites += 1;
        if (typeof s.shareOfVoice === 'number') {
          target[name].sovSum += s.shareOfVoice;
          target[name].sovN += 1;
        }
      }
    };
    const curM: Record<string, Agg> = {};
    const priM: Record<string, Agg> = {};
    merge(compCurrent, curM);
    merge(compPrior, priM);
    const names = new Set([...Object.keys(curM), ...Object.keys(priM)]);
    const competitor_movements = [...names].map((name) => {
      const c = curM[name] ?? { cites: 0, sovSum: 0, sovN: 0 };
      const p = priM[name] ?? { cites: 0, sovSum: 0, sovN: 0 };
      const cSov = c.sovN > 0 ? c.sovSum / c.sovN : null;
      const pSov = p.sovN > 0 ? p.sovSum / p.sovN : null;
      const sov_change =
        cSov !== null && pSov !== null ? parseFloat((cSov - pSov).toFixed(2)) : null;
      const prompts_gained = Math.max(0, c.cites - p.cites);
      const prompts_lost = Math.max(0, p.cites - c.cites);
      return { name, sov_change, prompts_gained, prompts_lost };
    });
    competitor_movements.sort(
      (a, b) =>
        b.prompts_gained +
        (b.sov_change ?? 0) -
        (a.prompts_gained + (a.sov_change ?? 0)),
    );
    const topCompetitors = competitor_movements.slice(0, 12);

    return {
      meta: {
        domain_label: domainLabel,
        is_first_week: !wl.has_baseline,
        job_id: jobId,
        period_days: PERIOD_DAYS,
      },
      aivs_score: aivsScore,
      aivs_delta: aivsDelta,
      health_score: healthScore,
      health_delta: healthDelta,
      citation_count: citationCount,
      citation_delta: parseFloat((citationCount - citationPrev).toFixed(2)),
      sov_percent: sovPercent,
      sov_delta: sovDelta,
      wins,
      losses,
      top_pages,
      recommendations,
      competitor_movements: topCompetitors,
    };
  }

  async generateAndSave(
    userId: string,
    jobId: string,
    deliveredVia: WeeklyReportDoc['deliveredVia'] = 'dashboard',
  ): Promise<WeeklyReportDoc> {
    const job = await this.jobService.getJobById(userId, jobId);
    const projectId = (job as any).projectId as string;

    const project = await this.projectService.getProjectById(projectId, userId);
    const domainLabel = (project as any)?.name ?? 'Project';

    const { weekStart, weekEnd } = lastCompletedWeekRangeUtc();
    const reportData = await this.buildReportData(userId, jobId, domainLabel);

    const db = await connectToMongo();
    const existing = await db.collection(COLLECTION).findOne({ projectId, weekStart });
    const id = (existing?.id as string) || randomUUID();
    const doc = {
      id,
      projectId,
      weekStart,
      weekEnd,
      jobId,
      reportData,
      generatedAt: new Date(),
      deliveredVia,
    };

    await db.collection(COLLECTION).updateOne(
      { projectId, weekStart },
      { $set: doc },
      { upsert: true },
    );

    const saved = await db.collection(COLLECTION).findOne({ projectId, weekStart });
    logger.info(`[WEEKLY_REPORTS] generated id=${id} project=${projectId} week=${weekStart}`);

    return this.toDoc(saved!);
  }

  /** Cron / internal: latest job per project (any user). Skips if no jobs. */
  async generateForProjectInternal(projectId: string, userId: string): Promise<void> {
    const db = await connectToMongo();
    const job = await db
      .collection('jobs')
      .find({ projectId })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();
    if (!job[0]?.id) return;
    await this.generateAndSave(userId, job[0].id as string, 'dashboard');
  }

  reportToCsv(data: WeeklyReportData): string {
    const lines: string[] = [];
    lines.push('section,key,value');
    lines.push(`meta,domain,${this.csvEsc(data.meta.domain_label)}`);
    lines.push(`kpi,aivs_score,${data.aivs_score ?? ''}`);
    lines.push(`kpi,aivs_delta,${data.aivs_delta ?? ''}`);
    lines.push(`kpi,health_score,${data.health_score ?? ''}`);
    lines.push(`kpi,citation_count,${data.citation_count}`);
    lines.push(`kpi,sov_percent,${data.sov_percent ?? ''}`);
    data.wins.forEach((w, i) => {
      lines.push(`win_${i + 1},metric,${this.csvEsc(w.metric)}`);
      lines.push(`win_${i + 1},model,${this.csvEsc(w.model)}`);
      lines.push(`win_${i + 1},delta,${w.delta}`);
    });
    data.losses.forEach((w, i) => {
      lines.push(`loss_${i + 1},metric,${this.csvEsc(w.metric)}`);
      lines.push(`loss_${i + 1},fix,${this.csvEsc(w.fix_title ?? '')}`);
    });
    data.top_pages.forEach((p, i) => {
      lines.push(`page_${i + 1},url,${this.csvEsc(p.url)}`);
      lines.push(`page_${i + 1},citations,${p.citations}`);
    });
    return lines.join('\n');
  }

  private csvEsc(s: string): string {
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }
}

import { connectToMongo } from '../../config/mongo';
import { JobService } from '../job/job.service';
import { logger } from '../../shared/logger/logger';
import type {
  WinsLossesResponse,
  WLMetricRow,
  WLFix,
  WLCategory,
  WLModel,
} from './winsLosses.types';

// ---------------------------------------------------------------------------
// Module-to-sidebar-link map so fix chips navigate to the right section
// ---------------------------------------------------------------------------
const CATEGORY_LINK: Record<string, string> = {
  Citations: 'prompt-opportunities',
  'Share of Voice': 'share-of-voice',
  Visibility: 'keyword-intelligence',
  AIVS: 'ai-visibility-scorecards',
};

// ---------------------------------------------------------------------------
// Helper: build a WLFix from the first recommendation in a module_e block
// ---------------------------------------------------------------------------
function buildFix(
  block: { recommendations?: Array<{ title: string; issue: string; impact: string; [k: string]: unknown }> } | null | undefined,
  category: string,
): WLFix | null {
  const rec = block?.recommendations?.[0];
  if (!rec) return null;
  const impact = /high/i.test(rec.impact) ? 'HIGH' : /medium/i.test(rec.impact) ? 'MEDIUM' : 'LOW';
  const effort: WLFix['effort'] = /low/i.test(String(rec.effort ?? '')) ? 'LOW' : 'MEDIUM';
  return {
    title: rec.title || 'Review and update content strategy',
    issue: rec.issue || '',
    impact,
    effort,
    link: CATEGORY_LINK[category] ?? 'recommendations',
  };
}

// ---------------------------------------------------------------------------
// Build a WLMetricRow
// ---------------------------------------------------------------------------
function makeRow(
  metric: string,
  category: WLCategory,
  model: WLModel,
  prev: number,
  current: number,
  fix: WLFix | null,
): WLMetricRow {
  const delta = parseFloat((current - prev).toFixed(2));
  const direction = delta > 0 ? 'WIN' : delta < 0 ? 'LOSS' : 'STABLE';
  return {
    metric,
    category,
    model,
    prev: parseFloat(prev.toFixed(2)),
    current: parseFloat(current.toFixed(2)),
    delta,
    direction,
    fix: direction === 'LOSS' ? fix : null,
  };
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------
export class WinsLossesService {
  private jobService = new JobService();

  async getWinsLosses(jobId: string, userId: string, _periodDays: number): Promise<WinsLossesResponse> {
    // 1. Resolve job → projectId
    const job = await this.jobService.getJobById(userId, jobId);
    const projectId: string = (job as any).projectId;
    if (!projectId) {
      return { wins: [], losses: [], has_baseline: false, period_days: _periodDays, prior_date: null, current_date: null };
    }

    const db = await connectToMongo();

    // -----------------------------------------------------------------------
    // 2. Find the two most-recent distinct MODULE_F jobIds for this project
    //    that have cbm_citation_snapshots with entityType='client'.
    //
    //    Key insight: the upsert key in runner.py is
    //      { projectId, snapshotDate, entityName, llmModel, jobId }
    //    So two runs on the SAME calendar day produce two separate documents
    //    (different jobId). Grouping by jobId works even within 30 seconds.
    // -----------------------------------------------------------------------
    const jobGroups = await db
      .collection('cbm_citation_snapshots')
      .aggregate([
        { $match: { projectId, entityType: 'client' } },
        {
          $group: {
            _id: '$jobId',
            latestCreatedAt: { $max: '$createdAt' },
            snapshotDate: { $first: '$snapshotDate' },
          },
        },
        { $sort: { latestCreatedAt: -1 } },
        { $limit: 2 },
      ])
      .toArray();

    if (jobGroups.length < 2) {
      return {
        wins: [],
        losses: [],
        has_baseline: false,
        period_days: _periodDays,
        current_date: jobGroups[0]?.snapshotDate ?? null,
        prior_date: null,
      };
    }

    const currentJobId = jobGroups[0]._id as string;
    const priorJobId   = jobGroups[1]._id as string;
    const currentDate  = (jobGroups[0].snapshotDate as string) ?? null;
    const priorDate    = (jobGroups[1].snapshotDate as string) ?? null;

    // 3. Fetch all client snapshots for both jobs in one query
    const snapshots = await db
      .collection('cbm_citation_snapshots')
      .find(
        { projectId, entityType: 'client', jobId: { $in: [currentJobId, priorJobId] } },
        {
          projection: {
            jobId: 1,
            llmModel: 1,
            citationPresent: 1,
            shareOfVoice: 1,
            visibilityScore: 1,
          },
        },
      )
      .toArray();

    // 4. Aggregate per (jobId, model)
    type ModelAgg = { citations: number; sovSum: number; visSum: number; count: number };
    const aggByJob: Record<string, Record<string, ModelAgg>> = {};

    for (const s of snapshots) {
      const jId  = s.jobId as string;
      const m    = (s.llmModel as string) || 'Unknown';
      if (!aggByJob[jId]) aggByJob[jId] = {};
      if (!aggByJob[jId][m]) aggByJob[jId][m] = { citations: 0, sovSum: 0, visSum: 0, count: 0 };
      if (s.citationPresent) aggByJob[jId][m].citations += 1;
      if (typeof s.shareOfVoice   === 'number') aggByJob[jId][m].sovSum += s.shareOfVoice;
      if (typeof s.visibilityScore === 'number') aggByJob[jId][m].visSum += s.visibilityScore;
      aggByJob[jId][m].count += 1;
    }

    const cur = aggByJob[currentJobId] ?? {};
    const pri = aggByJob[priorJobId]   ?? {};

    // 5. Fetch module_e doc for the current job (fix recommendations)
    const moduleEDoc = await db.collection('module_e').findOne(
      { jobId: currentJobId },
      { projection: { citations_recommendations: 1, sov_recommendations: 1, tracked_prompts_recommendations: 1 } },
    );

    // 6. Fetch AIVS (module_c overall_score) for both jobs (best-effort)
    const [curAivs, priAivs] = await Promise.all([
      db.collection('module_c').findOne(
        { jobId: currentJobId },
        { projection: { overall_score: 1 } },
      ),
      db.collection('module_c').findOne(
        { jobId: priorJobId },
        { projection: { overall_score: 1 } },
      ),
    ]);

    // 7. Build metric rows across all models seen in either run
    const rows: WLMetricRow[] = [];
    const allModels = new Set([...Object.keys(cur), ...Object.keys(pri)]);

    for (const model of allModels) {
      const c = cur[model];
      const p = pri[model];
      if (!c || !p) continue; // need both periods to compare

      // Citations count
      rows.push(makeRow(
        `${model} Citations`,
        'Citations',
        model as WLModel,
        p.citations,
        c.citations,
        buildFix(moduleEDoc?.citations_recommendations, 'Citations'),
      ));

      // Share of Voice (average across prompts)
      const cSov = c.count > 0 ? c.sovSum / c.count : 0;
      const pSov = p.count > 0 ? p.sovSum / p.count : 0;
      rows.push(makeRow(
        `${model} Share of Voice`,
        'Share of Voice',
        model as WLModel,
        pSov,
        cSov,
        buildFix(moduleEDoc?.sov_recommendations, 'Share of Voice'),
      ));

      // Visibility Score (average)
      const cVis = c.count > 0 ? c.visSum / c.count : 0;
      const pVis = p.count > 0 ? p.visSum / p.count : 0;
      rows.push(makeRow(
        `${model} Visibility Score`,
        'Visibility',
        model as WLModel,
        pVis,
        cVis,
        buildFix(moduleEDoc?.citations_recommendations, 'Visibility'),
      ));
    }

    // AIVS (model-agnostic overall score from module_c)
    const curAivsScore = typeof curAivs?.overall_score === 'number' ? curAivs.overall_score : null;
    const priAivsScore = typeof priAivs?.overall_score === 'number' ? priAivs.overall_score : null;
    if (curAivsScore !== null && priAivsScore !== null) {
      rows.push(makeRow(
        'AI Visibility Score (AIVS)',
        'AIVS',
        'Overall',
        priAivsScore,
        curAivsScore,
        buildFix(moduleEDoc?.citations_recommendations, 'AIVS'),
      ));
    }

    // 8. Split WIN vs LOSS, exclude STABLE
    const wins   = rows.filter((r) => r.direction === 'WIN').sort((a, b) => b.delta - a.delta);
    const losses = rows.filter((r) => r.direction === 'LOSS').sort((a, b) => a.delta - b.delta);

    logger.info(
      `[WINS_LOSSES] job=${jobId} project=${projectId} ` +
      `curJobId=${currentJobId} priorJobId=${priorJobId} ` +
      `wins=${wins.length} losses=${losses.length}`,
    );

    return {
      wins,
      losses,
      has_baseline: true,
      period_days: _periodDays,
      current_date: currentDate,
      prior_date: priorDate,
    };
  }
}


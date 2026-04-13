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
  'Prompt Coverage': 'prompt-opportunities',
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
// Helper: safely extract sentiment_tracking.visibility.by_model from a
// module_e document. Returns a map of modelName -> { visibility_score,
// appearance_rate } or an empty object if the data is not available.
// ---------------------------------------------------------------------------
function extractPromptCoverageByModel(
  moduleEDoc: Record<string, any> | null | undefined,
): Record<string, { visibility_score: number; appearance_rate: number }> {
  const byModel = moduleEDoc?.sentiment_tracking?.visibility?.by_model;
  if (!byModel || typeof byModel !== 'object') return {};

  const result: Record<string, { visibility_score: number; appearance_rate: number }> = {};

  // Shape A (object map):
  // {
  //   openai: { visibility_score: 61, appearance_rate: 0.42 },
  //   gemini: { ... }
  // }
  if (!Array.isArray(byModel)) {
    for (const [model, data] of Object.entries(byModel)) {
      const normalizedModel = normalizeModelName(model);
      const d = data as any;
      if (
        typeof d?.visibility_score === 'number' ||
        typeof d?.appearance_rate === 'number' ||
        typeof d?.visibilityScore === 'number' ||
        typeof d?.appearanceRate === 'number'
      ) {
        result[normalizedModel] = {
          visibility_score:
            typeof d.visibility_score === 'number'
              ? d.visibility_score
              : (typeof d.visibilityScore === 'number' ? d.visibilityScore : 0),
          appearance_rate:
            typeof d.appearance_rate === 'number'
              ? d.appearance_rate
              : (typeof d.appearanceRate === 'number' ? d.appearanceRate : 0),
        };
      }
    }
    return result;
  }

  // Shape B (array, as in docs):
  // [
  //   { model: "openai", visibility_score: 61, appearance_rate: 0.42 },
  //   { model: "gemini", visibility_score: 55, appearance_rate: 0.35 }
  // ]
  for (const item of byModel as any[]) {
    const rawModel = String(item?.model ?? item?.name ?? item?.llmModel ?? '').trim();
    if (!rawModel) continue;
    const normalizedModel = normalizeModelName(rawModel);

    const visibility =
      typeof item?.visibility_score === 'number'
        ? item.visibility_score
        : (typeof item?.visibilityScore === 'number' ? item.visibilityScore : 0);
    const appearance =
      typeof item?.appearance_rate === 'number'
        ? item.appearance_rate
        : (typeof item?.appearanceRate === 'number' ? item.appearanceRate : 0);

    result[normalizedModel] = {
      visibility_score: visibility,
      appearance_rate: appearance,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Normalize provider/model labels so comparisons are stable across runs.
// Example: "openai" and "chatgpt" both map to "ChatGPT".
// ---------------------------------------------------------------------------
function normalizeModelName(model: string | null | undefined): string {
  const raw = String(model ?? '').trim();
  if (!raw) return 'Unknown';

  const normalized = raw.toLowerCase();

  if (
    normalized === 'openai' ||
    normalized === 'chatgpt' ||
    normalized.startsWith('gpt-') ||
    normalized.includes('chatgpt')
  ) return 'ChatGPT';

  if (normalized.includes('gemini') || normalized === 'bard') return 'Gemini';
  if (normalized.includes('claude') || normalized.includes('anthropic')) return 'Claude';
  if (normalized.includes('perplexity')) return 'Perplexity';

  return raw;
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------
export class WinsLossesService {
  private jobService = new JobService();

  async getWinsLosses(jobId: string, userId: string, _periodDays: number): Promise<WinsLossesResponse> {
    // 1. Resolve job -> projectId (also validates ownership)
    const job = await this.jobService.getJobById(userId, jobId);
    const projectId: string = (job as any).projectId;
    if (!projectId) {
      return {
        wins: [],
        losses: [],
        all_metrics: [],
        baseline_job_ids: null,
        has_baseline: false,
        period_days: _periodDays,
        prior_date: null,
        current_date: null,
      };
    }

    const db = await connectToMongo();

    // -----------------------------------------------------------------------
    // 2. Spec-aligned baseline selection (Dashboard Brief v1.0, "Wins & Losses"):
    //    Compare two time windows:
    //      - current window: last N days
    //      - prior window:   the N days before that
    //
    //    We do this using `createdAt` so it works regardless of how snapshotDate
    //    is stored (string vs Date) and regardless of whether the run came from
    //    Module E quick start or other pipelines.
    // -----------------------------------------------------------------------
    const now = new Date();
    const currentFrom = new Date(now);
    currentFrom.setDate(currentFrom.getDate() - _periodDays);
    const priorFrom = new Date(now);
    priorFrom.setDate(priorFrom.getDate() - _periodDays * 2);

    const snapshotsInRange = await db
      .collection('cbm_citation_snapshots')
      .find(
        { projectId, entityType: 'client', createdAt: { $gte: priorFrom } },
        {
          projection: {
            jobId: 1,
            llmModel: 1,
            citationPresent: 1,
            shareOfVoice: 1,
            visibilityScore: 1,
            createdAt: 1,
          },
        },
      )
      .toArray();

    const currentSnapshots: typeof snapshotsInRange = [];
    const priorSnapshots: typeof snapshotsInRange = [];

    let currentLatest: { createdAt: Date; jobId: string } | null = null;
    let priorLatest: { createdAt: Date; jobId: string } | null = null;

    for (const s of snapshotsInRange) {
      const createdAt = (s as any).createdAt instanceof Date ? ((s as any).createdAt as Date) : new Date((s as any).createdAt);
      const jId = String((s as any).jobId ?? '');
      if (!jId || Number.isNaN(createdAt.getTime())) continue;

      if (createdAt >= currentFrom) {
        currentSnapshots.push(s);
        if (!currentLatest || createdAt > currentLatest.createdAt) currentLatest = { createdAt, jobId: jId };
      } else {
        priorSnapshots.push(s);
        if (!priorLatest || createdAt > priorLatest.createdAt) priorLatest = { createdAt, jobId: jId };
      }
    }

    // If the prior window has no data yet (common on Day 1), fall back to
    // "two most-recent distinct job runs" within the last 2N days. This matches
    // the product expectation of "run twice to see comparison" without waiting a week.
    let currentJobId: string | null = currentLatest?.jobId ?? null;
    let priorJobId: string | null = priorLatest?.jobId ?? null;

    if (!priorJobId) {
      const jobGroups = await db
        .collection('cbm_citation_snapshots')
        .aggregate([
          { $match: { projectId, entityType: 'client', createdAt: { $gte: priorFrom } } },
          {
            $group: {
              _id: '$jobId',
              latestCreatedAt: { $max: '$createdAt' },
            },
          },
          { $sort: { latestCreatedAt: -1 } },
          { $limit: 2 },
        ])
        .toArray();

      if (jobGroups.length >= 2) {
        currentJobId = String(jobGroups[0]._id);
        priorJobId = String(jobGroups[1]._id);
      }
    }

    if (!currentJobId || !priorJobId) {
      return {
        wins: [],
        losses: [],
        all_metrics: [],
        baseline_job_ids: null,
        has_baseline: false,
        period_days: _periodDays,
        current_date: currentFrom.toISOString(),
        prior_date: priorFrom.toISOString(),
      };
    }

    // When using the job-run fallback, rebuild window lists based on jobIds so
    // aggregation is consistent with the chosen baseline.
    const useJobFallback = !priorLatest?.jobId;
    const effectiveCurrentSnapshots = useJobFallback
      ? snapshotsInRange.filter((s: any) => String(s.jobId ?? '') === currentJobId)
      : currentSnapshots;
    const effectivePriorSnapshots = useJobFallback
      ? snapshotsInRange.filter((s: any) => String(s.jobId ?? '') === priorJobId)
      : priorSnapshots;

    const currentDate = currentFrom.toISOString();
    const priorDate = priorFrom.toISOString();

    // -----------------------------------------------------------------------
    // 3. Fetch all data in parallel:
    //    - cbm_citation_snapshots for both windows (Citations / SoV / Visibility)
    //    - module_e for both jobs (fix recommendations + Prompt Coverage)
    //    - module_c for both jobs (AIVS overall score)
    // -----------------------------------------------------------------------
    // In some pipelines, cbm_citation_snapshots jobId can differ from module_e/module_c jobId
    // for the same project/time window. Build window jobId sets so we can fall back by window.
    const [curWindowJobs, priWindowJobs] = await Promise.all([
      db.collection('jobs')
        .find(
          { projectId, status: 'COMPLETED', createdAt: { $gte: currentFrom } },
          { projection: { id: 1 }, sort: { createdAt: -1 } } as any,
        )
        .toArray(),
      db.collection('jobs')
        .find(
          { projectId, status: 'COMPLETED', createdAt: { $gte: priorFrom, $lt: currentFrom } },
          { projection: { id: 1 }, sort: { createdAt: -1 } } as any,
        )
        .toArray(),
    ]);

    const curWindowJobIds = curWindowJobs.map((j: any) => String(j.id)).filter(Boolean);
    const priWindowJobIds = priWindowJobs.map((j: any) => String(j.id)).filter(Boolean);

    const [moduleECurByJob, moduleEPriByJob, curAivsByJob, priAivsByJob, curD7ByJob, priD7ByJob] = await Promise.all([
      db.collection('module_e').findOne(
        { jobId: currentJobId },
        {
          projection: {
            citations_recommendations: 1,
            sov_recommendations: 1,
            tracked_prompts_recommendations: 1,
            sentiment_tracking: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ),
      db.collection('module_e').findOne(
        { jobId: priorJobId },
        { projection: { sentiment_tracking: 1, createdAt: 1, updatedAt: 1 } },
      ),
      db.collection('module_c').findOne(
        { jobId: currentJobId },
        { projection: { overall_score: 1, createdAt: 1, timestamp: 1 } },
      ),
      db.collection('module_c').findOne(
        { jobId: priorJobId },
        { projection: { overall_score: 1, createdAt: 1, timestamp: 1 } },
      ),
      db.collection('cbm_aivs_d7').findOne(
        { projectId, jobId: currentJobId },
        { projection: { d7_score: 1, createdAt: 1 } },
      ),
      db.collection('cbm_aivs_d7').findOne(
        { projectId, jobId: priorJobId },
        { projection: { d7_score: 1, createdAt: 1 } },
      ),
    ]);

    const [moduleECurFallback, moduleEPriFallback, curAivsFallback, priAivsFallback, curD7Fallback, priD7Fallback] = await Promise.all([
      moduleECurByJob || curWindowJobIds.length === 0
        ? null
        : db.collection('module_e').findOne(
            { jobId: { $in: curWindowJobIds } },
            {
              projection: {
                citations_recommendations: 1,
                sov_recommendations: 1,
                tracked_prompts_recommendations: 1,
                sentiment_tracking: 1,
                createdAt: 1,
                updatedAt: 1,
              },
              sort: { updatedAt: -1, createdAt: -1 },
            } as any,
          ),
      moduleEPriByJob || priWindowJobIds.length === 0
        ? null
        : db.collection('module_e').findOne(
            { jobId: { $in: priWindowJobIds } },
            { projection: { sentiment_tracking: 1, createdAt: 1, updatedAt: 1 }, sort: { updatedAt: -1, createdAt: -1 } } as any,
          ),
      curAivsByJob || curWindowJobIds.length === 0
        ? null
        : db.collection('module_c').findOne(
            { jobId: { $in: curWindowJobIds } },
            { projection: { overall_score: 1, createdAt: 1, timestamp: 1 }, sort: { timestamp: -1, createdAt: -1 } } as any,
          ),
      priAivsByJob || priWindowJobIds.length === 0
        ? null
        : db.collection('module_c').findOne(
            { jobId: { $in: priWindowJobIds } },
            { projection: { overall_score: 1, createdAt: 1, timestamp: 1 }, sort: { timestamp: -1, createdAt: -1 } } as any,
          ),
      curD7ByJob || curWindowJobIds.length === 0
        ? null
        : db.collection('cbm_aivs_d7').findOne(
            { projectId, jobId: { $in: curWindowJobIds } },
            { projection: { d7_score: 1, createdAt: 1 }, sort: { createdAt: -1 } } as any,
          ),
      priD7ByJob || priWindowJobIds.length === 0
        ? null
        : db.collection('cbm_aivs_d7').findOne(
            { projectId, jobId: { $in: priWindowJobIds } },
            { projection: { d7_score: 1, createdAt: 1 }, sort: { createdAt: -1 } } as any,
          ),
    ]);

    const moduleECur = moduleECurByJob ?? moduleECurFallback;
    const moduleEPri = moduleEPriByJob ?? moduleEPriFallback;
    const curAivs = curAivsByJob ?? curAivsFallback;
    const priAivs = priAivsByJob ?? priAivsFallback;
    const curD7 = curD7ByJob ?? curD7Fallback;
    const priD7 = priD7ByJob ?? priD7Fallback;

    // -----------------------------------------------------------------------
    // 4. Aggregate citation snapshots per (window, model)
    // -----------------------------------------------------------------------
    type ModelAgg = { citations: number; sovSum: number; visSum: number; count: number };
    const aggCur: Record<string, ModelAgg> = {};
    const aggPri: Record<string, ModelAgg> = {};

    const add = (target: Record<string, ModelAgg>, s: any) => {
      const m = normalizeModelName(s.llmModel as string);
      if (!target[m]) target[m] = { citations: 0, sovSum: 0, visSum: 0, count: 0 };
      if (s.citationPresent) target[m].citations += 1;
      if (typeof s.shareOfVoice === 'number') target[m].sovSum += s.shareOfVoice;
      if (typeof s.visibilityScore === 'number') target[m].visSum += s.visibilityScore;
      target[m].count += 1;
    };

    for (const s of effectivePriorSnapshots) add(aggPri, s as any);
    for (const s of effectiveCurrentSnapshots) add(aggCur, s as any);

    const cur = aggCur;
    const pri = aggPri;

    // -----------------------------------------------------------------------
    // 5. Build metric rows across all four categories
    // -----------------------------------------------------------------------
    const rows: WLMetricRow[] = [];
    const allModels = new Set([...Object.keys(cur), ...Object.keys(pri)]);

    for (const model of allModels) {
      const c = cur[model] ?? { citations: 0, sovSum: 0, visSum: 0, count: 0 };
      const p = pri[model] ?? { citations: 0, sovSum: 0, visSum: 0, count: 0 };

      // --- CATEGORY: Citations ---
      rows.push(makeRow(
        `${model} Citations`,
        'Citations',
        model as WLModel,
        p.citations,
        c.citations,
        buildFix((moduleECur as any)?.citations_recommendations, 'Citations'),
      ));

      // --- CATEGORY: Share of Voice (average % across prompts) ---
      const cSov = c.count > 0 ? c.sovSum / c.count : 0;
      const pSov = p.count > 0 ? p.sovSum / p.count : 0;
      rows.push(makeRow(
        `${model} Share of Voice`,
        'Share of Voice',
        model as WLModel,
        pSov,
        cSov,
        buildFix((moduleECur as any)?.sov_recommendations, 'Share of Voice'),
      ));

      // --- CATEGORY: Visibility Score (average across prompts) ---
      const cVis = c.count > 0 ? c.visSum / c.count : 0;
      const pVis = p.count > 0 ? p.visSum / p.count : 0;
      rows.push(makeRow(
        `${model} Visibility Score`,
        'Visibility',
        model as WLModel,
        pVis,
        cVis,
        buildFix((moduleECur as any)?.citations_recommendations, 'Visibility'),
      ));
    }

    // --- CATEGORY: AIVS (model-agnostic overall score from module_c) ---
    const curAivsScore =
      typeof (curAivs as any)?.overall_score === 'number'
        ? (curAivs as any).overall_score
        : (typeof (curD7 as any)?.d7_score === 'number' ? (curD7 as any).d7_score : null);

    const priAivsScore =
      typeof (priAivs as any)?.overall_score === 'number'
        ? (priAivs as any).overall_score
        : (typeof (priD7 as any)?.d7_score === 'number' ? (priD7 as any).d7_score : null);
    // Include AIVS when at least one side exists (Module F often has D7 on current only).
    if (curAivsScore !== null || priAivsScore !== null) {
      const c = typeof curAivsScore === 'number' ? curAivsScore : (priAivsScore as number);
      const p = typeof priAivsScore === 'number' ? priAivsScore : (curAivsScore as number);
      rows.push(makeRow(
        'AI Visibility Score (AIVS)',
        'AIVS',
        'Overall',
        p,
        c,
        buildFix((moduleECur as any)?.citations_recommendations, 'AIVS'),
      ));
    }

    // --- CATEGORY: Prompt Coverage ---
    // Source: sentiment_tracking.visibility.by_model in module_e.
    //   visibility_score = 0-100 brand visibility across all tracked prompts for that model.
    //   appearance_rate  = 0-1  fraction of prompts where the brand appeared.
    // We store appearance_rate * 100 so the frontend can display it as a percentage
    // consistently with the other numeric metrics.
    const curPromptCov = extractPromptCoverageByModel(moduleECur as any);
    const priPromptCov = extractPromptCoverageByModel(moduleEPri as any);
    const promptModels = new Set([...Object.keys(curPromptCov), ...Object.keys(priPromptCov)]);

    for (const model of promptModels) {
      const cPc = curPromptCov[model] ?? { visibility_score: 0, appearance_rate: 0 };
      const pPc = priPromptCov[model] ?? { visibility_score: 0, appearance_rate: 0 };

      // Prompt Visibility Score (0-100)
      rows.push(makeRow(
        `${model} Prompt Visibility`,
        'Prompt Coverage',
        model as WLModel,
        pPc.visibility_score,
        cPc.visibility_score,
        buildFix((moduleECur as any)?.tracked_prompts_recommendations, 'Prompt Coverage'),
      ));

      // Prompt Appearance Rate (stored as percentage 0-100)
      const cRate = parseFloat((cPc.appearance_rate * 100).toFixed(2));
      const pRate = parseFloat((pPc.appearance_rate * 100).toFixed(2));
      rows.push(makeRow(
        `${model} Prompt Appearance Rate`,
        'Prompt Coverage',
        model as WLModel,
        pRate,
        cRate,
        buildFix((moduleECur as any)?.tracked_prompts_recommendations, 'Prompt Coverage'),
      ));
    }

    // -----------------------------------------------------------------------
    // 6. Split WIN vs LOSS (exclude STABLE), sort by magnitude
    // -----------------------------------------------------------------------
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
      all_metrics: rows,
      baseline_job_ids: { current: currentJobId, prior: priorJobId },
      has_baseline: true,
      period_days: _periodDays,
      current_date: currentDate,
      prior_date: priorDate,
    };
  }
}
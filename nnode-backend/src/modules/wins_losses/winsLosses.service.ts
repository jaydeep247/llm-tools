import { getMongoDb } from '../../config/mongo';
import { JobRepository } from '../job/job.repository';
import { JobService } from '../job/job.service';
import { JobStatus } from '../job/job.types';
import { logger } from '../../shared/logger/logger';
import type {
  WinsLossesResponse,
  WinLossMetric,
  WinLossCategory,
  LLMModel,
  ImpactLevel,
  WinLossFix,
} from './winsLosses.types';

// ─────────────────────────────────────────────────────────────────────────────
// Canonical LLM display names
// ─────────────────────────────────────────────────────────────────────────────

const MODEL_DISPLAY: Record<string, LLMModel> = {
  openai: 'ChatGPT',
  gpt: 'ChatGPT',
  'gpt-4': 'ChatGPT',
  'gpt-4o': 'ChatGPT',
  gemini: 'Gemini',
  'gemini-pro': 'Gemini',
  'gemini-2.0-flash': 'Gemini',
  claude: 'Claude',
  'claude-3': 'Claude',
  perplexity: 'Perplexity',
};

function toDisplayModel(raw: string): LLMModel | null {
  const key = (raw ?? '').toLowerCase().split('-')[0];
  return MODEL_DISPLAY[raw.toLowerCase()] ?? MODEL_DISPLAY[key] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category → sidebar tab mapping
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_LINK: Record<WinLossCategory, string> = {
  Citations: 'prompt-opportunities',
  'Share of Voice': 'share-of-voice',
  'AIVS Dimensions': 'ai-visibility-scorecards',
  'Prompt Coverage': 'prompt-difficulty',
};

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot data shape for a single job
// ─────────────────────────────────────────────────────────────────────────────

interface JobSnapshot {
  /** Citations per model: { ChatGPT: count, Gemini: count, … } */
  citations: Record<string, number>;
  /** SoV per model from module_e.ai_share_of_voice.by_model */
  sov: Record<string, number>;
  /** Visibility score per model from module_e.sentiment_tracking.visibility.by_model */
  visibility: Record<string, number>;
  /** AIVS overall score from module_c */
  aivs: number | null;
  /** Fixes available (sourced from module_e recommendations) */
  fixes: {
    citations?: ModuleEFixBlock | null;
    sov?: ModuleEFixBlock | null;
    prompts?: ModuleEFixBlock | null;
  };
}

interface ModuleEFixBlock {
  recommendations: Array<{
    title: string;
    issue: string;
    severity: string;
    category: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch a single job's snapshot data
// ─────────────────────────────────────────────────────────────────────────────

async function fetchJobSnapshot(
  db: ReturnType<typeof getMongoDb>,
  jobId: string,
  _sessionId: string,
): Promise<JobSnapshot> {
  const [citationRows, moduleEDoc, moduleCDoc] = await Promise.all([
    // Citations: count of citationPresent=true per model for client entity
    db
      .collection('cbm_citation_snapshots')
      .aggregate([
        {
          $match: {
            jobId,
            entityType: 'client',
          },
        },
        {
          $group: {
            _id: '$llmModel',
            citation_count: {
              $sum: { $cond: [{ $eq: ['$citationPresent', true] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),

    // Module E: SoV, visibility, fixes
    db
      .collection('module_e')
      .findOne(
        { jobId },
        {
          projection: {
            ai_share_of_voice: 1,
            sentiment_tracking: 1,
            citations_recommendations: 1,
            sov_recommendations: 1,
            tracked_prompts_recommendations: 1,
          },
        },
      ),

    // Module C: AIVS overall score
    db
      .collection('module_c')
      .findOne({ jobId }, { projection: { overall_score: 1 } } as any),
  ]);

  // --- Citations ---
  const citations: Record<string, number> = {};
  for (const row of citationRows as any[]) {
    const model = toDisplayModel(row._id ?? '');
    if (model) citations[model] = (citations[model] ?? 0) + (row.citation_count ?? 0);
  }

  // --- SoV per model ---
  const sov: Record<string, number> = {};
  const sovByModel = (moduleEDoc as any)?.ai_share_of_voice?.by_model ?? {};
  for (const [rawModel, data] of Object.entries(sovByModel)) {
    const model = toDisplayModel(rawModel);
    if (model && typeof (data as any)?.sov === 'number') {
      sov[model] = parseFloat(((data as any).sov as number).toFixed(1));
    }
  }

  // --- Visibility per model from sentiment_tracking ---
  const visibility: Record<string, number> = {};
  const visByModel = (moduleEDoc as any)?.sentiment_tracking?.visibility?.by_model ?? {};
  for (const [rawModel, data] of Object.entries(visByModel)) {
    const model = toDisplayModel(rawModel);
    if (model && typeof (data as any)?.visibility_score === 'number') {
      visibility[model] = parseFloat(((data as any).visibility_score as number).toFixed(1));
    }
  }

  // --- AIVS ---
  const aivs =
    typeof (moduleCDoc as any)?.overall_score === 'number'
      ? Math.round((moduleCDoc as any).overall_score)
      : null;

  // --- Fixes ---
  const fixes = {
    citations: ((moduleEDoc as any)?.citations_recommendations as ModuleEFixBlock | null) ?? null,
    sov: ((moduleEDoc as any)?.sov_recommendations as ModuleEFixBlock | null) ?? null,
    prompts:
      ((moduleEDoc as any)?.tracked_prompts_recommendations as ModuleEFixBlock | null) ?? null,
  };

  return { citations, sov, visibility, aivs, fixes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a WinLossMetric from two numeric values
// ─────────────────────────────────────────────────────────────────────────────

function buildMetric(
  metric: string,
  category: WinLossCategory,
  model: LLMModel | null,
  prev: number,
  current: number,
  fix: WinLossFix | null,
): WinLossMetric {
  const delta = parseFloat((current - prev).toFixed(1));
  const direction =
    delta > 0 ? 'POSITIVE' : delta < 0 ? 'NEGATIVE' : 'NEUTRAL';
  return { metric, category, model, prev, current, delta, direction, fix };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extract best fix from a recommendation block
// ─────────────────────────────────────────────────────────────────────────────

function extractFix(
  block: ModuleEFixBlock | null | undefined,
  fallbackLink: string,
): WinLossFix | null {
  if (!block?.recommendations?.length) return null;
  const best = block.recommendations[0];
  const impact: ImpactLevel =
    best.severity === 'critical' ? 'HIGH' : best.severity === 'warning' ? 'MEDIUM' : 'LOW';
  return {
    title: best.title ?? 'Review this metric',
    issue: best.issue ?? '',
    impact,
    effort: 'MEDIUM',
    link: fallbackLink,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main service
// ─────────────────────────────────────────────────────────────────────────────

export class WinsLossesService {
  private jobRepository = new JobRepository();
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
  }

  async getWinsLosses(
    userId: string,
    jobId: string,
  ): Promise<WinsLossesResponse> {
    const job = await this.jobService.getJobById(userId, jobId);
    const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
    const db = getMongoDb();

    // --- Fetch current snapshot ---
    const current = await fetchJobSnapshot(db, effectiveId, job.sessionId ?? '');

    // --- Find previous completed job for same session ---
    let prev: JobSnapshot | null = null;
    try {
      const previousJob = await db.collection('jobs').findOne(
        {
          projectId: job.projectId,
          id: { $ne: effectiveId },
          status: JobStatus.COMPLETED,
          createdAt: { $lt: job.createdAt },
        },
        { sort: { createdAt: -1 } },
      );

      if (previousJob) {
        const prevEffective = previousJob.cacheSourceJobId
          ? String(previousJob.cacheSourceJobId)
          : String((previousJob as any).id);
        prev = await fetchJobSnapshot(db, prevEffective, String((previousJob as any).sessionId ?? ''));
      }
    } catch (err) {
      logger.warn('[WINS_LOSSES] Could not fetch previous job snapshot:', err);
    }

    const hasData =
      Object.keys(current.citations).length > 0 ||
      Object.keys(current.sov).length > 0 ||
      current.aivs !== null;

    if (!prev || !hasData) {
      return {
        wins: [],
        losses: [],
        stable: [],
        period_days: 7,
        has_data: hasData,
        generated_at: new Date().toISOString(),
      };
    }

    // --- Assemble all metrics and compute deltas ---
    const all: WinLossMetric[] = [];

    // 1. Citations per model
    const allCitationModels = new Set([
      ...Object.keys(current.citations),
      ...Object.keys(prev.citations),
    ]);
    for (const model of allCitationModels) {
      const c = current.citations[model] ?? 0;
      const p = prev.citations[model] ?? 0;
      all.push(
        buildMetric(
          `${model} Citations`,
          'Citations',
          model as LLMModel,
          p,
          c,
          extractFix(current.fixes.citations, CATEGORY_LINK.Citations),
        ),
      );
    }

    // 2. Share of Voice per model
    const allSovModels = new Set([
      ...Object.keys(current.sov),
      ...Object.keys(prev.sov),
    ]);
    for (const model of allSovModels) {
      const c = current.sov[model] ?? 0;
      const p = prev.sov[model] ?? 0;
      all.push(
        buildMetric(
          `${model} Share of Voice`,
          'Share of Voice',
          model as LLMModel,
          p,
          c,
          extractFix(current.fixes.sov, CATEGORY_LINK['Share of Voice']),
        ),
      );
    }

    // 3. Visibility per model (Prompt Coverage)
    const allVisModels = new Set([
      ...Object.keys(current.visibility),
      ...Object.keys(prev.visibility),
    ]);
    for (const model of allVisModels) {
      const c = current.visibility[model] ?? 0;
      const p = prev.visibility[model] ?? 0;
      all.push(
        buildMetric(
          `${model} Visibility`,
          'Prompt Coverage',
          model as LLMModel,
          p,
          c,
          extractFix(current.fixes.prompts, CATEGORY_LINK['Prompt Coverage']),
        ),
      );
    }

    // 4. Overall AIVS
    if (current.aivs !== null && prev.aivs !== null) {
      all.push(
        buildMetric(
          'AI Visibility Score',
          'AIVS Dimensions',
          null,
          prev.aivs,
          current.aivs,
          {
            title: 'Improve AI Visibility Score',
            issue: 'Your AIVS score declined. Review top priority actions.',
            impact: 'HIGH',
            effort: 'MEDIUM',
            link: CATEGORY_LINK['AIVS Dimensions'],
          },
        ),
      );
    }

    // --- Classify ---
    const wins = all
      .filter(m => m.direction === 'POSITIVE')
      .sort((a, b) => b.delta - a.delta);
    const losses = all
      .filter(m => m.direction === 'NEGATIVE')
      .sort((a, b) => a.delta - b.delta); // worst first
    const stable = all.filter(m => m.direction === 'NEUTRAL');

    // Strip fix from wins/stable (only LOSS rows carry fixes)
    wins.forEach(m => { m.fix = null; });
    stable.forEach(m => { m.fix = null; });

    return {
      wins,
      losses,
      stable,
      period_days: 7,
      has_data: hasData,
      generated_at: new Date().toISOString(),
    };
  }
}

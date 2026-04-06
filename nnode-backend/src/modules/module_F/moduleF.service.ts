import { moduleFRepository } from './moduleF.repository';
import { JobService } from '../job/job.service';
import { JobRepository } from '../job/job.repository';
import type { ModuleFAskAIResult, ModuleFResult, ModuleFTrends } from './moduleF.types';
import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';

export class ModuleFService {
  private jobService: JobService;
  private jobRepository = new JobRepository();

  constructor() {
    this.jobService = new JobService();
  }

  async getModuleFResult(jobId: string, userId: string): Promise<ModuleFResult | null> {
    const job = await this.jobService.getJobById(userId, jobId);
    const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);

    const directResult = await moduleFRepository.getModuleFResultByJobId(effectiveId);
    if (directResult) return directResult;

    // Session fallback: only use it when the effective job belongs to this same session
    // (i.e., not a cross-session cache-hit). Cross-session cache hits should have been
    // served by getModuleFResultByJobId above; if that returned null the data doesn't exist.
    if (!job?.sessionId) return null;
    if (effectiveId !== jobId) return null; // cache-hit: data came from another session
    return await moduleFRepository.getLatestModuleFResultBySessionId(job.sessionId);
  }

  async getModuleFTrends(jobId: string, userId: string): Promise<ModuleFTrends | null> {
    const job = await this.jobService.getJobById(userId, jobId);
    const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
    const resolvedJob = await this.jobService.getJobById(userId, effectiveId).catch(() => job);
    const url = resolvedJob?.url || job?.url;
    if (!url) return null;

    const history = await moduleFRepository.getModuleFHistoryByUrl(url);
    if (!history.length) return null;

    // Filter valid history points
    const validHistory = history.filter(h => 
      h.compare_visibility_against_competitors?.brand
    );

    const trendPoints = validHistory.map(h => {
      const comp = h.compare_visibility_against_competitors!;
      return {
        date: h.createdAt || new Date().toISOString(),
        jobId: h.jobId,
        brand: {
          name: comp.brand?.name || 'Brand',
          visibility_score: comp.brand?.visibility_score || 0,
          market_share_percent: comp.brand?.market_share_percent || 0,
          mentions_total: comp.brand?.mentions_total || 0,
        },
        competitors: (comp.competitors || []).map(c => ({
          name: c.name,
          visibility_score: c.visibility_score,
          market_share_percent: c.market_share_percent,
          mentions_total: c.mentions_total,
        }))
      };
    });

    const growth_rates = {
      brand_visibility: 0,
      brand_market_share: 0,
      competitors: {} as Record<string, { visibility: number; market_share: number }>
    };

    if (trendPoints.length > 1) {
      const current = trendPoints[trendPoints.length - 1];
      const previous = trendPoints[trendPoints.length - 2];

      // Brand
      if (previous.brand.visibility_score > 0) {
        growth_rates.brand_visibility = ((current.brand.visibility_score - previous.brand.visibility_score) / previous.brand.visibility_score) * 100;
      }
      growth_rates.brand_market_share = current.brand.market_share_percent - previous.brand.market_share_percent;

      // Competitors
      current.competitors.forEach(c => {
        const prevC = previous.competitors.find(pc => pc.name === c.name);
        if (prevC) {
          let visGrowth = 0;
          if (prevC.visibility_score > 0) {
            visGrowth = ((c.visibility_score - prevC.visibility_score) / prevC.visibility_score) * 100;
          }
          growth_rates.competitors[c.name] = {
            visibility: visGrowth,
            market_share: c.market_share_percent - prevC.market_share_percent
          };
        }
      });
    }

    return {
      history: trendPoints,
      growth_rates
    };
  }

  /**
   * Module F Ask AI — forwards to npy-backend FastAPI, which loads Mongo context and calls Claude.
   */
  async askModuleFAI(
    jobId: string,
    userId: string,
    payload: { question: string; conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }> },
  ): Promise<ModuleFAskAIResult> {
    const job = await this.jobService.getJobById(userId, jobId);
    if (!job?.projectId) {
      throw new Error('Job not found or access denied');
    }

    const endpoint = `${env.NPY_BACKEND_URL}/module-f/ask-ai`;
    const body: Record<string, unknown> = {
      project_id: job.projectId,
      job_id: jobId,
      question: payload.question,
    };
    if (payload.conversationHistory?.length) {
      body.conversation_history = payload.conversationHistory.map(t => ({
        role: t.role,
        content: t.content,
      }));
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      let detail: string = res.statusText;
      if (typeof raw.detail === 'string') {
        detail = raw.detail;
      } else if (Array.isArray(raw.detail)) {
        detail = (raw.detail as { msg?: string }[])
          .map(d => d.msg || JSON.stringify(d))
          .join('; ');
      } else if (typeof raw.message === 'string') {
        detail = raw.message;
      }
      logger.error(`Module F Ask AI failed: ${res.status} — ${detail}`);
      throw new Error(detail || 'Ask AI request failed');
    }

    const answer = typeof raw.answer === 'string' ? raw.answer : '';
    if (!answer && raw.answer !== '') {
      logger.error('Module F Ask AI: unexpected response shape', { keys: Object.keys(raw) });
      throw new Error('Invalid response from Ask AI service');
    }

    return {
      answer,
      question_type: typeof raw.question_type === 'string' ? raw.question_type : undefined,
      sources: Array.isArray(raw.sources) ? (raw.sources as string[]) : undefined,
      recommendation_ids: Array.isArray(raw.recommendation_ids)
        ? (raw.recommendation_ids as string[])
        : undefined,
      data_available: typeof raw.data_available === 'boolean' ? raw.data_available : undefined,
      context_snapshot:
        raw.context_snapshot && typeof raw.context_snapshot === 'object'
          ? (raw.context_snapshot as Record<string, unknown>)
          : undefined,
    };
  }
}


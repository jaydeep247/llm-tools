import { connectToMongo } from '../../config/mongo';
import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';
import { SerpAnalyzerResult, ModuleAAskAIResult } from './moduleA.types';
import { JobService } from '../job/job.service';
import { JobRepository } from '../job/job.repository';

export class ModuleAService {
  private jobService: JobService;
  private jobRepository: JobRepository;

  constructor() {
    this.jobService = new JobService();
    this.jobRepository = new JobRepository();
  }

  /**
   * Retrieve SERP Analyzer result for a specific job.
   * Resolves cacheSourceJobId transparently so cache-hit sessions
   * are served from the original job's data without re-querying DataForSEO.
   */
  async getSerpResult(jobId: string): Promise<SerpAnalyzerResult | null> {
    const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
    const db = await connectToMongo();
    const result = await db.collection('serp_results').findOne({ jobId: effectiveId });
    if (!result) return null;
    return result as unknown as SerpAnalyzerResult;
  }

  /**
   * Retrieve all SERP Analyzer results for a session (across multiple jobs).
   * Cache-hit jobs share the same cacheSourceJobId, so results may come from
   * another session's jobs — the serp_results collection is queried by the
   * effective jobId resolved per job.
   */
  async getSessionSerpResults(sessionId: string): Promise<SerpAnalyzerResult[]> {
    const db = await connectToMongo();
    const results = await db
      .collection('serp_results')
      .find({ sessionId })
      .sort({ updatedAt: -1 })
      .toArray();
    return results as unknown as SerpAnalyzerResult[];
  }

  /**
   * Retrieve a single keyword's historical rank data for a domain+keyword pair
   * across multiple serp_results documents (i.e. across multiple jobs/runs).
   */
  async getKeywordHistory(
    sessionId: string,
    keyword: string,
  ): Promise<Array<{ timestamp: string; rank: number | null; jobId: string }>> {
    try {
      const db = await connectToMongo();
      const docs = await db
        .collection('serp_results')
        .find(
          { sessionId, 'keyword_results.keyword': keyword },
          { projection: { jobId: 1, timestamp: 1, keyword_results: 1 } },
        )
        .sort({ timestamp: 1 })
        .toArray();

      return docs.map((doc: any) => {
        const kwResult = (doc.keyword_results || []).find(
          (r: any) => r.keyword === keyword,
        );
        return {
          timestamp: kwResult?.timestamp ?? doc.timestamp,
          rank: kwResult?.target_rank ?? null,
          jobId: doc.jobId,
        };
      });
    } catch (error: any) {
      logger.error(`[MODULE_A] getKeywordHistory failed: ${error.message}`);
      throw error;
    }
  }

  async askModuleAAI(
    jobId: string,
    userId: string,
    payload: { question: string; conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }> },
  ): Promise<ModuleAAskAIResult> {
    const job = await this.jobService.getJobById(userId, jobId);
    if (!job?.projectId) {
      throw new Error('Job not found or access denied');
    }

    const endpoint = `${env.NPY_BACKEND_URL}/module-a/ask-ai`;
    const body: Record<string, unknown> = {
      project_id: job.projectId,
      job_id: jobId,
      question: payload.question,
    };
    if (payload.conversationHistory?.length) {
      body.conversation_history = payload.conversationHistory.map((t) => ({
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
      if (typeof raw.detail === 'string') detail = raw.detail;
      else if (typeof raw.message === 'string') detail = raw.message;
      logger.error(`Module A Ask AI failed: ${res.status} — ${detail}`);
      throw new Error(detail || 'Ask AI request failed');
    }

    return {
      answer: typeof raw.answer === 'string' ? raw.answer : '',
      question_type: typeof raw.question_type === 'string' ? raw.question_type : undefined,
      sources: Array.isArray(raw.sources) ? (raw.sources as string[]) : undefined,
      data_available: typeof raw.data_available === 'boolean' ? raw.data_available : undefined,
      context_snapshot:
        raw.context_snapshot && typeof raw.context_snapshot === 'object'
          ? (raw.context_snapshot as Record<string, unknown>)
          : undefined,
    };
  }

  async getModuleASuggestedQuestions(
    jobId: string,
    userId: string,
  ): Promise<{ questions: string[] }> {
    const job = await this.jobService.getJobById(userId, jobId);
    if (!job?.projectId) {
      throw new Error('Job not found or access denied');
    }

    const endpoint = `${env.NPY_BACKEND_URL}/module-a/ask-ai/suggested-questions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: job.projectId }),
      signal: AbortSignal.timeout(30_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module A suggested questions failed: ${res.status} — ${detail}`);
      throw new Error(detail || 'Suggested questions request failed');
    }

    return {
      questions: Array.isArray(raw.questions) ? (raw.questions as string[]) : [],
    };
  }
}

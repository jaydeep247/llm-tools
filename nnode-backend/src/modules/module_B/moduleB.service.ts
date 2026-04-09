import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';
import { JobService } from '../job/job.service';
import type { ModuleBAskAIResult } from './moduleB.types';

export class ModuleBService {
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
  }

  async askModuleBAI(
    jobId: string,
    userId: string,
    payload: { question: string; conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }> },
  ): Promise<ModuleBAskAIResult> {
    const job = await this.jobService.getJobById(userId, jobId);
    if (!job?.projectId) {
      throw new Error('Job not found or access denied');
    }

    const endpoint = `${env.NPY_BACKEND_URL}/module-b/ask-ai`;
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
      logger.error(`Module B Ask AI failed: ${res.status} — ${detail}`);
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

  async getModuleBSuggestedQuestions(
    jobId: string,
    userId: string,
  ): Promise<{ questions: string[] }> {
    const job = await this.jobService.getJobById(userId, jobId);
    if (!job?.projectId) {
      throw new Error('Job not found or access denied');
    }

    const endpoint = `${env.NPY_BACKEND_URL}/module-b/ask-ai/suggested-questions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: job.projectId }),
      signal: AbortSignal.timeout(30_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module B suggested questions failed: ${res.status} — ${detail}`);
      throw new Error(detail || 'Suggested questions request failed');
    }

    return {
      questions: Array.isArray(raw.questions) ? (raw.questions as string[]) : [],
    };
  }
}

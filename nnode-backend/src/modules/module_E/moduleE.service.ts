import { moduleERepository } from './moduleE.repository';
import { JobService } from '../job/job.service';
import { JobRepository } from '../job/job.repository';
import type { ModuleEResult } from './moduleE.types';
import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';
import { ProjectService } from '../project/project.service';

export class ModuleEService {
  private jobService: JobService;
  private projectService: ProjectService;
  private jobRepository = new JobRepository();

  constructor() {
    this.jobService = new JobService();
    this.projectService = new ProjectService();
  }

  /**
   * Get Module E result by job ID
   */
  async getModuleEResult(jobId: string, userId: string): Promise<ModuleEResult | null> {
    await this.jobService.getJobById(userId, jobId);
    const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
    return await moduleERepository.getModuleEResultByJobId(effectiveId);
  }

  /**
   * Save or update Module E result
   */
  async saveModuleEResult(jobId: string, data: ModuleEResult): Promise<any> {
    return await moduleERepository.upsertModuleEResult(jobId, data);
  }

  /**
   * Update specific Module E fields
   */
  async updateModuleEFields(jobId: string, fields: Partial<ModuleEResult>): Promise<any> {
    return await moduleERepository.updateModuleEFields(jobId, fields);
  }

  /**
   * Delete Module E result
   */
  async deleteModuleEResult(jobId: string): Promise<boolean> {
    return await moduleERepository.deleteModuleEResult(jobId);
  }

  /**
   * Get all Module E results with pagination
   */
  async getAllModuleEResults(skip = 0, take = 10): Promise<any[]> {
    return await moduleERepository.getAllModuleEResults(skip, take);
  }

  /**
   * Count total Module E records
   */
  async countModuleEResults(): Promise<number> {
    return await moduleERepository.countModuleEResults();
  }

  async askModuleEAI(
    userId: string,
    payload: {
      project_id: string;
      question: string;
      job_id?: string;
      conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
  ): Promise<Record<string, unknown>> {
    await this.projectService.verifyOwnership(payload.project_id, userId);

    const endpoint = `${env.NPY_BACKEND_URL}/module-e/ask-ai`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module E Ask AI failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Ask AI request failed');
    }
    return raw;
  }

  async getSuggestedQuestions(
    userId: string,
    payload: { project_id: string },
  ): Promise<Record<string, unknown>> {
    await this.projectService.verifyOwnership(payload.project_id, userId);

    const endpoint = `${env.NPY_BACKEND_URL}/module-e/ask-ai/suggested-questions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module E suggested questions failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Suggested questions request failed');
    }
    return raw;
  }

  async getPerceptionSources(
    userId: string,
    query: {
      job_id: string;
      customer_root_domain: string;
      search?: string;
      llm?: string;
      property?: string;
      type?: 'all' | 'owned' | 'third-party';
      date_from?: string;
      date_to?: string;
      limit_domains?: number;
    },
  ): Promise<Record<string, unknown>> {
    await this.jobService.getJobById(userId, query.job_id);
    const endpoint = `${env.NPY_BACKEND_URL}/module-e/perception-sources`;
    const params = new URLSearchParams();

    params.set('job_id', query.job_id);
    params.set('customer_root_domain', query.customer_root_domain);
    if (query.search) params.set('search', query.search);
    if (query.llm) params.set('llm', query.llm);
    if (query.property) params.set('property', query.property);
    if (query.type) params.set('type', query.type);
    if (query.date_from) params.set('date_from', query.date_from);
    if (query.date_to) params.set('date_to', query.date_to);
    if (typeof query.limit_domains === 'number') params.set('limit_domains', String(query.limit_domains));

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(60_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module E perception sources failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Perception sources request failed');
    }
    return raw;
  }

  async getPerceptionSourceResponses(
    userId: string,
    query: {
      job_id: string;
      domain: string;
      customer_root_domain: string;
      llm?: string;
      property?: string;
      type?: 'all' | 'owned' | 'third-party';
      date_from?: string;
      date_to?: string;
      limit?: number;
    },
  ): Promise<Record<string, unknown>> {
    await this.jobService.getJobById(userId, query.job_id);
    const endpoint = `${env.NPY_BACKEND_URL}/module-e/perception-sources/responses`;
    const params = new URLSearchParams();

    params.set('job_id', query.job_id);
    params.set('domain', query.domain);
    params.set('customer_root_domain', query.customer_root_domain);
    if (query.llm) params.set('llm', query.llm);
    if (query.property) params.set('property', query.property);
    if (query.type) params.set('type', query.type);
    if (query.date_from) params.set('date_from', query.date_from);
    if (query.date_to) params.set('date_to', query.date_to);
    if (typeof query.limit === 'number') params.set('limit', String(query.limit));

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(60_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module E perception source responses failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Perception source responses request failed');
    }
    return raw;
  }

  async runPerceptionAnalysis(
    userId: string,
    body: {
      job_id: string;
      brand_name: string;
      domain: string;
      market?: string;
      language?: string;
      properties?: string[];
      models?: string[];
    },
  ): Promise<Record<string, unknown>> {
    await this.jobService.getJobById(userId, body.job_id);
    const endpoint = `${env.NPY_BACKEND_URL}/module-e/perception/run`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module E perception run failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Perception run request failed');
    }
    return raw;
  }

  async getPerceptionAnalysis(
    userId: string,
    query: { job_id: string },
  ): Promise<Record<string, unknown>> {
    await this.jobService.getJobById(userId, query.job_id);
    const endpoint = `${env.NPY_BACKEND_URL}/module-e/perception`;
    const params = new URLSearchParams({ job_id: query.job_id });
    const res = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(60_000),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module E perception fetch failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Perception fetch request failed');
    }
    return raw;
  }

  async getPerceptionSourcesOverview(
    userId: string,
    query: {
      job_id: string;
      customer_root_domain: string;
      llm?: string;
      property?: string;
      type?: 'all' | 'owned' | 'third-party';
      date_from?: string;
      date_to?: string;
      top_n_domains?: number;
    },
  ): Promise<Record<string, unknown>> {
    await this.jobService.getJobById(userId, query.job_id);
    const endpoint = `${env.NPY_BACKEND_URL}/module-e/perception-sources-overview`;
    const params = new URLSearchParams();
    params.set('job_id', query.job_id);
    params.set('customer_root_domain', query.customer_root_domain);
    if (query.llm) params.set('llm', query.llm);
    if (query.property) params.set('property', query.property);
    if (query.type) params.set('type', query.type);
    if (query.date_from) params.set('date_from', query.date_from);
    if (query.date_to) params.set('date_to', query.date_to);
    if (typeof query.top_n_domains === 'number') params.set('top_n_domains', String(query.top_n_domains));

    const res = await fetch(`${endpoint}?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(60_000),
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module E perception sources overview failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Perception sources overview request failed');
    }
    return raw;
  }
}

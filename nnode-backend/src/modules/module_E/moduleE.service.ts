import { moduleERepository } from './moduleE.repository';
import { JobService } from '../job/job.service';
import type { ModuleEResult } from './moduleE.types';
import { env } from '../../config/env';
import { logger } from '../../shared/logger/logger';
import { ProjectService } from '../project/project.service';

export class ModuleEService {
  private jobService: JobService;
  private projectService: ProjectService;

  constructor() {
    this.jobService = new JobService();
    this.projectService = new ProjectService();
  }

  /**
   * Get Module E result by job ID
   */
  async getModuleEResult(jobId: string, userId: string): Promise<ModuleEResult | null> {
    await this.jobService.getJobById(userId, jobId);
    return await moduleERepository.getModuleEResultByJobId(jobId);
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
}

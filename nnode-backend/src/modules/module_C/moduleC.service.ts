import { connectToMongo } from '../../config/mongo';
import { logger } from '../../shared/logger/logger';
import { ModuleCResult } from './moduleC.types';
import { env } from '../../config/env';
import { ProjectService } from '../project/project.service';
import { JobRepository } from '../job/job.repository';

export class ModuleCService {
  private projectService: ProjectService;
  private jobRepository = new JobRepository();

  constructor() {
    this.projectService = new ProjectService();
  }

  private async findLatestResult(db: any, jobIds: string[], url?: string | null, projection?: any): Promise<any | null> {
    const collection = db.collection('module_c');

    const filter: any = { jobId: { $in: jobIds } };
    if (url) {
      const normalizedUrl = url.endsWith('/') ? url.slice(0, -1) : url;
      const altUrl = url.endsWith('/') ? url : `${url}/`;
      filter.$or = [{ url: normalizedUrl }, { url: altUrl }, { url }];
    }

    return collection.findOne(filter, {
      sort: { timestamp: -1 },
      ...(projection ? { projection } : {}),
    });
  }

  /**
   * Get effective job IDs (includes the requested jobId and any analysis jobs that used it as a source)
   */
  private async getEffectiveJobIds(db: any, jobId: string): Promise<string[]> {
    const jobIds = [jobId];
    const analysisJobs = await db.collection('jobs').find({
      'config.sourceJobId': jobId,
      jobType: 'AEO_ANALYSIS'
    }).toArray();
    
    if (analysisJobs.length > 0) {
      jobIds.push(...analysisJobs.map((j: any) => j.id));
    }
    return jobIds;
  }

  /**
   * Get Module C (AEO) analysis result for a specific job.
   * Resolves cacheSourceJobId so cache-hit sessions read from the original job's data.
   */
  async getModuleCResult(jobId: string, _userId: string, url?: string | null): Promise<ModuleCResult | null> {
    try {
      const db = await connectToMongo();
      const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
      const jobIds = await this.getEffectiveJobIds(db, effectiveId);
      const result = await this.findLatestResult(db, jobIds, url);

      if (!result) {
        return null;
      }

      return result as unknown as ModuleCResult;
    } catch (error: any) {
      logger.error(`Error getting Module C result: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all Module C (AEO) analysis results for a job (multiple URLs).
   * Resolves cacheSourceJobId so cache-hit sessions read from the original job's data.
   */
  async getAllModuleCResults(jobId: string): Promise<ModuleCResult[]> {
    try {
      const db = await connectToMongo();
      const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
      const jobIds = await this.getEffectiveJobIds(db, effectiveId);
      const collection = db.collection('module_c');
      
      const results = await collection
        .find({ jobId: { $in: jobIds } })
        .sort({ timestamp: -1 })
        .toArray();

      return results as unknown as ModuleCResult[];
    } catch (error: any) {
      logger.error(`Error getting Module C results: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get Module C result for a specific URL in a session.
   * Resolves cacheSourceJobId so cache-hit sessions read from the original job's data.
   */
  async getModuleCResultByUrl(jobId: string, url: string): Promise<ModuleCResult | null> {
    try {
      const db = await connectToMongo();
      const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
      const jobIds = await this.getEffectiveJobIds(db, effectiveId);
      const result = await this.findLatestResult(db, jobIds, url);

      return result as unknown as ModuleCResult;
    } catch (error: any) {
      logger.error(`Error getting Module C result by URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get Module C results for a session (across all jobs)
   */
  async getSessionModuleCResults(sessionId: string): Promise<ModuleCResult[]> {
    try {
      const db = await connectToMongo();
      
      // First, get all jobs for this session
      const jobsCollection = db.collection('jobs');
      const jobs = await jobsCollection.find({ sessionId }).toArray();
      
      if (!jobs.length) {
        return [];
      }

      // Resolve cacheSourceJobId for each job so cache-hit sessions read from real data
      const effectiveIds = await Promise.all(
        jobs.map(j => this.jobRepository.resolveEffectiveJobId(j.id))
      );
      
      // Then get all module_c results for these jobs
      const moduleCCollection = db.collection('module_c');
      const results = await moduleCCollection
        .find({ jobId: { $in: effectiveIds } })
        .sort({ timestamp: -1 })
        .toArray();

      return results as unknown as ModuleCResult[];
    } catch (error: any) {
      logger.error(`Error getting session Module C results: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a specific module field from Module C result
   */
  async getModuleField(jobId: string, field: string, url?: string | null): Promise<any> {
    try {
      const db = await connectToMongo();
      const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
      const jobIds = await this.getEffectiveJobIds(db, effectiveId);
      const result = await this.findLatestResult(db, jobIds, url, {
        jobId: 1,
        url: 1,
        [`modules.${field}`]: 1,
        timestamp: 1,
      });

      if (!result) {
        return null;
      }

      return {
        jobId: result.jobId,
        url: result.url,
        data: result.modules?.[field] || null,
        timestamp: result.timestamp,
      };
    } catch (error: any) {
      logger.error(`Error getting Module C field ${field}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get summary with overall score and all module scores
   */
  async getSummary(jobId: string, url?: string | null): Promise<any> {
    try {
      const db = await connectToMongo();
      const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
      const jobIds = await this.getEffectiveJobIds(db, effectiveId);
      const result = await this.findLatestResult(db, jobIds, url);

      if (!result) {
        return null;
      }

      const modules = result.modules || {};
      
      return {
        jobId: result.jobId,
        url: result.url,
        domain: result.domain ?? null,
        industry: result.industry ?? null,
        overall_score: result.overall_score,
        module_scores: {
          aeo_checker: modules.aeo_checker?.llm_friendliness_score ?? null,
          entity_coverage: modules.entity_coverage?.entity_coverage_pct ?? null,
          answer_completeness: modules.answer_completeness?.completeness_score ?? null,
          llm_simulator: modules.llm_simulator?.consistency?.overall ?? null,
          multi_model: modules.multi_model?.overall ?? null,
        },
        c8_page_actions: {
          total_actions: modules.page_actions?.total_actions ?? 0,
          priority_breakdown: modules.page_actions?.priority_breakdown ?? {},
          current_score: modules.page_actions?.current_score ?? null,
          predicted_score: modules.page_actions?.predicted_score ?? null,
          improvement: modules.page_actions?.improvement ?? 0,
        },
        timestamp: result.timestamp,
      };
    } catch (error: any) {
      logger.error(`Error getting Module C summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get AI Visibility Report for a job
   */
  async getVisibilityReport(jobId: string, url?: string | null): Promise<any> {
    try {
      const db = await connectToMongo();
      const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
      const jobIds = await this.getEffectiveJobIds(db, effectiveId);
      const result = await this.findLatestResult(db, jobIds, url, {
        jobId: 1,
        url: 1,
        'modules.ai_visibility_report': 1,
        timestamp: 1,
      });

      if (!result) {
        return null;
      }

      return {
        jobId: result.jobId,
        url: result.url,
        data: result.modules?.ai_visibility_report ?? null,
        timestamp: result.timestamp,
      };
    } catch (error: any) {
      logger.error(`Error getting AI Visibility Report: ${error.message}`);
      throw error;
    }
  }

  async askModuleCAI(
    userId: string,
    payload: {
      project_id: string;
      question: string;
      job_id?: string;
      conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
  ): Promise<Record<string, unknown>> {
    await this.projectService.verifyOwnership(payload.project_id, userId);

    const endpoint = `${env.NPY_BACKEND_URL}/module-c/ask-ai`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module C Ask AI failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Ask AI request failed');
    }
    return raw;
  }

  async getSuggestedQuestions(
    userId: string,
    payload: { project_id: string },
  ): Promise<Record<string, unknown>> {
    await this.projectService.verifyOwnership(payload.project_id, userId);

    const endpoint = `${env.NPY_BACKEND_URL}/module-c/ask-ai/suggested-questions`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail = typeof raw.detail === 'string' ? raw.detail : res.statusText;
      logger.error(`Module C suggested questions failed: ${res.status} - ${detail}`);
      throw new Error(detail || 'Suggested questions request failed');
    }
    return raw;
  }
}

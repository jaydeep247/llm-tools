import { connectToMongo } from '../../config/mongo';
import { JobService } from '../job/job.service';
import type { ModuleEResult } from './moduleE.types';
import { logger } from '../../shared/logger/logger';

export class ModuleEService {
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
  }

  async getModuleEResult(jobId: string, userId: string): Promise<ModuleEResult | null> {
    await this.jobService.getJobById(jobId, userId);

    const db = await connectToMongo();
    const result = await db.collection('job_summaries').findOne({
      jobId,
      type: 'module_e',
    });

    logger.info('Module E DB lookup', {
      jobId,
      found: !!result,
    });

    if (!result) return null;

    return {
      jobId: result.jobId,
      url: result.url,
      content_consistency: result.content_consistency,
      entity_coverage: result.entity_coverage,
      createdAt: result.createdAt?.toISOString?.() || result.createdAt,
    } as ModuleEResult;
  }
}

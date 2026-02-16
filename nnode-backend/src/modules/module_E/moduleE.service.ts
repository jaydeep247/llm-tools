import { moduleERepository } from './moduleE.repository';
import { JobService } from '../job/job.service';
import type { ModuleEResult } from './moduleE.types';
import { logger } from '../../shared/logger/logger';

export class ModuleEService {
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
  }

  /**
   * Get Module E result by job ID
   */
  async getModuleEResult(jobId: string, userId: string): Promise<ModuleEResult | null> {
    await this.jobService.getJobById(jobId, userId);

    logger.info('Fetching Module E result', { jobId });
    
    const result = await moduleERepository.getModuleEResultByJobId(jobId);

    logger.info('Module E DB lookup', {
      jobId,
      found: !!result,
    });

    return result;
  }

  /**
   * Save or update Module E result
   */
  async saveModuleEResult(jobId: string, data: ModuleEResult): Promise<any> {
    logger.info('Saving Module E result', {
      jobId,
      hasContentConsistency: !!data.content_consistency,
      hasEntityCoverage: !!data.entity_coverage,
      hasBrandAnalysis: !!data.brand_analysis,
    });

    return await moduleERepository.upsertModuleEResult(jobId, data);
  }

  /**
   * Update specific Module E fields
   */
  async updateModuleEFields(jobId: string, fields: Partial<ModuleEResult>): Promise<any> {
    logger.info('Updating Module E fields', { jobId, fields: Object.keys(fields) });
    return await moduleERepository.updateModuleEFields(jobId, fields);
  }

  /**
   * Delete Module E result
   */
  async deleteModuleEResult(jobId: string): Promise<boolean> {
    logger.info('Deleting Module E result', { jobId });
    return await moduleERepository.deleteModuleEResult(jobId);
  }

  /**
   * Get all Module E results with pagination
   */
  async getAllModuleEResults(skip = 0, take = 10): Promise<any[]> {
    logger.info('Fetching all Module E results', { skip, take });
    return await moduleERepository.getAllModuleEResults(skip, take);
  }

  /**
   * Count total Module E records
   */
  async countModuleEResults(): Promise<number> {
    return await moduleERepository.countModuleEResults();
  }
}

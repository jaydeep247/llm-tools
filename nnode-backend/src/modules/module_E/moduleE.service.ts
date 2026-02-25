import { moduleERepository } from './moduleE.repository';
import { JobService } from '../job/job.service';
import type { ModuleEResult } from './moduleE.types';

export class ModuleEService {
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
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
}

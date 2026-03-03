import { quickStartRepository } from './quickStart.repository';
import { JobService } from '../job/job.service';
import type { QuickStartResult } from './quickStart.types';

export class QuickStartService {
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
  }

  /**
   * Get Quick Start result by job ID (validates user access via job lookup)
   */
  async getQuickStartResult(jobId: string, userId: string): Promise<QuickStartResult | null> {
    await this.jobService.getJobById(userId, jobId);
    return await quickStartRepository.getByJobId(jobId);
  }
}

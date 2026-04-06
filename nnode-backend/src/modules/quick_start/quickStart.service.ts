import { quickStartRepository } from './quickStart.repository';
import { JobService } from '../job/job.service';
import { JobRepository } from '../job/job.repository';
import { QueueService } from '../queue/queue.service';
import { JobType } from '../job/job.types';
import type { QuickStartResult } from './quickStart.types';

export class QuickStartService {
  private jobService: JobService;
  private queueService: QueueService;
  private jobRepository = new JobRepository();

  constructor() {
    this.jobService = new JobService();
    this.queueService = new QueueService();
  }

  /**
   * Get Quick Start result by job ID (validates user access via job lookup)
   */
  async getQuickStartResult(jobId: string, userId: string): Promise<QuickStartResult | null> {
    await this.jobService.getJobById(userId, jobId);
    const effectiveId = await this.jobRepository.resolveEffectiveJobId(jobId);
    return await quickStartRepository.getByJobId(effectiveId);
  }

  /**
   * Resume a paused Quick Start crawl.
   * Validates user access, then enqueues a CRAWL_RESUME job.
   */
  async resumeCrawl(jobId: string, userId: string): Promise<void> {
    const job = await this.jobService.getJobById(userId, jobId);
    await this.queueService.publishCrawlResumeJob({
      jobId,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.CRAWL_RESUME,
    });
  }
}

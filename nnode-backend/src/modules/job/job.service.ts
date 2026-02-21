import { JobRepository } from './job.repository';
import { CreateJobDto, Job, JobStatus, JobType } from './job.types';
import { SessionService } from '../session/session.service';
import { SessionStatus } from '../session/session.types';
import { QueueService } from '../queue/queue.service';

export class JobService {
  private jobRepository: JobRepository;
  private sessionService: SessionService;
  private queueService: QueueService;

  constructor() {
    this.jobRepository = new JobRepository();
    this.sessionService = new SessionService();
    this.queueService = new QueueService();
  }

  async createJob(userId: string, sessionId: string, data: CreateJobDto): Promise<Job> {
    const session = await this.sessionService.getSessionById(sessionId, userId);
    const projectId = session.project?.id;
    if (!projectId) {
      throw new Error('Session is not associated with a project');
    }

    const job = await this.jobRepository.create(sessionId, projectId, data);

    if (job.type === JobType.SCHEMA) {
      await this.queueService.publishSchemaJob({
        jobId: job.id,
        sessionId,
        projectId,
        url: job.url,
        schemaType: job.schemaType || undefined,
      });
    } else if (job.jobType === JobType.CRAWL) {
      await this.queueService.publishCrawlJob({
        jobId: job.id,
        sessionId,
        projectId,
        url: job.url,
        allowSubdomains: job.allowSubdomains,
        runAudits: job.runAudits,
        auditDevice: job.auditDevice,
        captureLinkDetails: job.captureLinkDetails,
      });
    } else if (job.jobType === JobType.AEO_ANALYSIS) {
      await this.queueService.publishAnalysisJob({
        jobId: job.id,
        sessionId,
        projectId,
        url: job.url,
        modules: job.config?.modules || [],
        sourceJobId: job.config?.sourceJobId,
        config: job.config,
      });
    }

    return job;
  }

  async getJobById(userId: string, jobId: string): Promise<Job> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) {
      throw new Error('Job not found');
    }
    await this.sessionService.getSessionById(job.sessionId, userId);
    return job;
  }

  async getJobsForSession(userId: string, sessionId: string): Promise<Job[]> {
    await this.sessionService.getSessionById(sessionId, userId);
    return this.jobRepository.findBySessionId(sessionId);
  }

  async startContentMetrics(userId: string, jobId: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);

    await this.queueService.publishContentMetricsJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
    });

    return job;
  }

  async startSchemaGeneration(userId: string, jobId: string, schemaType?: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);

    await this.queueService.publishSchemaJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      schemaType: schemaType || job.schemaType || undefined,
    });

    return job;
  }


  async markRunning(jobId: string): Promise<Job> {
    return this.jobRepository.updateStatus(jobId, JobStatus.RUNNING, new Date(), null, null);
  }

  async markCompleted(jobId: string): Promise<Job> {
    return this.jobRepository.updateStatus(jobId, JobStatus.COMPLETED, undefined, new Date(), null);
  }

  async markFailed(jobId: string, errorMessage: string): Promise<Job> {
    return this.jobRepository.updateStatus(jobId, JobStatus.FAILED, undefined, new Date(), errorMessage);
  }

  /**
   * Cancel a running job (called when user closes browser or navigates away)
   */
  async cancelJob(userId: string, jobId: string, reason?: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    
    // Only allow cancellation if job is pending or running
    if (job.status !== JobStatus.PENDING && job.status !== JobStatus.RUNNING) {
      throw new Error(`Cannot cancel job in ${job.status} state`);
    }

    // Update session status to failed
    await this.sessionService.updateSessionStatus(job.sessionId, userId, SessionStatus.FAILED);

    const message = reason === 'browser_closed' 
      ? 'Job cancelled - browser was closed during crawl'
      : 'Job cancelled by user';

    return this.jobRepository.updateStatus(
      jobId,
      JobStatus.FAILED,
      undefined,
      new Date(),
      message
    );
  }

  /**
   * Retry a failed job by creating a new job with the same config
   */
  async retryJob(userId: string, jobId: string): Promise<Job> {
    const failedJob = await this.getJobById(userId, jobId);
    
    if (failedJob.status !== JobStatus.FAILED) {
      throw new Error('Can only retry failed jobs');
    }

    // Create a new job with the same configuration
    const newJob = await this.createJob(userId, failedJob.sessionId, {
      url: failedJob.url,
      jobType: failedJob.jobType,
      config: failedJob.config,
      allowSubdomains: failedJob.allowSubdomains,
      runAudits: failedJob.runAudits,
      auditDevice: failedJob.auditDevice,
      captureLinkDetails: failedJob.captureLinkDetails,
    });

    // Update session status back to running
    await this.sessionService.updateSessionStatus(failedJob.sessionId, userId, SessionStatus.RUNNING);

    return newJob;
  }
}

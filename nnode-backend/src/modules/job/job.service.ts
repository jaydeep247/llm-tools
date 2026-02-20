import { JobRepository } from './job.repository';
import { CreateJobDto, Job, JobStatus, JobType } from './job.types';
import { SessionService } from '../session/session.service';
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

    if (job.jobType === JobType.CRAWL) {
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

  async markRunning(jobId: string): Promise<Job> {
    return this.jobRepository.updateStatus(jobId, JobStatus.RUNNING, new Date(), null, null);
  }

  async markCompleted(jobId: string): Promise<Job> {
    return this.jobRepository.updateStatus(jobId, JobStatus.COMPLETED, undefined, new Date(), null);
  }

  async markFailed(jobId: string, errorMessage: string): Promise<Job> {
    return this.jobRepository.updateStatus(jobId, JobStatus.FAILED, undefined, new Date(), errorMessage);
  }
}


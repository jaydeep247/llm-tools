import { JobRepository } from './job.repository';
import { CreateJobDto, Job, JobConflictError, JobStatus, JobType, JobCategory, JOB_TYPE_TO_CATEGORY } from './job.types';
import { SessionService } from '../session/session.service';
import { SessionStatus } from '../session/session.types';
import { QueueService } from '../queue/queue.service';
import { LiveJobService } from '../../services/live-job.service';

export class JobService {
  private jobRepository: JobRepository;
  private sessionService: SessionService;
  private queueService: QueueService;

  constructor() {
    this.jobRepository = new JobRepository();
    this.sessionService = new SessionService();
    this.queueService = new QueueService();
  }

  private normalizeUrl = (raw?: string): string | undefined => {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      return undefined;
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return `https://${trimmed}`;
  };

  /**
   * Create and queue a job based on its type
   * Each job type is routed to its isolated queue
   */
  async createJob(userId: string, sessionId: string, data: CreateJobDto): Promise<Job> {
    const session = await this.sessionService.getSessionById(sessionId, userId);
    const projectId = session.project?.id;
    if (!projectId) {
      throw new Error('Session is not associated with a project');
    }

    // Guard: reject if the same job type is already active for this session.
    // Without this check, two requests arriving in the same window create two
    // concurrent jobs that both write to the same Mongo document, race on
    // JOB_COMPLETED events, and can mark the session completed prematurely.
    const existing = await this.jobRepository.findActiveBySessionAndType(sessionId, data.jobType);
    if (existing) {
      throw new JobConflictError(
        `A ${data.jobType} job (${existing.id}) is already active for this session. ` +
        `Wait for it to finish or cancel it before starting a new one.`,
        existing.id,
      );
    }

    const job = await this.jobRepository.create(sessionId, projectId, data);

    // Save job metadata to Redis for LiveJobService (progress tracking)
    await LiveJobService.setJobMeta(job.id, projectId, sessionId);

    const jobType = job.jobType || job.type;
    const category = JOB_TYPE_TO_CATEGORY[jobType];

    // Route to appropriate queue based on job category
    switch (category) {
      case JobCategory.CRAWLER:
        await this.queueService.publishCrawlJob({
          jobId: job.id,
          sessionId,
          projectId,
          url: job.url,
          jobType: JobType.CRAWL,
          allowSubdomains: job.allowSubdomains,
          runAudits: job.runAudits,
          auditDevice: job.auditDevice,
          captureLinkDetails: job.captureLinkDetails,
        });
        break;

      case JobCategory.SCHEMA:
        await this.queueService.publishSchemaJob({
          jobId: job.id,
          sessionId,
          projectId,
          url: job.url,
          jobType: JobType.SCHEMA,
          schemaType: job.schemaType || undefined,
          sourceJobId: job.config?.sourceJobId,
        });
        break;

      case JobCategory.MODULE_C:
        await this.queueService.publishModuleCJob({
          jobId: job.id,
          sessionId,
          projectId,
          url: job.url,
          jobType: jobType as JobType,
          query: job.config?.query,
          sourceJobId: job.config?.sourceJobId,
        });
        break;

      case JobCategory.MODULE_D:
        await this.queueService.publishModuleDJob({
          jobId: job.id,
          sessionId,
          projectId,
          url: job.url,
          jobType: jobType as JobType,
          sourceJobId: job.config?.sourceJobId,
        });
        break;

      case JobCategory.MODULE_E:
        await this.queueService.publishModuleEJob({
          jobId: job.id,
          sessionId,
          projectId,
          url: job.url,
          jobType: jobType as JobType,
          sourceJobId: job.config?.sourceJobId,
          brandName: job.config?.brandName,
        });
        break;

      case JobCategory.MODULE_F:
        await this.queueService.publishModuleFJob({
          jobId: job.id,
          sessionId,
          projectId,
          url: job.url,
          jobType: jobType as JobType,
          sourceJobId: job.config?.sourceJobId,
        });
        break;

      case JobCategory.MODULE_A:
        await this.queueService.publishModuleAJob({
          jobId: job.id,
          sessionId,
          projectId,
          url: job.url,
          jobType: jobType as JobType,
          keywords: job.config?.keywords || [],
          competitors: job.config?.competitors,
          locationCode: job.config?.locationCode,
          languageCode: job.config?.languageCode,
          device: job.config?.device,
          sourceJobId: job.config?.sourceJobId,
        });
        break;

      default:
        // Legacy fallback - use analysis job publisher
        await this.queueService.publishAnalysisJob({
          jobId: job.id,
          sessionId,
          projectId,
          url: job.url,
          jobType: jobType as JobType,
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

  // ============ MODULE D (Content Metrics) ============
  async startContentMetrics(userId: string, jobId: string, sourceJobId?: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);

    // If sourceJobId is omitted, resolve the job that owns raw HTML in S3.
    // Normal flow: CRAWL job. Quick Start flow: MODULE_E_QUICK_START job.
    let resolvedSourceJobId = sourceJobId;
    if (!resolvedSourceJobId) {
      const sessionJobs = await this.jobRepository.findBySessionId(job.sessionId);
      const resolveType = (j: Job) => String(j.jobType || j.type || '').toUpperCase();
      const crawlJob = sessionJobs.find(j => resolveType(j) === JobType.CRAWL);
      const quickStartJob = sessionJobs.find(j => {
        const t = resolveType(j);
        return t === JobType.MODULE_E_QUICK_START || t.includes('QUICK_START');
      });

      resolvedSourceJobId = crawlJob?.id || quickStartJob?.id || job.id;
    }

    await this.queueService.publishContentMetricsJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_D,
      sourceJobId: resolvedSourceJobId,
    });

    return job;
  }

  async startPromptTracking(userId: string, jobId: string, trackedPrompts: string[], sourceJobId?: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);

    const cleaned = Array.isArray(trackedPrompts)
      ? trackedPrompts.map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean)
      : [];

    if (cleaned.length === 0) {
      throw new Error('No prompts provided');
    }

    let resolvedSourceJobId = sourceJobId;
    if (!resolvedSourceJobId) {
      const sessionJobs = await this.jobRepository.findBySessionId(job.sessionId);
      const resolveType = (j: Job) => String(j.jobType || j.type || '').toUpperCase();
      const crawlJob = sessionJobs.find(j => resolveType(j) === JobType.CRAWL);
      const quickStartJob = sessionJobs.find(j => {
        const t = resolveType(j);
        return t === JobType.MODULE_E_QUICK_START || t.includes('QUICK_START');
      });

      resolvedSourceJobId = crawlJob?.id || quickStartJob?.id || job.id;
    }

    await this.queueService.publishModuleDJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_D_PROMPT_TRACKING,
      sourceJobId: resolvedSourceJobId,
      trackedPrompts: cleaned,
    });

    return job;
  }

  // ============ SCHEMA (Module B) ============
  async startSchemaGeneration(
    userId: string,
    jobId: string,
    schemaType?: string,
    targetUrl?: string,
  ): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    const resolvedUrl = this.normalizeUrl(targetUrl) || job.url;
    const shouldUseStoredHtml =
      !targetUrl || (this.normalizeUrl(targetUrl) || '').trim() === (job.url || '').trim();

    await this.queueService.publishSchemaJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: resolvedUrl,
      jobType: JobType.SCHEMA,
      schemaType: schemaType || job.schemaType || undefined,
      sourceJobId: shouldUseStoredHtml ? job.id : undefined,
    });

    return job;
  }

  // ============ MODULE E SPECIFIC JOBS ============
  async startModuleEConsistency(userId: string, jobId: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    await this.queueService.publishModuleEConsistencyJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_E_CONSISTENCY,
      sourceJobId: jobId,
    });
    return job;
  }

  async startModuleESentiment(userId: string, jobId: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    await this.queueService.publishModuleESentimentJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_E_SENTIMENT,
      sourceJobId: jobId,
    });
    return job;
  }

  async startModuleECompetitors(userId: string, jobId: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    await this.queueService.publishModuleECompetitorsJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_E_COMPETITORS,
      sourceJobId: jobId,
    });
    return job;
  }

  async startModuleEAiSov(userId: string, jobId: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    await this.queueService.publishModuleEAiSovJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_E_AI_SOV,
      sourceJobId: jobId,
    });
    return job;
  }

  async startModuleERanking(userId: string, jobId: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    await this.queueService.publishModuleERankingJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_E_RANKING,
      sourceJobId: jobId,
    });
    return job;
  }

  async startModuleEBrand(userId: string, jobId: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    await this.queueService.publishModuleEBrandJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_E_BRAND,
      sourceJobId: jobId,
    });
    return job;
  }

  async startModuleEAiCitationRanking(userId: string, jobId: string): Promise<Job> {
    const job = await this.getJobById(userId, jobId);
    await this.queueService.publishModuleEAiCitationRankingJob({
      jobId: job.id,
      sessionId: job.sessionId,
      projectId: job.projectId,
      url: job.url,
      jobType: JobType.MODULE_E_AI_CITATION_RANKING,
      sourceJobId: jobId,
    });
    return job;
  }

  // ============ STATUS MANAGEMENT ============
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

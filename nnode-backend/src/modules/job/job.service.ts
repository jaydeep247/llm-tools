import { JobRepository } from './job.repository';
import { CreateJobDto, JobResponse, JobWithSession, VALID_JOB_TRANSITIONS, CrawlResultsResponse } from './job.types';
import { SessionService } from '../session/session.service';
import { LimitsService } from '../limits/limits.service';
import { JobStatus } from '@prisma/client';
import { connectToMongo } from '../../config/mongo';

export class JobService {
  private jobRepository: JobRepository;
  private sessionService: SessionService;
  private limitsService: LimitsService;

  constructor() {
    this.jobRepository = new JobRepository();
    this.sessionService = new SessionService();
    this.limitsService = new LimitsService();
  }

  /**
   * Create a new job with limit enforcement
   * This is a CONTROL PLANE operation - no execution happens here
   */
  async createJob(sessionId: string, userId: string, data: CreateJobDto): Promise<JobResponse> {
    // Verify session ownership and that session is active
    const session = await this.sessionService.getSessionById(sessionId, userId);
    
    if (session.status !== 'CREATED' && session.status !== 'RUNNING') {
      throw new Error('Session must be CREATED or RUNNING to create jobs');
    }

    // Get account limits
    const limits = await this.limitsService.getAccountLimits(userId);

    // Count total jobs in session
    const totalJobsInSession = await this.jobRepository.countBySessionId(sessionId);

    // Count running jobs in session
    const concurrentJobsInSession = await this.jobRepository.countRunningJobsBySessionId(sessionId);

    // Count running jobs across all user's sessions
    const concurrentJobsForUser = await this.jobRepository.countRunningJobsByUserId(userId);

    // Check if user can create a new job
    if (!this.limitsService.canCreateJob(
      totalJobsInSession,
      concurrentJobsInSession,
      concurrentJobsForUser,
      limits
    )) {
      if (totalJobsInSession >= limits.maxTotalJobsPerSession) {
        throw new Error(
          this.limitsService.getLimitViolationMessage(
            'maxTotalJobsPerSession',
            limits.maxTotalJobsPerSession
          )
        );
      }
      if (concurrentJobsInSession >= limits.maxConcurrentJobsPerSession) {
        throw new Error(
          this.limitsService.getLimitViolationMessage(
            'maxConcurrentJobsPerSession',
            limits.maxConcurrentJobsPerSession
          )
        );
      }
      if (concurrentJobsForUser >= limits.maxConcurrentJobs) {
        throw new Error(
          this.limitsService.getLimitViolationMessage(
            'maxConcurrentJobs',
            limits.maxConcurrentJobs
          )
        );
      }
    }

    // Create job with status PENDING
    // External workers will pull this and execute
    return this.jobRepository.create(sessionId, data);
  }

  /**
   * Get all jobs for a session
   */
  async getSessionJobs(sessionId: string, userId: string): Promise<JobResponse[]> {
    // Verify session ownership
    await this.sessionService.getSessionById(sessionId, userId);

    return this.jobRepository.findBySessionId(sessionId);
  }

  /**
   * Get job by ID
   */
  async getJobById(jobId: string, userId: string): Promise<JobWithSession> {
    const job = await this.jobRepository.findByIdWithSession(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }

    // Verify ownership through session -> project
    if (job.session?.project?.userId !== userId) {
      throw new Error('Job not found or access denied');
    }

    return job;
  }

  /**
   * Update job status (User flow)
   * Users can only Cancel jobs (TODO: Implement proper cancel logic)
   * For now, keeping this generic but arguably users shouldn't manually set RUNNING/COMPLETED
   */
  async updateJobStatus(
    jobId: string,
    userId: string,
    newStatus: JobStatus,
    failureReason?: string
  ): Promise<JobResponse> {
    // Get job with session info
    const job = await this.jobRepository.findByIdWithSession(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }

    // Verify ownership through session -> project
    if (job.session?.project?.userId !== userId) {
      throw new Error('Job not found or access denied');
    }

    // Delegate to shared update logic
    return this._updateJobStatusLogic(job, newStatus, failureReason);
  }

  /**
   * Update job status (Worker flow)
   * Workers bypass ownership checks but still enforce state machine
   */
  async updateJobStatusByWorker(
    jobId: string,
    newStatus: JobStatus,
    failureReason?: string,
    workerId?: string
  ): Promise<JobResponse> {
    const job = await this.jobRepository.findByIdWithSession(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }

    // Delegate to shared update logic
    return this._updateJobStatusLogic(job, newStatus, failureReason, workerId);
  }

  /**
   * Shared status update logic with state machine validation and limit checks
   */
  private async _updateJobStatusLogic(
    job: JobWithSession,
    newStatus: JobStatus,
    failureReason?: string,
    workerId?: string
  ): Promise<JobResponse> {
    // Validate state transition
    const allowedTransitions = VALID_JOB_TRANSITIONS[job.status];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(
        `Invalid state transition: ${job.status} → ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
      );
    }

    // Additional validation for RUNNING state
    if (newStatus === 'RUNNING') {
      // Re-check limits before starting
      // We need the owner ID to check limits
      const userId = job.session?.project?.userId;
      if (!userId) throw new Error('System integrity error: Job has no owner');

      const limits = await this.limitsService.getAccountLimits(userId);
      const concurrentJobsInSession = await this.jobRepository.countRunningJobsBySessionId(job.sessionId);
      const concurrentJobsForUser = await this.jobRepository.countRunningJobsByUserId(userId);

      if (concurrentJobsInSession >= limits.maxConcurrentJobsPerSession) {
        throw new Error(
          this.limitsService.getLimitViolationMessage(
            'maxConcurrentJobsPerSession',
            limits.maxConcurrentJobsPerSession
          )
        );
      }

      if (concurrentJobsForUser >= limits.maxConcurrentJobs) {
        throw new Error(
          this.limitsService.getLimitViolationMessage(
            'maxConcurrentJobs',
            limits.maxConcurrentJobs
          )
        );
      }
    }

    // Update job status
    return this.jobRepository.updateStatus(job.id, newStatus, failureReason, workerId);
  }

  /**
   * Delete job (only if PENDING or FAILED)
   */
  async deleteJob(jobId: string, userId: string): Promise<JobResponse> {
    // Get job with session info
    const job = await this.jobRepository.findByIdWithSession(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }

    // Verify ownership through session -> project
    if (job.session?.project?.userId !== userId) {
      throw new Error('Job not found or access denied');
    }

    // Only allow deletion of PENDING or FAILED jobs
    if (job.status === 'RUNNING') {
      throw new Error('Cannot delete a RUNNING job');
    }

    if (job.status === 'COMPLETED') {
      throw new Error('Cannot delete a COMPLETED job');
    }

    return this.jobRepository.delete(jobId);
  }

  /**
   * Get pending jobs (for external workers to pull)
   * This endpoint is for Python workers to discover work
   */
  async getPendingJobs(limit: number = 10): Promise<JobWithSession[]> {
    return this.jobRepository.findPendingJobs(limit);
  }

  /**
   * Get job statistics for a session
   */
  async getSessionJobStats(sessionId: string, userId: string) {
    // Verify session ownership
    await this.sessionService.getSessionById(sessionId, userId);

    return this.jobRepository.getSessionJobStats(sessionId);
  }

  /**
   * Get aggregated crawl results for a job
   */
  async getJobResults(
    jobId: string,
    userId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<CrawlResultsResponse> {
    // 1. Validate job exists and user owns it
    // getJobById already does both
    const job = await this.getJobById(jobId, userId);

    // 2. Connect to MongoDB
    const db = await connectToMongo();

    // 3. Fetch data from MongoDB
    const skip = (page - 1) * limit;

    // A. Check for aggregated result first (Legacy or specific format support)
    const aggregatedResult = await db.collection('pages').findOne({ jobId, type: 'job_result' });
    
    if (aggregatedResult && (aggregatedResult as any).data) {
      const data = (aggregatedResult as any).data;
      const mongoSession = data.session || {};
      
      return {
        session: {
          ...job,
          allow_subdomains: mongoSession.allow_subdomains,
          max_concurrency: mongoSession.max_concurrency,
          total_pages: mongoSession.total_pages,
          total_links: mongoSession.total_links,
        },
        pages: data.pages ? data.pages.slice(skip, skip + limit) : [],
        links: data.links || {},
        sitemaps: data.sitemaps || [],
        fields: data.fields || [],
      };
    }

    // B. Fetch individual items (New crawler format)
    
    // Fetch counts and config
    const [totalPages, totalLinks] = await Promise.all([
      db.collection('pages').countDocuments({ jobId, type: { $ne: 'job_result' } }),
      db.collection('links').countDocuments({ jobId }),
    ]);

    const jobConfig = job.config as any || {};

    // Fetch pages with pagination
    const pages = await db
      .collection('pages')
      .find({ jobId, type: { $ne: 'job_result' } })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();

    // Fetch sitemaps
    const sitemaps = await db
      .collection('sitemaps')
      .find({ jobId })
      .toArray();

    // Fetch links and group them as before
    const linksArray = await db
      .collection('links')
      .find({ jobId })
      .toArray();

    // Fetch fields
    const fields = await db
      .collection('fields')
      .find({ jobId })
      .toArray();

    const links: Record<string, any[]> = {};
    for (const link of linksArray) {
      const sourceUrl = link.source_url || 'unknown';
      if (!links[sourceUrl]) {
        links[sourceUrl] = [];
      }
      links[sourceUrl].push(link);
    }

    return {
      session: {
        ...job,
        allow_subdomains: jobConfig.allowSubdomains || jobConfig.allow_subdomains,
        max_concurrency: jobConfig.maxConcurrency || jobConfig.max_concurrency,
        total_pages: totalPages,
        total_links: totalLinks,
      },
      pages,
      links,
      sitemaps,
      fields,
    };
  }

  /**
   * Get paginated pages for a job
   */
  async getJobPages(
    jobId: string,
    userId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<any> { // TODO: Define proper return type
    await this.getJobById(jobId, userId);
    const db = await connectToMongo();
    const skip = (page - 1) * limit;

    const [pages, total] = await Promise.all([
      db.collection('pages')
        .find({ jobId, type: { $ne: 'job_result' } })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray(),
      db.collection('pages').countDocuments({ jobId, type: { $ne: 'job_result' } })
    ]);

    return {
      data: pages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get links for a job
   */
  async getJobLinks(
    jobId: string,
    userId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<any> {
    await this.getJobById(jobId, userId);
    const db = await connectToMongo();
    const skip = (page - 1) * limit;

    const [links, total] = await Promise.all([
      db.collection('links')
        .find({ jobId })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('links').countDocuments({ jobId })
    ]);

    return {
      data: links,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get sitemaps for a job
   */
  async getJobSitemaps(jobId: string, userId: string): Promise<any> {
    await this.getJobById(jobId, userId);
    const db = await connectToMongo();

    const sitemaps = await db.collection('sitemaps').find({ jobId }).toArray();

    return { data: sitemaps };
  }

  /**
   * Get fields for a job
   */
  async getJobFields(jobId: string, userId: string): Promise<any> {
    await this.getJobById(jobId, userId);
    const db = await connectToMongo();

    const fields = await db.collection('fields').find({ jobId }).toArray();

    return { data: fields };
  }
}

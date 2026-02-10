import { JobRepository } from './job.repository';
import { CreateJobDto, JobResponse, JobWithSession, VALID_JOB_TRANSITIONS } from './job.types';
import { SessionService } from '../session/session.service';
import { LimitsService } from '../limits/limits.service';
import { JobStatus } from '@prisma/client';

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
    failureReason?: string
  ): Promise<JobResponse> {
    const job = await this.jobRepository.findByIdWithSession(jobId);
    
    if (!job) {
      throw new Error('Job not found');
    }

    // Delegate to shared update logic
    return this._updateJobStatusLogic(job, newStatus, failureReason);
  }

  /**
   * Shared status update logic with state machine validation and limit checks
   */
  private async _updateJobStatusLogic(
    job: JobWithSession,
    newStatus: JobStatus,
    failureReason?: string
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
    return this.jobRepository.updateStatus(job.id, newStatus, failureReason);
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
}

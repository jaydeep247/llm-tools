import { SessionRepository } from './session.repository';
import { SessionResponse, SessionWithProject, SessionStatus, SessionListResponse } from './session.types';
import { ProjectService } from '../project/project.service';
import { LimitsService } from '../limits/limits.service';
import { JobRepository } from '../job/job.repository';
import { JobStatus } from '../job/job.types';
import { LiveJobService } from '../../services/live-job.service';
import { getMongoDb } from '../../config/mongo';
import { getIo } from '../../socket';
import { logger } from '../../shared/logger/logger';

export class SessionService {
  private sessionRepository: SessionRepository;
  private projectService: ProjectService;
  private limitsService: LimitsService;
  private jobRepository: JobRepository;

  constructor() {
    this.sessionRepository = new SessionRepository();
    this.projectService = new ProjectService();
    this.limitsService = new LimitsService();
    this.jobRepository = new JobRepository();
  }

  /**
   * Create a new session with limit enforcement
   */
  async createSession(projectId: string, userId: string): Promise<SessionResponse> {
    // Verify project ownership
    await this.projectService.verifyOwnership(projectId, userId);

    // Get account limits
    const limits = await this.limitsService.getAccountLimits(userId);

    // Count total sessions in project
    const totalSessionsInProject = await this.sessionRepository.countByProjectId(projectId);

    // Count active sessions across all user's projects
    const activeSessionsCount = await this.sessionRepository.countActiveSessionsByUserId(userId);

    // Check if user can create a new session
    if (!this.limitsService.canCreateSession(totalSessionsInProject, activeSessionsCount, limits)) {
      if (totalSessionsInProject >= limits.maxSessionsPerProject) {
        throw new Error(
          this.limitsService.getLimitViolationMessage(
            'maxSessionsPerProject',
            limits.maxSessionsPerProject
          )
        );
      }
      if (activeSessionsCount >= limits.maxActiveSessions) {
        throw new Error(
          this.limitsService.getLimitViolationMessage(
            'maxActiveSessions',
            limits.maxActiveSessions
          )
        );
      }
    }

    // Create session
    return this.sessionRepository.create(projectId);
  }

  /**
   * Get all sessions for a project
   */
  async getProjectSessions(
    projectId: string,
    userId: string,
    options?: { limit?: number; offset?: number; includeTotal?: boolean },
  ): Promise<SessionListResponse> {
    // Verify project ownership
    await this.projectService.verifyOwnership(projectId, userId);

    return this.sessionRepository.findByProjectId(projectId, options);
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string, userId: string): Promise<SessionWithProject> {
    const session = await this.sessionRepository.findByIdWithProject(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    // Verify ownership through project
    if (session.project?.userId !== userId) {
      throw new Error('Session not found or access denied');
    }

    return session;
  }

  /**
   * Update session status
   */
  async updateSessionStatus(
    sessionId: string,
    userId: string,
    status: SessionStatus
  ): Promise<SessionResponse> {
    // Get session with project info
    const session = await this.sessionRepository.findByIdWithProject(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    // Verify ownership through project
    if (session.project?.userId !== userId) {
      throw new Error('Session not found or access denied');
    }

    const endedAt =
      status === SessionStatus.COMPLETED || status === SessionStatus.FAILED
        ? new Date()
        : undefined;

    return this.sessionRepository.updateStatus(sessionId, status, endedAt);
  }

  /**
   * Delete session — stops running jobs, cleans all related data (Mongo + Redis + Socket)
   */
  async deleteSession(sessionId: string, userId: string): Promise<SessionResponse> {
    // Get session with project info
    const session = await this.sessionRepository.findByIdWithProject(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    // Verify ownership through project
    if (session.project?.userId !== userId) {
      throw new Error('Session not found or access denied');
    }

    // 1. Find all jobs — capture active ones before the cascade delete removes them.
    // Quick-start sessions can have job.status=COMPLETED while the background
    // crawl is still active via job_summaries.crawl_status.
    const jobs = await this.jobRepository.findBySessionId(sessionId);
    const db = getMongoDb();
    const activeCrawlSummaries = await db
      .collection('job_summaries')
      .find(
        {
          jobId: { $in: jobs.map((job) => job.id) },
          crawl_status: { $in: ['running', 'paused'] },
        },
        { projection: { jobId: 1 } },
      )
      .toArray();
    const allJobIds = jobs.map((job) => job.id);
    const activeCrawlJobIds = new Set(activeCrawlSummaries.map((summary: any) => String(summary.jobId)));
    const activeJobs = jobs.filter(
      (job) =>
        job.status === JobStatus.PENDING ||
        job.status === JobStatus.RUNNING ||
        activeCrawlJobIds.has(job.id),
    );
    const activeJobIds = activeJobs.map((j) => j.id);

    // 2. Persist the stop in Redis immediately so refresh hydration cannot fall
    //    back to stale RUNNING state while the Python worker is still shutting down.
    if (activeJobIds.length > 0) {
      await Promise.all(
        activeJobIds.map(async (jobId) => {
          await LiveJobService.setCancelFlag(jobId);
          await LiveJobService.markJobCancelled(jobId);
        }),
      );
    }

    // 3. Emit socket events immediately so the frontend marks the jobs as stopped
    try {
      const io = getIo();
      for (const job of activeJobs) {
        const cancelEvent = {
          jobId: job.id,
          eventType: 'JOB_FAILED',
          payload: {
            status: 'failed',
            reason: 'Session deleted by user',
            sessionId,
            projectId: job.projectId,
          },
          timestamp: Date.now(),
        };
        io.to(`job:${job.id}`).emit('job:event', cancelEvent);
        io.to(`job:${job.id}`).emit('job:failed', cancelEvent);
        io.to(`job:${job.id}`).emit('crawl:status', {
          jobId: job.id,
          crawl_status: 'cancelled',
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      logger.warn(`Socket emit error during session delete:`, e);
    }

    // 4. Give running workers a short window to acknowledge the cancel. If a
    //    queued job has not been consumed yet, the cancel flag is preserved with
    //    TTL so the worker can still skip it after the session is deleted.
    if (activeJobIds.length > 0) {
      const cancelResults = await Promise.all(
        activeJobIds.map(async (jobId) => ({
          jobId,
          acknowledged: await LiveJobService.waitForCancelAck(jobId),
        })),
      );

      const unacknowledged = cancelResults
        .filter((result) => !result.acknowledged)
        .map((result) => result.jobId);

      if (unacknowledged.length > 0) {
        logger.warn(`[DELETE_SESSION] Cancel ack timeout for jobs: ${unacknowledged.join(', ')}`);
      }
    }

    // 5. Clean up Redis session hash
    await LiveJobService.cleanupSession(sessionId);

    // 6. Cascade delete — wipes MongoDB (jobs/pages/links/etc.). cleanupJob now
    //    preserves the cancel flag so queued workers cannot resurrect deleted jobs.
    await this.sessionRepository.delete(sessionId);

    void this.jobRepository.sweepDeletedArtifacts(allJobIds, [sessionId]).catch((error) => {
      logger.warn(`[DELETE_SESSION] Background artifact sweep failed for session ${sessionId}:`, error);
    });

    logger.info(`[DELETE_SESSION] ✅ Session ${sessionId} deleted — ${activeJobIds.length} active job(s) signalled to stop`);
    return session as unknown as SessionResponse;
  }

  /**
   * Mark session as completed (System action - no auth check)
   */
  async markSessionCompleted(sessionId: string): Promise<void> {
    await this.sessionRepository.updateStatus(sessionId, SessionStatus.COMPLETED, new Date());
  }

  /**
   * Mark session as failed (System action - no auth check)
   */
  async markSessionFailed(sessionId: string): Promise<void> {
    await this.sessionRepository.updateStatus(sessionId, SessionStatus.FAILED, new Date());
  }
}

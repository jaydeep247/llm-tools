import { SessionRepository } from './session.repository';
import { SessionResponse, SessionWithProject, SessionStatus } from './session.types';
import { ProjectService } from '../project/project.service';
import { LimitsService } from '../limits/limits.service';
import { JobRepository } from '../job/job.repository';
import { JobStatus } from '../job/job.types';
import { LiveJobService } from '../../services/live-job.service';
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
  async getProjectSessions(projectId: string, userId: string): Promise<SessionResponse[]> {
    // Verify project ownership
    await this.projectService.verifyOwnership(projectId, userId);

    return this.sessionRepository.findByProjectId(projectId);
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

    // 1. Find all jobs under this session
    const jobs = await this.jobRepository.findBySessionId(sessionId);

    // 2. Cancel any running/pending jobs — set cancel flag, mark as FAILED, notify via socket
    for (const job of jobs) {
      if (job.status === JobStatus.PENDING || job.status === JobStatus.RUNNING) {
        // Set cancel flag in Redis so Python workers detect and abort
        await LiveJobService.setCancelFlag(job.id);

        try {
          await this.jobRepository.updateStatus(
            job.id,
            JobStatus.FAILED,
            undefined,
            new Date(),
            'Session deleted by user'
          );
        } catch (e) {
          logger.warn(`Failed to mark job ${job.id} as failed during session delete:`, e);
        }

        // Emit cancellation via socket so the progress page redirects immediately
        try {
          const io = getIo();
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
        } catch (e) {
          logger.warn(`Socket emit error during session delete for job ${job.id}:`, e);
        }
      }
    }

    // 3. Clean up Redis session hash
    await LiveJobService.cleanupSession(sessionId);

    // 4. Cascade delete all jobs + related Mongo collections + Redis job keys
    //    (handled by repository.delete → jobRepository.deleteBySessionId)
    return this.sessionRepository.delete(sessionId);
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

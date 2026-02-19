import { SessionRepository } from './session.repository';
import { SessionResponse, SessionWithProject, SessionStatus } from './session.types';
import { ProjectService } from '../project/project.service';
import { LimitsService } from '../limits/limits.service';

export class SessionService {
  private sessionRepository: SessionRepository;
  private projectService: ProjectService;
  private limitsService: LimitsService;

  constructor() {
    this.sessionRepository = new SessionRepository();
    this.projectService = new ProjectService();
    this.limitsService = new LimitsService();
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
   * Delete session
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

    return this.sessionRepository.delete(sessionId);
  }
}

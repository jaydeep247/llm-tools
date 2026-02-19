import { ProjectRepository } from './project.repository';
import { SessionRepository } from '../session/session.repository';
import { JobRepository } from '../job/job.repository';
import { CreateProjectDto, UpdateProjectDto, ProjectResponse, ProjectWithSessionCount, ProjectStatus } from './project.types';
import { LimitsService } from '../limits/limits.service';

export class ProjectService {
  private projectRepository: ProjectRepository;
  private sessionRepository: SessionRepository;
  private jobRepository: JobRepository;
  private limitsService: LimitsService;

  constructor() {
    this.projectRepository = new ProjectRepository();
    this.sessionRepository = new SessionRepository();
    this.jobRepository = new JobRepository();
    this.limitsService = new LimitsService();
  }

  /**
   * Create a new project with limit enforcement
   */
  async createProject(userId: string, data: CreateProjectDto): Promise<ProjectResponse> {
    // Get account limits
    const limits = await this.limitsService.getAccountLimits(userId);

    const currentProjectCount = await this.projectRepository.countByUserId(userId, ProjectStatus.ACTIVE);

    // Check if user can create a new project
    if (!this.limitsService.canCreateProject(currentProjectCount, limits)) {
      throw new Error(
        this.limitsService.getLimitViolationMessage('maxProjects', limits.maxProjects)
      );
    }

    // Create project
    return this.projectRepository.create(userId, data);
  }

  /**
   * Get all projects for a user
   */
  async getUserProjects(userId: string): Promise<ProjectWithSessionCount[]> {
    return this.projectRepository.findByUserId(userId, { status: ProjectStatus.ACTIVE });
  }

  /**
   * Get project by ID
   */
  async getProjectById(projectId: string, userId: string): Promise<ProjectWithSessionCount> {
    // Verify ownership
    const belongsToUser = await this.projectRepository.belongsToUser(projectId, userId);
    if (!belongsToUser) {
      throw new Error('Project not found or access denied');
    }

    const project = await this.projectRepository.findByIdWithSessionCount(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    return project;
  }

  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    data: UpdateProjectDto
  ): Promise<ProjectResponse> {
    // Verify ownership
    const belongsToUser = await this.projectRepository.belongsToUser(projectId, userId);
    if (!belongsToUser) {
      throw new Error('Project not found or access denied');
    }

    return this.projectRepository.update(projectId, data);
  }

  /**
   * Delete project and all related data
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    // Verify ownership
    const belongsToUser = await this.projectRepository.belongsToUser(projectId, userId);
    if (!belongsToUser) {
      throw new Error('Project not found or access denied');
    }

    // Find all sessions for the project
    const sessions = await this.sessionRepository.findByProjectId(projectId);

    // Delete jobs and related data for each session
    // We can do this in parallel for better performance
    await Promise.all(
      sessions.map(session => this.jobRepository.deleteBySessionId(session.id))
    );

    // Delete all sessions for the project
    await this.sessionRepository.deleteByProjectId(projectId);

    // Delete the project itself (hard delete)
    await this.projectRepository.delete(projectId);
  }

  /**
   * Verify project ownership
   */
  async verifyOwnership(projectId: string, userId: string): Promise<void> {
    const belongsToUser = await this.projectRepository.belongsToUser(projectId, userId);
    if (!belongsToUser) {
      throw new Error('Project not found or access denied');
    }
  }
}

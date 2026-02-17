import { ProjectRepository } from './project.repository';
import { CreateProjectDto, UpdateProjectDto, ProjectResponse, ProjectWithSessionCount, ProjectStatus } from './project.types';
import { LimitsService } from '../limits/limits.service';

export class ProjectService {
  private projectRepository: ProjectRepository;
  private limitsService: LimitsService;

  constructor() {
    this.projectRepository = new ProjectRepository();
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
  async getUserProjects(userId: string): Promise<ProjectResponse[]> {
    return this.projectRepository.findByUserId(userId);
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
   * Archive project (soft delete)
   */
  async archiveProject(projectId: string, userId: string): Promise<ProjectResponse> {
    // Verify ownership
    const belongsToUser = await this.projectRepository.belongsToUser(projectId, userId);
    if (!belongsToUser) {
      throw new Error('Project not found or access denied');
    }

    return this.projectRepository.archive(projectId);
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

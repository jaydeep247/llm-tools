import { Request, Response } from 'express';
import { ProjectService } from './project.service';
import { ResponseUtil } from '../../utils/response';
import { createProjectSchema, updateProjectSchema, projectIdSchema } from './project.validator';
import { logger } from '../../shared/logger/logger';

export class ProjectController {
  private projectService: ProjectService;

  constructor() {
    this.projectService = new ProjectService();
  }

  /**
   * Create a new project
   */
  createProject = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const data = createProjectSchema.parse(req.body);
      
      const project = await this.projectService.createProject(userId, data);
      return ResponseUtil.created(res, 'Project created successfully', project);
    } catch (error: any) {
      logger.error(`Error creating project: ${error.message}`);
      if (error.message.includes('Limit exceeded')) {
        return ResponseUtil.error(res, error.message, undefined, 403);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to create project');
    }
  };

  /**
   * Get all projects for the authenticated user
   */
  getUserProjects = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const projects = await this.projectService.getUserProjects(userId);
      return ResponseUtil.success(res, 'Projects retrieved successfully', projects);
    } catch (error) {
      logger.error('Error getting projects:', error);
      return ResponseUtil.serverError(res, 'Failed to retrieve projects');
    }
  };

  /**
   * Get project by ID
   */
  getProjectById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = projectIdSchema.parse(req.params);
      
      const project = await this.projectService.getProjectById(id, userId);
      return ResponseUtil.success(res, 'Project retrieved successfully', project);
    } catch (error: any) {
      logger.error(`Error getting projects: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve project');
    }
  };

  /**
   * Update project
   */
  updateProject = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = projectIdSchema.parse(req.params);
      const data = updateProjectSchema.parse(req.body);
      
      const project = await this.projectService.updateProject(id, userId, data);
      return ResponseUtil.success(res, 'Project updated successfully', project);
    } catch (error: any) {
      logger.error(`Error updating project: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to update project');
    }
  };

  /**
   * Archive project (soft delete)
   */
  archiveProject = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = projectIdSchema.parse(req.params);
      
      const project = await this.projectService.archiveProject(id, userId);
      return ResponseUtil.success(res, 'Project archived successfully', project);
    } catch (error: any) {
      logger.error(`Error archiving project: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to archive project');
    }
  };
}

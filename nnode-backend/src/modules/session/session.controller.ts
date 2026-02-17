import { Request, Response } from 'express';
import { SessionService } from './session.service';
import { ResponseUtil } from '../../utils/response';
import { sessionIdSchema, projectIdParamSchema, updateSessionStatusSchema, startCrawlSchema } from './session.validator';
import { logger } from '../../shared/logger/logger';
import { JobService } from '../job/job.service';

export class SessionController {
  private sessionService: SessionService;
  private jobService: JobService;

  constructor() {
    this.sessionService = new SessionService();
    this.jobService = new JobService();
  }

  /**
   * Start a new crawl session (creates session + crawl job)
   */
  startCrawl = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { projectId } = projectIdParamSchema.parse(req.params);
      const { url, allowSubdomains, runAudits, auditDevice, captureLinkDetails, modules } = startCrawlSchema.parse(req.body);
      
      // Create session
      const session = await this.sessionService.createSession(projectId, userId);

      // Create crawl job
      const resolvedModules = modules && modules.length > 0 ? modules : [];

      await this.jobService.createJob(session.id, userId, {
        jobType: 'CRAWL',
        config: {
          url,
          allowSubdomains,
          runAudits,
          auditDevice,
          captureLinkDetails,
          modules: resolvedModules,
        }
      });

      return ResponseUtil.created(res, 'Crawl session started successfully', session);
    } catch (error: any) {
      logger.error('Error starting crawl:', error);
      if (error.message.includes('Limit exceeded')) {
        return ResponseUtil.error(res, error.message, undefined, 403);
      }
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start crawl session');
    }
  };

  /**
   * Create a new session in a project
   */
  createSession = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { projectId } = projectIdParamSchema.parse(req.params);
      
      const session = await this.sessionService.createSession(projectId, userId);
      return ResponseUtil.created(res, 'Session created successfully', session);
    } catch (error: any) {
      logger.error('Error creating session:', error);
      if (error.message.includes('Limit exceeded')) {
        return ResponseUtil.error(res, error.message, undefined, 403);
      }
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to create session');
    }
  };

  /**
   * Get all sessions for a project
   */
  getProjectSessions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { projectId } = projectIdParamSchema.parse(req.params);
      
      const sessions = await this.sessionService.getProjectSessions(projectId, userId);
      return ResponseUtil.success(res, 'Sessions retrieved successfully', sessions);
    } catch (error: any) {
      logger.error('Error getting sessions:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve sessions');
    }
  };

  /**
   * Get session by ID
   */
  getSessionById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse(req.params);
      
      const session = await this.sessionService.getSessionById(id, userId);
      return ResponseUtil.success(res, 'Session retrieved successfully', session);
    } catch (error: any) {
      logger.error('Error getting session:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve session');
    }
  };

  /**
   * Update session status
   */
  updateSessionStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse(req.params);
      const { status } = updateSessionStatusSchema.parse(req.body);
      
      const session = await this.sessionService.updateSessionStatus(id, userId, status);
      return ResponseUtil.success(res, 'Session status updated successfully', session);
    } catch (error: any) {
      logger.error('Error updating session:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to update session');
    }
  };

  /**
   * Delete session
   */
  deleteSession = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = sessionIdSchema.parse(req.params);
      
      const session = await this.sessionService.deleteSession(id, userId);
      return ResponseUtil.success(res, 'Session deleted successfully', session);
    } catch (error: any) {
      logger.error('Error deleting session:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to delete session');
    }
  };
}

import { Request, Response } from 'express';
import { JobService } from './job.service';
import { ResponseUtil } from '../../utils/response';
import { createJobSchema, updateJobStatusSchema, jobIdSchema, sessionIdParamSchema } from './job.validator';
import { logger } from '../../shared/logger/logger';

export class JobController {
  private jobService: JobService;

  constructor() {
    this.jobService = new JobService();
  }

  /**
   * Create a new job in a session
   * CONTROL PLANE ONLY - no execution happens here
   */
  createJob = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = sessionIdParamSchema.parse(req.params);
      const data = createJobSchema.parse(req.body);
      
      const job = await this.jobService.createJob(sessionId, userId, data);
      return ResponseUtil.created(res, 'Job created successfully', job);
    } catch (error: any) {
      logger.error('Error creating job:', error);
      if (error.message.includes('Limit exceeded')) {
        return ResponseUtil.error(res, error.message, undefined, 403);
      }
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.message.includes('must be')) {
        return ResponseUtil.error(res, error.message, undefined, 400);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to create job');
    }
  };

  /**
   * Get all jobs for a session
   */
  getSessionJobs = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = sessionIdParamSchema.parse(req.params);
      
      const jobs = await this.jobService.getSessionJobs(sessionId, userId);
      return ResponseUtil.success(res, 'Jobs retrieved successfully', jobs);
    } catch (error: any) {
      logger.error('Error getting jobs:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve jobs');
    }
  };

  /**
   * Get job by ID
   */
  getJobById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = jobIdSchema.parse(req.params);
      
      const job = await this.jobService.getJobById(id, userId);
      return ResponseUtil.success(res, 'Job retrieved successfully', job);
    } catch (error: any) {
      logger.error('Error getting job:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job');
    }
  };

  /**
   * Update job status
   * Called by external workers (Python) to update job state
   */
  updateJobStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = jobIdSchema.parse(req.params);
      const { status, failureReason } = updateJobStatusSchema.parse(req.body);
      
      const job = await this.jobService.updateJobStatus(id, userId, status, failureReason);
      return ResponseUtil.success(res, 'Job status updated successfully', job);
    } catch (error: any) {
      logger.error('Error updating job:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.message.includes('Invalid state transition')) {
        return ResponseUtil.error(res, error.message, undefined, 400);
      }
      if (error.message.includes('Limit exceeded')) {
        return ResponseUtil.error(res, error.message, undefined, 403);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to update job');
    }
  };

  /**
   * Delete job
   */
  deleteJob = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { id } = jobIdSchema.parse(req.params);
      
      const job = await this.jobService.deleteJob(id, userId);
      return ResponseUtil.success(res, 'Job deleted successfully', job);
    } catch (error: any) {
      logger.error('Error deleting job:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.message.includes('Cannot delete')) {
        return ResponseUtil.error(res, error.message, undefined, 400);
      }
      return ResponseUtil.serverError(res, 'Failed to delete job');
    }
  };

  /**
   * Get pending jobs (for external workers)
   * This is how Python workers discover work to execute
   */
  getPendingJobs = async (req: Request, res: Response): Promise<Response> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      const jobs = await this.jobService.getPendingJobs(limit);
      return ResponseUtil.success(res, 'Pending jobs retrieved successfully', jobs);
    } catch (error: any) {
      logger.error('Error getting pending jobs:', error);
      return ResponseUtil.serverError(res, 'Failed to retrieve pending jobs');
    }
  };

  /**
   * Get job statistics for a session
   */
  getSessionJobStats = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = sessionIdParamSchema.parse(req.params);
      
      const stats = await this.jobService.getSessionJobStats(sessionId, userId);
      return ResponseUtil.success(res, 'Job statistics retrieved successfully', stats);
    } catch (error: any) {
      logger.error('Error getting job stats:', error);
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve job statistics');
    }
  };
}

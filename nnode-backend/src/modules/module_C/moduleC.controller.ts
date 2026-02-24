import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { ModuleCService } from './moduleC.service';
import { JobService } from '../job/job.service';
import { JobType } from '../job/job.types';
import { jobIdParamSchema, sessionParamSchema, runModuleCSchema } from './moduleC.validator';
import { logger } from '../../shared/logger/logger';

export class ModuleCController {
  private moduleCService: ModuleCService;
  private jobService: JobService;

  constructor() {
    this.moduleCService = new ModuleCService();
    this.jobService = new JobService();
  }

  /**
   * Get Module C (AEO) analysis result for a job
   */
  getModuleCResult = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      logger.info('Module C result request received', { jobId, userId });

      // Verify job access
      await this.jobService.getJobById(userId, jobId);

      const result = await this.moduleCService.getModuleCResult(jobId, userId);
      if (!result) {
        return ResponseUtil.success(res, 'Module C result not found', null);
      }

      logger.info('Module C response payload', {
        jobId,
        overallScore: result.overall_score ?? null,
      });

      return ResponseUtil.success(res, 'Module C result retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Module C result:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve Module C result');
    }
  };

  /**
   * Get all Module C results for a job (multiple URLs)
   */
  getAllModuleCResults = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      // Verify job access
      await this.jobService.getJobById(userId, jobId);

      const results = await this.moduleCService.getAllModuleCResults(jobId);
      
      return ResponseUtil.success(res, 'Module C results retrieved', { data: results });
    } catch (error: any) {
      logger.error('Error fetching all Module C results:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve Module C results');
    }
  };

  /**
   * Run Module C (AEO) analysis for a job
   * Creates a new job that runs module_c analysis
   */
  runModuleCAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const body = runModuleCSchema.parse(req.body || {});

      const job = await this.jobService.getJobById(userId, jobId);
      const url = body.url || job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      // Create a new job for Module C analysis
      const analysisJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.AEO_ANALYSIS,
        config: {
          modules: ['module_c'],
          sourceJobId: jobId,
          query: body.query,
        },
      });

      logger.info('Module C analysis job created', {
        jobId,
        analysisJobId: analysisJob.id,
        sessionId: job.sessionId,
      });

      return ResponseUtil.created(res, 'Module C analysis queued', {
        analysisJobId: analysisJob.id,
        status: analysisJob.status,
      });
    } catch (error: any) {
      logger.error('Error starting Module C analysis:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start Module C analysis');
    }
  };

  /**
   * Get Module C results for a session (across all jobs)
   */
  getSessionModuleCResults = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = sessionParamSchema.parse(req.params);

      logger.info('Session Module C results request received', { sessionId, userId });

      const results = await this.moduleCService.getSessionModuleCResults(sessionId);
      
      return ResponseUtil.success(res, 'Session Module C results retrieved', { data: results });
    } catch (error: any) {
      logger.error('Error fetching session Module C results:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve session Module C results');
    }
  };
}

import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { ModuleFService } from './moduleF.service';
import { JobService } from '../job/job.service';
import { JobType } from '../job/job.types';
import { jobIdParamSchema, moduleFAskAIBodySchema } from './moduleF.validator';
import { logger } from '../../shared/logger/logger';

export class ModuleFController {
  private moduleFService: ModuleFService;
  private jobService: JobService;

  constructor() {
    this.moduleFService = new ModuleFService();
    this.jobService = new JobService();
  }

  getModuleFResult = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const result = await this.moduleFService.getModuleFResult(jobId, userId);
      if (!result) {
        return ResponseUtil.success(res, 'Module F result not found', null);
      }

      return ResponseUtil.success(res, 'Module F result retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Module F result:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve Module F result');
    }
  };

  getModuleFTrends = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const result = await this.moduleFService.getModuleFTrends(jobId, userId);
      if (!result) {
        return ResponseUtil.success(res, 'Module F trends not found', null);
      }

      return ResponseUtil.success(res, 'Module F trends retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Module F trends:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve Module F trends');
    }
  };

  runCompetitorAiIntelligence = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const job = await this.jobService.getJobById(userId, jobId);
      const url = job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      // If this job is a URL-cache hit, its real module_e data is stored under
      // cacheSourceJobId, not the ghost job ID. Pass the real ID to npy-backend
      // so it can locate module_e competitor data correctly.
      const effectiveSourceJobId = job.cacheSourceJobId || jobId;

      const analysisJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.MODULE_F_COMPETITOR_AI_INTELLIGENCE,
        config: {
          sourceJobId: effectiveSourceJobId,
        },
      });

      return ResponseUtil.created(res, 'Module F competitor AI intelligence queued', analysisJob);
    } catch (error: any) {
      logger.error('Error starting Module F competitor AI intelligence:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start Module F competitor AI intelligence');
    }
  };

  askModuleFAI = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const body = moduleFAskAIBodySchema.parse(req.body);

      const result = await this.moduleFService.askModuleFAI(jobId, userId, {
        question: body.question,
        conversationHistory: body.conversationHistory,
      });

      return ResponseUtil.success(res, 'Module F Ask AI completed', result);
    } catch (error: any) {
      logger.error('Error in Module F Ask AI:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(
        res,
        'Failed to run Ask AI',
        error.message || undefined,
      );
    }
  };
}


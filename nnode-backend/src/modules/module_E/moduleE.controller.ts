import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { ModuleEService } from './moduleE.service';
import { JobService } from '../job/job.service';
import { JobType } from '@prisma/client';
import { jobIdParamSchema } from './moduleE.validator';
import { logger } from '../../shared/logger/logger';

export class ModuleEController {
  private moduleEService: ModuleEService;
  private jobService: JobService;

  constructor() {
    this.moduleEService = new ModuleEService();
    this.jobService = new JobService();
  }

  getModuleEResult = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      logger.info('Module E request received', { jobId, userId });

      const result = await this.moduleEService.getModuleEResult(jobId, userId);
      if (!result) {
        return ResponseUtil.success(res, 'Module E result not found', null);
      }

      logger.info('Module E response payload', {
        jobId,
        consistencyScore: result.content_consistency?.score ?? null,
        entityScore: result.entity_coverage?.score ?? null,
      });

      return ResponseUtil.success(res, 'Module E result retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Module E result:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve Module E result');
    }
  };

  runModuleEAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const job = await this.jobService.getJobById(jobId, userId);
      const url = job.config?.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL in config', undefined, 400);
      }

      const analysisJob = await this.jobService.createJob(job.sessionId, userId, {
        jobType: JobType.AEO_ANALYSIS,
        config: {
          url,
          modules: ['module_e'],
          sourceJobId: jobId,
        },
      });

      logger.info('Module E analysis job created', {
        jobId,
        analysisJobId: analysisJob.id,
        sessionId: job.sessionId,
      });

      return ResponseUtil.created(res, 'Module E analysis queued', analysisJob);
    } catch (error: any) {
      logger.error('Error starting Module E analysis:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start Module E analysis');
    }
  };
}

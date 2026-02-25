import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { ModuleEService } from './moduleE.service';
import { JobService } from '../job/job.service';
import { JobType } from '../job/job.types';
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

      const result = await this.moduleEService.getModuleEResult(jobId, userId);
      if (!result) {
        return ResponseUtil.success(res, 'Module E result not found', null);
      }

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

      const job = await this.jobService.getJobById(userId, jobId);
      const url = job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      const analysisJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.MODULE_E_FULL,
        config: {
          sourceJobId: jobId,
        },
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

  runSentimentAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const job = await this.jobService.getJobById(userId, jobId);
      const url = job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      const sentimentJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.MODULE_E_SENTIMENT,
        config: {
          sourceJobId: jobId,
        },
      });

      logger.info('Sentiment analysis job created', {
        jobId,
        sentimentJobId: sentimentJob.id,
        sessionId: job.sessionId,
      });

      return ResponseUtil.created(res, 'Sentiment analysis queued', sentimentJob);
    } catch (error: any) {
      logger.error('Error starting sentiment analysis:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start sentiment analysis');
    }
  };

  runCompetitorAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const job = await this.jobService.getJobById(userId, jobId);
      const url = job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      const competitorJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.MODULE_E_COMPETITORS,
        config: {
          sourceJobId: jobId,
        },
      });

      logger.info('Competitor analysis job created', {
        jobId,
        competitorJobId: competitorJob.id,
        sessionId: job.sessionId,
      });

      return ResponseUtil.created(res, 'Competitor analysis queued', competitorJob);
    } catch (error: any) {
      logger.error('Error starting competitor analysis:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start competitor analysis');
    }
  };

  runAiSovAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const job = await this.jobService.getJobById(userId, jobId);
      const url = job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      const aiSovJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.MODULE_E_AI_SOV,
        config: {
          sourceJobId: jobId,
        },
      });

      logger.info('AI SOV analysis job created', {
        jobId,
        aiSovJobId: aiSovJob.id,
        sessionId: job.sessionId,
      });

      return ResponseUtil.created(res, 'AI SOV analysis queued', aiSovJob);
    } catch (error: any) {
      logger.error('Error starting AI SOV analysis:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start AI SOV analysis');
    }
  };

  runBrandAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const job = await this.jobService.getJobById(userId, jobId);
      const url = job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      const brandJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.MODULE_E_BRAND,
        config: {
          sourceJobId: jobId,
        },
      });

      logger.info('Brand analysis job created', {
        jobId,
        brandJobId: brandJob.id,
        sessionId: job.sessionId,
      });

      return ResponseUtil.created(res, 'Brand analysis queued', brandJob);
    } catch (error: any) {
      logger.error('Error starting brand analysis:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start brand analysis');
    }
  };

  runRankingAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const job = await this.jobService.getJobById(userId, jobId);
      const url = job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      const rankingJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.MODULE_E_RANKING,
        config: {
          sourceJobId: jobId,
        },
      });

      logger.info('Ranking analysis job created', {
        jobId,
        rankingJobId: rankingJob.id,
        sessionId: job.sessionId,
      });

      return ResponseUtil.created(res, 'Ranking analysis queued', rankingJob);
    } catch (error: any) {
      logger.error('Error starting ranking analysis:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start ranking analysis');
    }
  };

  runConsistencyAnalysis = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const job = await this.jobService.getJobById(userId, jobId);
      const url = job.url;

      if (!url) {
        return ResponseUtil.error(res, 'Job is missing URL', undefined, 400);
      }

      const consistencyJob = await this.jobService.createJob(userId, job.sessionId, {
        url,
        jobType: JobType.MODULE_E_CONSISTENCY,
        config: {
          sourceJobId: jobId,
        },
      });

      logger.info('Consistency analysis job created', {
        jobId,
        consistencyJobId: consistencyJob.id,
        sessionId: job.sessionId,
      });

      return ResponseUtil.created(res, 'Consistency analysis queued', consistencyJob);
    } catch (error: any) {
      logger.error('Error starting consistency analysis:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to start consistency analysis');
    }
  };
}

import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { ModuleAService } from './moduleA.service';
import { JobService } from '../job/job.service';
import { JobConflictError, JobType } from '../job/job.types';
import {
  jobIdParamSchema,
  sessionParamSchema,
  runSerpAnalyzerSchema,
  moduleAAskAIBodySchema,
} from './moduleA.validator';
import { logger } from '../../shared/logger/logger';

export class ModuleAController {
  private moduleAService: ModuleAService;
  private jobService: JobService;

  constructor() {
    this.moduleAService = new ModuleAService();
    this.jobService = new JobService();
  }

  // ── GET /module-a/jobs/:jobId ──────────────────────────────────────────

  getSerpResult = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      await this.jobService.getJobById(userId, jobId);

      const result = await this.moduleAService.getSerpResult(jobId);
      return ResponseUtil.success(res, 'SERP result retrieved', result);
    } catch (error: any) {
      logger.error('[MODULE_A] getSerpResult error:', error);
      if (error.name === 'ZodError')
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      if (error.message?.includes('not found') || error.message?.includes('access denied'))
        return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to retrieve SERP result');
    }
  };

  // ── GET /module-a/sessions/:sessionId ─────────────────────────────────

  getSessionSerpResults = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { sessionId } = sessionParamSchema.parse(req.params);
      // Verify session access via existing service guard
      await this.jobService['sessionService'].getSessionById(sessionId, userId);

      const results = await this.moduleAService.getSessionSerpResults(sessionId);
      return ResponseUtil.success(res, 'Session SERP results retrieved', results);
    } catch (error: any) {
      logger.error('[MODULE_A] getSessionSerpResults error:', error);
      return ResponseUtil.serverError(res, 'Failed to retrieve session SERP results');
    }
  };

  // ── GET /module-a/jobs/:jobId/keyword-history?keyword=xxx ─────────────

  getKeywordHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const job = await this.jobService.getJobById(userId, jobId);
      const keyword = req.query.keyword as string;
      if (!keyword) return ResponseUtil.error(res, 'keyword query param required', undefined, 400);

      const history = await this.moduleAService.getKeywordHistory(job.sessionId, keyword);
      return ResponseUtil.success(res, 'Keyword history retrieved', history);
    } catch (error: any) {
      logger.error('[MODULE_A] getKeywordHistory error:', error);
      return ResponseUtil.serverError(res, 'Failed to retrieve keyword history');
    }
  };

  // ── POST /module-a/jobs/:jobId/run ────────────────────────────────────

  runSerpAnalyzer = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const body = runSerpAnalyzerSchema.parse(req.body);

      // Verify the parent CRAWL/session job belongs to this user
      const parentJob = await this.jobService.getJobById(userId, jobId);

      const newJob = await this.jobService.createJob(userId, parentJob.sessionId, {
        jobType: JobType.MODULE_A_SERP,
        url: parentJob.url,
        config: {
          sourceJobId: jobId,
          keywords: body.keywords,
          competitors: body.competitors,
          locationCode: body.locationCode,
          languageCode: body.languageCode,
          device: body.device,
        },
      });

      return ResponseUtil.success(res, 'SERP Analyzer job started', {
        jobId: newJob.id,
        status: newJob.status,
      });
    } catch (error: any) {
      logger.error('[MODULE_A] runSerpAnalyzer error:', error);
      if (error instanceof JobConflictError)
        return ResponseUtil.error(res, 'Conflict: job already active', error.message, 409);
      if (error.name === 'ZodError')
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      return ResponseUtil.serverError(res, 'Failed to start SERP Analyzer');
    }
  };

  askModuleAAI = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const body = moduleAAskAIBodySchema.parse(req.body);

      const result = await this.moduleAService.askModuleAAI(jobId, userId, {
        question: body.question,
        conversationHistory: body.conversationHistory,
      });

      return ResponseUtil.success(res, 'Module A Ask AI completed', result);
    } catch (error: any) {
      logger.error('[MODULE_A] askModuleAAI error:', error);
      if (error.name === 'ZodError')
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      if (error.message?.includes('not found') || error.message?.includes('access denied'))
        return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to run Ask AI', error.message || undefined);
    }
  };

  getModuleASuggestedQuestions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const result = await this.moduleAService.getModuleASuggestedQuestions(jobId, userId);
      return ResponseUtil.success(res, 'Module A suggested questions retrieved', result);
    } catch (error: any) {
      logger.error('[MODULE_A] getModuleASuggestedQuestions error:', error);
      if (error.name === 'ZodError')
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      if (error.message?.includes('not found') || error.message?.includes('access denied'))
        return ResponseUtil.notFound(res, error.message);
      return ResponseUtil.serverError(res, 'Failed to retrieve suggested questions');
    }
  };
}

import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { ModuleCService } from './moduleC.service';
import { JobService } from '../job/job.service';
import { JobConflictError, JobType } from '../job/job.types';
import { jobIdParamSchema, sessionParamSchema, runModuleCSchema, moduleCUrlQuerySchema } from './moduleC.validator';
import { logger } from '../../shared/logger/logger';

export class ModuleCController {
  private moduleCService: ModuleCService;
  private jobService: JobService;

  constructor() {
    this.moduleCService = new ModuleCService();
    this.jobService = new JobService();
  }

  /**
   * Shared error handler for createJob-based Module C endpoints.
   */
  private handleCreateError(res: Response, error: any, fallbackMessage: string): Response {
    if (error instanceof JobConflictError) {
      return ResponseUtil.error(res, 'Conflict: job already active', error.message, 409);
    }
    if (error.message?.includes('not found') || error.message?.includes('access denied')) {
      return ResponseUtil.notFound(res, error.message);
    }
    if (error.name === 'ZodError') {
      return ResponseUtil.error(res, 'Validation failed', error.errors);
    }
    return ResponseUtil.serverError(res, fallbackMessage);
  }

  /**
   * Get Module C (AEO) analysis result for a job
   */
  getModuleCResult = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const { url } = moduleCUrlQuerySchema.parse(req.query || {});

      // Verify job access
      await this.jobService.getJobById(userId, jobId);

      const result = await this.moduleCService.getModuleCResult(jobId, userId, url);
      if (!result) {
        return ResponseUtil.success(res, 'Module C result not found', null);
      }

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
      return this.handleCreateError(res, error, 'Failed to start Module C analysis');
    }
  };

  /**
   * Get Module C results for a session (across all jobs)
   */
  getSessionModuleCResults = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { sessionId } = sessionParamSchema.parse(req.params);

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

  // ===== Individual C-Submodule Field Endpoints =====

  /**
   * Generic helper — get a single submodule field from an AEO result.
   */
  private getField = (field: string, label: string) => {
    return async (req: Request, res: Response): Promise<Response> => {
      try {
        const userId = req.user!.userId;
        const { jobId } = jobIdParamSchema.parse(req.params);
        const { url } = moduleCUrlQuerySchema.parse(req.query || {});

        await this.jobService.getJobById(userId, jobId);
        const result = await this.moduleCService.getModuleField(jobId, field, url);

        return ResponseUtil.success(res, `${label} data retrieved`, result);
      } catch (error: any) {
        logger.error(`Error fetching ${label}:`, error);
        return this.handleModuleError(res, error, label);
      }
    };
  };

  // New C-submodule endpoints
  getC5EntityExtraction = this.getField('entity_extraction', 'Entity Extraction');
  getC1AeoChecker = this.getField('aeo_checker', 'AEO Checker');
  getC3EntityCoverage = this.getField('entity_coverage', 'Entity Coverage');
  getC6MissingInfo = this.getField('missing_info', 'Missing Information');
  getC4AnswerCompleteness = this.getField('answer_completeness', 'Answer Completeness');
  getC2BulkAudit = this.getField('bulk_audit', 'Bulk Audit');
  getC7LlmSimulator = this.getField('llm_simulator', 'LLM Simulator');
  getC9MultiModel = this.getField('multi_model', 'Multi-Model Insights');
  getC8PageActions = this.getField('page_actions', 'Page Actions');

  /**
   * Get Summary (overall score + all module scores)
   */
  getSummary = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const { url } = moduleCUrlQuerySchema.parse(req.query || {});

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getSummary(jobId, url);
      
      return ResponseUtil.success(res, 'Module C summary retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching summary:', error);
      return this.handleModuleError(res, error, 'Summary');
    }
  };

  /**
   * Get AI Visibility Report for a job
   */
  getVisibilityReport = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const { url } = moduleCUrlQuerySchema.parse(req.query || {});

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getVisibilityReport(jobId, url);

      return ResponseUtil.success(res, 'AI Visibility Report retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching AI Visibility Report:', error);
      return this.handleModuleError(res, error, 'AI Visibility Report');
    }
  };

  /**
   * Helper to handle module errors consistently
   */
  private handleModuleError(res: Response, error: any, moduleName: string): Response {
    if (error.message?.includes('not found') || error.message?.includes('access denied')) {
      return ResponseUtil.notFound(res, error.message);
    }
    if (error.name === 'ZodError') {
      return ResponseUtil.error(res, 'Validation failed', error.errors);
    }
    return ResponseUtil.serverError(res, `Failed to retrieve ${moduleName} data`);
  }
}

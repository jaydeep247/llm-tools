import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { ModuleCService } from './moduleC.service';
import { JobService } from '../job/job.service';
import { JobConflictError, JobType } from '../job/job.types';
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

      // Verify job access
      await this.jobService.getJobById(userId, jobId);

      const result = await this.moduleCService.getModuleCResult(jobId, userId);
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

  // ===== Individual Module Field Endpoints =====

  /**
   * Get AI Presence module data
   */
  getAiPresence = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getModuleField(jobId, 'ai_presence');
      
      return ResponseUtil.success(res, 'AI Presence data retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching AI Presence:', error);
      return this.handleModuleError(res, error, 'AI Presence');
    }
  };

  /**
   * Get Answerability module data
   */
  getAnswerability = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getModuleField(jobId, 'answerability');
      
      return ResponseUtil.success(res, 'Answerability data retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Answerability:', error);
      return this.handleModuleError(res, error, 'Answerability');
    }
  };

  /**
   * Get Knowledge Base module data
   */
  getKnowledgeBase = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getModuleField(jobId, 'knowledge_base');
      
      return ResponseUtil.success(res, 'Knowledge Base data retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Knowledge Base:', error);
      return this.handleModuleError(res, error, 'Knowledge Base');
    }
  };

  /**
   * Get LLM Simulator module data
   */
  getLlmSimulator = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getModuleField(jobId, 'llm_simulator');
      
      return ResponseUtil.success(res, 'LLM Simulator data retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching LLM Simulator:', error);
      return this.handleModuleError(res, error, 'LLM Simulator');
    }
  };

  /**
   * Get Multi-Model Insights module data
   */
  getMultiModelInsights = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getModuleField(jobId, 'multi_model_insights');
      
      return ResponseUtil.success(res, 'Multi-Model Insights data retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Multi-Model Insights:', error);
      return this.handleModuleError(res, error, 'Multi-Model Insights');
    }
  };

  /**
   * Get Actionable Insights module data
   */
  getActionableInsights = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getModuleField(jobId, 'actionable_insights');
      
      return ResponseUtil.success(res, 'Actionable Insights data retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Actionable Insights:', error);
      return this.handleModuleError(res, error, 'Actionable Insights');
    }
  };

  /**
   * Get Summary (overall score + all module scores)
   */
  getSummary = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getSummary(jobId);
      
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

      await this.jobService.getJobById(userId, jobId);
      const result = await this.moduleCService.getVisibilityReport(jobId);

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

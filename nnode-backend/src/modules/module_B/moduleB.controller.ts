import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';
import { ModuleBService } from './moduleB.service';
import { jobIdParamSchema, moduleBAskAIBodySchema } from './moduleB.validator';

export class ModuleBController {
  private moduleBService: ModuleBService;

  constructor() {
    this.moduleBService = new ModuleBService();
  }

  askModuleBAI = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);
      const body = moduleBAskAIBodySchema.parse(req.body);

      const result = await this.moduleBService.askModuleBAI(jobId, userId, {
        question: body.question,
        conversationHistory: body.conversationHistory,
      });

      return ResponseUtil.success(res, 'Module B Ask AI completed', result);
    } catch (error: any) {
      logger.error('[MODULE_B] askModuleBAI error:', error);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to run Ask AI', error.message || undefined);
    }
  };

  getModuleBSuggestedQuestions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const result = await this.moduleBService.getModuleBSuggestedQuestions(jobId, userId);
      return ResponseUtil.success(res, 'Module B suggested questions retrieved', result);
    } catch (error: any) {
      logger.error('[MODULE_B] getModuleBSuggestedQuestions error:', error);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve suggested questions');
    }
  };
}

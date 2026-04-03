import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';
import { ModuleDService } from './moduleD.service';
import { moduleDAskAIBodySchema, moduleDSuggestedQuestionsBodySchema } from './moduleD.validator';

export class ModuleDController {
  private moduleDService: ModuleDService;

  constructor() {
    this.moduleDService = new ModuleDService();
  }

  askModuleDAI = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const body = moduleDAskAIBodySchema.parse(req.body);
      const result = await this.moduleDService.askModuleDAI(userId, body);
      return ResponseUtil.success(res, 'Module D Ask AI completed', result);
    } catch (error: any) {
      logger.error('Error in Module D Ask AI:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to run Module D Ask AI', error.message || undefined);
    }
  };

  suggestedQuestions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const body = moduleDSuggestedQuestionsBodySchema.parse(req.body);
      const result = await this.moduleDService.getSuggestedQuestions(userId, body);
      return ResponseUtil.success(res, 'Module D suggested questions retrieved', result);
    } catch (error: any) {
      logger.error('Error in Module D suggested questions:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to fetch suggested questions', error.message || undefined);
    }
  };
}

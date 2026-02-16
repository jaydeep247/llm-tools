import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { ModuleEService } from './moduleE.service';
import { jobIdParamSchema } from './moduleE.validator';
import { logger } from '../../shared/logger/logger';

export class ModuleEController {
  private moduleEService: ModuleEService;

  constructor() {
    this.moduleEService = new ModuleEService();
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
}

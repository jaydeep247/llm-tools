import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { QuickStartService } from './quickStart.service';
import { jobIdParamSchema } from './quickStart.validator';
import { logger } from '../../shared/logger/logger';

export class QuickStartController {
  private quickStartService: QuickStartService;

  constructor() {
    this.quickStartService = new QuickStartService();
  }

  /**
   * GET /quick-start/jobs/:jobId
   * Returns the Quick Start analysis result for the given job.
   */
  getQuickStartResult = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { jobId } = jobIdParamSchema.parse(req.params);

      const result = await this.quickStartService.getQuickStartResult(jobId, userId);
      if (!result) {
        return ResponseUtil.success(res, 'Quick Start result not found', null);
      }

      return ResponseUtil.success(res, 'Quick Start result retrieved', result);
    } catch (error: any) {
      logger.error('Error fetching Quick Start result:', error);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve Quick Start result');
    }
  };
}

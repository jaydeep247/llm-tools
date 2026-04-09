import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { WinsLossesService } from './winsLosses.service';
import { logger } from '../../shared/logger/logger';

export class WinsLossesController {
  private service = new WinsLossesService();

  getWinsLosses = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const jobId = (Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId)?.trim() ?? '';

      if (!jobId) {
        return ResponseUtil.error(res, 'Job ID is required', undefined, 400);
      }

      const rawPeriod = req.query.period as string | undefined;
      const periodDays = rawPeriod === '30d' ? 30 : 7;

      const result = await this.service.getWinsLosses(jobId, userId, periodDays);
      return ResponseUtil.success(res, 'Wins & Losses retrieved', result);
    } catch (error: any) {
      logger.error(`[WINS_LOSSES] ${error.message}`);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve wins & losses');
    }
  };
}

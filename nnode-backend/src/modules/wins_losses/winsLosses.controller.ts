import { Request, Response } from 'express';
import { WinsLossesService } from './winsLosses.service';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';

export class WinsLossesController {
  private service = new WinsLossesService();

  getWinsLosses = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const jobId = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id)?.trim();

      if (!jobId) {
        return ResponseUtil.error(res, 'Job ID is required', undefined, 400);
      }

      const result = await this.service.getWinsLosses(userId, jobId);
      return ResponseUtil.success(res, 'Wins & losses retrieved', result);
    } catch (error: any) {
      logger.error(`[WINS_LOSSES] ${error.message}`);
      if (error.message?.includes('not found') || error.message?.includes('access denied')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to retrieve wins & losses');
    }
  };
}

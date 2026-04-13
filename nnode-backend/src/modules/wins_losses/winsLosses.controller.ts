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
      const fromRaw = String((req.query as any)?.from ?? '').trim();
      const toRaw = String((req.query as any)?.to ?? '').trim();
      const from = fromRaw ? new Date(fromRaw) : null;
      const to = toRaw ? new Date(toRaw) : null;
      const diffDays =
        from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())
          ? Math.max(1, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1)
          : null;
      const periodDays = diffDays ?? (rawPeriod === '30d' ? 30 : 7);

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

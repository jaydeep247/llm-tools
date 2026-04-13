import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';
import { CompetitorReportsService } from './competitorReports.service';
import type { CRPeriod } from './competitorReports.types';

export class CompetitorReportsController {
  private service = new CompetitorReportsService();

  getReport = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const projectId = String((req.query as any)?.project_id ?? '').trim();
      const periodRaw = String((req.query as any)?.period ?? '7d').trim();
      const period: CRPeriod = periodRaw === '30d' ? '30d' : '7d';

      if (!projectId) {
        return ResponseUtil.error(res, 'project_id is required', undefined, 400);
      }

      const data = await this.service.getReport(userId, projectId, period);
      return ResponseUtil.success(res, 'Competitor report retrieved', data);
    } catch (e: any) {
      logger.error(`[COMPETITOR_REPORTS] ${e?.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve competitor report');
    }
  };
}


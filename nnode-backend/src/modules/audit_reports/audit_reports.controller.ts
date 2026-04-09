import type { Request, Response } from 'express';
import { AuditReportsService } from './audit_reports.service';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';

export class AuditReportsController {
  private service: AuditReportsService;

  constructor() {
    this.service = new AuditReportsService();
  }

  getReport = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const jobId = req.params.id as string;
      if (!jobId) return ResponseUtil.error(res, 'Job ID is required');

      const result = await this.service.getReport(userId, jobId);
      return ResponseUtil.success(res, 'Audit report retrieved successfully', result);
    } catch (error: any) {
      logger.error(`[AUDIT_REPORT] getReport failed: ${error.message}`);
      if (error.message?.includes('not found')) {
        return ResponseUtil.notFound(res, error.message);
      }
      return ResponseUtil.serverError(res, 'Failed to generate audit report');
    }
  };

  listReports = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const jobId = req.params.id as string;
      if (!jobId) return ResponseUtil.error(res, 'Job ID is required');

      const reports = await this.service.listProjectReports(userId, jobId);
      return ResponseUtil.success(res, 'Report history retrieved', reports);
    } catch (error: any) {
      logger.error(`[AUDIT_REPORT] listReports failed: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve report history');
    }
  };
}

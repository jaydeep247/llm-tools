import type { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';
import { WeeklyReportsService } from './weekly_reports.service';
import { ExportPdfService } from '../export/export.pdf.service';

export class WeeklyReportsController {
  private svc = new WeeklyReportsService();
  private pdfSvc = new ExportPdfService();

  list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const projectId = String(req.query.project_id ?? req.query.domain_id ?? '');
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 12;
      if (!projectId) {
        return ResponseUtil.error(res, 'project_id is required');
      }
      const data = await this.svc.listForProject(userId, projectId, limit);
      return ResponseUtil.success(res, 'Weekly reports loaded', { reports: data });
    } catch (err: any) {
      logger.error(`[WEEKLY_REPORTS] list: ${err.message}`);
      return ResponseUtil.error(res, err.message || 'Failed to list reports', undefined, 404);
    }
  };

  getOne = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const rid = req.params.reportId;
      const reportId = Array.isArray(rid) ? rid[0] : rid;
      const report = await this.svc.getById(userId, reportId);
      if (!report) {
        return ResponseUtil.error(res, 'Report not found', undefined, 404);
      }
      return ResponseUtil.success(res, 'Weekly report loaded', { report });
    } catch (err: any) {
      logger.error(`[WEEKLY_REPORTS] getOne: ${err.message}`);
      return ResponseUtil.error(res, err.message || 'Failed to load report', undefined, 404);
    }
  };

  generate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const jobId = String(req.body?.jobId ?? req.body?.job_id ?? '');
      if (!jobId) {
        return ResponseUtil.error(res, 'jobId is required');
      }
      const report = await this.svc.generateAndSave(userId, jobId, 'dashboard');
      return ResponseUtil.created(res, 'Weekly report generated', { report });
    } catch (err: any) {
      logger.error(`[WEEKLY_REPORTS] generate: ${err.message}`);
      return ResponseUtil.error(res, err.message || 'Failed to generate report', undefined, 400);
    }
  };

  exportReport = async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const format = String(req.query.format ?? 'pdf').toLowerCase();
    try {
      const rid = req.params.reportId;
      const reportId = Array.isArray(rid) ? rid[0] : rid;
      const report = await this.svc.getById(userId, reportId);
      if (!report) {
        res.status(404).json({ success: false, message: 'Report not found' });
        return;
      }
      if (format === 'csv') {
        const csv = this.svc.reportToCsv(report.reportData);
        res.set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="weekly-summary-${report.weekStart}.csv"`,
          'Cache-Control': 'no-store',
        });
        res.status(200).send('\uFEFF' + csv);
        return;
      }
      if (format === 'pdf') {
        const domain = report.reportData.meta.domain_label || 'report';
        const buffer = await this.pdfSvc.generate('weekly-summary', report.jobId, userId, domain);
        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="weekly-summary-${report.weekStart}.pdf"`,
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-store',
        });
        res.status(200).send(buffer);
        return;
      }
      res.status(400).json({ success: false, message: 'Invalid format (use pdf or csv)' });
    } catch (err: any) {
      logger.error(`[WEEKLY_REPORTS] export: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Export failed' });
      }
    }
  };
}

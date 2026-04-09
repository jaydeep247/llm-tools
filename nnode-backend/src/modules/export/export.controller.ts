import type { Request, Response } from 'express';
import { ExportService } from './export.service';
import { ExportPdfService } from './export.pdf.service';
import { ExportCsvService } from './export.csv.service';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';
import type { PdfReportType, CsvDataType } from './export.types';

const VALID_PDF_TYPES: PdfReportType[] = ['weekly-summary', 'audit-report', 'competitor-report', 'ai-scorecard'];
const VALID_CSV_TYPES: CsvDataType[] = ['crawl-data', 'citations', 'prompts', 'competitors', 'alerts'];

export class ExportController {
  private svc = new ExportService();
  private pdfSvc = new ExportPdfService();
  private csvSvc = new ExportCsvService();

  // ── API key ──────────────────────────────────────────────────────────────

  getApiKey = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const apiKey = await this.svc.getApiKey(userId);
      return ResponseUtil.success(res, 'API key retrieved', { apiKey });
    } catch (err: any) {
      logger.error(`[EXPORT] getApiKey failed: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve API key');
    }
  };

  regenerateApiKey = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const apiKey = await this.svc.regenerateApiKey(userId);
      return ResponseUtil.success(res, 'API key regenerated', { apiKey });
    } catch (err: any) {
      logger.error(`[EXPORT] regenerateApiKey failed: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to regenerate API key');
    }
  };

  // ── Schedule ──────────────────────────────────────────────────────────────

  getSchedule = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const schedule = await this.svc.getSchedule(userId);
      return ResponseUtil.success(res, 'Schedule retrieved', { schedule });
    } catch (err: any) {
      logger.error(`[EXPORT] getSchedule failed: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve schedule');
    }
  };

  saveSchedule = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const { email, reportType, dayOfWeek, hour } = req.body;

      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return ResponseUtil.error(res, 'Valid email is required');
      }
      if (!reportType || typeof reportType !== 'string') {
        return ResponseUtil.error(res, 'Report type is required');
      }
      if (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6) {
        return ResponseUtil.error(res, 'Invalid day of week (0-6)');
      }
      if (typeof hour !== 'number' || hour < 0 || hour > 23) {
        return ResponseUtil.error(res, 'Invalid hour (0-23)');
      }

      const schedule = await this.svc.saveSchedule(userId, { email, frequency: 'weekly', reportType, dayOfWeek, hour });
      return ResponseUtil.success(res, 'Schedule saved', { schedule });
    } catch (err: any) {
      logger.error(`[EXPORT] saveSchedule failed: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to save schedule');
    }
  };

  // ── PDF export ────────────────────────────────────────────────────────────

  getPdf = async (req: Request, res: Response): Promise<void> => {
    const type = req.params.type as PdfReportType;
    const userId = req.user!.userId;

    if (!VALID_PDF_TYPES.includes(type)) {
      res.status(400).json({ success: false, message: `Invalid report type: ${type}` });
      return;
    }

    try {
      const jobId = await this.svc.resolveJobId(userId, req.query.job_id as string | undefined, req.query.project_id as string | undefined);
      if (!jobId) {
        res.status(404).json({ success: false, message: 'No completed job found. Run a crawl first.' });
        return;
      }

      // Resolve domain from project
      const domain = await this.resolveDomain(userId, jobId);

      logger.info(`[EXPORT] Generating PDF type=${type} jobId=${jobId} userId=${userId}`);
      const buffer = await this.pdfSvc.generate(type, jobId, userId, domain);

      const filename = `colytics-${type}-${new Date().toISOString().split('T')[0]}.pdf`;
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      });
      res.status(200).send(buffer);
    } catch (err: any) {
      logger.error(`[EXPORT] getPdf type=${type} failed: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to generate PDF report' });
      }
    }
  };

  // ── CSV export ────────────────────────────────────────────────────────────

  getCsv = async (req: Request, res: Response): Promise<void> => {
    const type = req.params.type as CsvDataType;
    const userId = req.user!.userId;

    if (!VALID_CSV_TYPES.includes(type)) {
      res.status(400).json({ success: false, message: `Invalid data type: ${type}` });
      return;
    }

    try {
      const jobId = await this.svc.resolveJobId(userId, req.query.job_id as string | undefined, req.query.project_id as string | undefined);
      if (!jobId) {
        res.status(404).json({ success: false, message: 'No completed job found.' });
        return;
      }

      const domain = await this.resolveDomain(userId, jobId);
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      const csv = await this.csvSvc.generate(type, jobId, domain, from, to);

      const filename = `colytics-${type}-${new Date().toISOString().split('T')[0]}.csv`;
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      });
      res.status(200).send('\uFEFF' + csv); // BOM for Excel compatibility
    } catch (err: any) {
      logger.error(`[EXPORT] getCsv type=${type} failed: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Failed to generate CSV export' });
      }
    }
  };

  // ── Helper ───────────────────────────────────────────────────────────────

  private async resolveDomain(userId: string, jobId: string): Promise<string> {
    try {
      const { connectToMongo } = await import('../../config/mongo');
      const db = await connectToMongo();
      const job = await db.collection('jobs').findOne({ id: jobId });
      if (!job) return 'unknown';
      const project = await db.collection('projects').findOne({ id: (job as any).projectId, userId });
      return (project as any)?.domain ?? (project as any)?.url ?? 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

import { Request, Response } from 'express';
import { z } from 'zod';
import { BrandMentionsService } from './brandMentions.service';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';

// ─── Validation schemas ───────────────────────────────────────────────────────

const scanSchema = z.object({
  brandName: z.string().min(1).max(200).trim(),
  domain: z
    .string()
    .min(1)
    .max(253)
    .trim()
    .transform((v) => v.replace(/^https?:\/\//, '').replace(/\/$/, '')),
  queries: z.array(z.string().min(1).max(500)).max(20).optional(),
});

// ─── Controller ───────────────────────────────────────────────────────────────

export class BrandMentionsController {
  private service = new BrandMentionsService();

  /**
   * POST /brand-mentions/search
   * Body: { query, num? }
   * Free-form search — any query, results not saved to DB
   */
  search = async (req: Request, res: Response): Promise<Response> => {
    try {
      const parsed = z.object({
        query: z.string().min(1).max(500).trim(),
        num: z.number().int().min(1).max(100).optional().default(10),
      }).safeParse(req.body);

      if (!parsed.success) {
        return ResponseUtil.error(res, 'Validation failed', parsed.error.errors.map((e) => e.message).join('; '), 400);
      }

      const result = await this.service.search(parsed.data.query, parsed.data.num);
      return ResponseUtil.success(res, 'Search completed', result);
    } catch (err: any) {
      logger.error(`[BRAND_MENTIONS] search: ${err.message}`);
      if (err.message?.startsWith('SERPAPI_KEY')) {
        return ResponseUtil.error(res, err.message, undefined, 503);
      }
      return ResponseUtil.serverError(res, 'Search failed');
    }
  };

  /**
   * POST /brand-mentions/scan
   * Body: { brandName, domain, queries? }
   */
  scan = async (req: Request, res: Response): Promise<Response> => {
    try {
      const parsed = scanSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtil.error(res, 'Validation failed', parsed.error.errors.map((e) => e.message).join('; '), 400);
      }

      const userId = req.user!.userId;
      const result = await this.service.scan(userId, parsed.data);
      return ResponseUtil.success(res, 'Brand mention scan completed', result);
    } catch (err: any) {
      logger.error(`[BRAND_MENTIONS] scan: ${err.message}`);
      if (err.message?.startsWith('GOOGLE_CSE_API_KEY')) {
        return ResponseUtil.error(res, err.message, undefined, 503);
      }
      return ResponseUtil.serverError(res, 'Scan failed');
    }
  };

  /**
   * GET /brand-mentions
   * Query: page, limit, dateFrom, dateTo, query, sourceDomain, brandName, domain
   */
  list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const result = await this.service.list(userId, req.query as any);
      return ResponseUtil.success(res, 'Brand mentions retrieved', result);
    } catch (err: any) {
      logger.error(`[BRAND_MENTIONS] list: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve mentions');
    }
  };

  /**
   * GET /brand-mentions/dashboard
   */
  dashboard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const result = await this.service.dashboard(userId);
      return ResponseUtil.success(res, 'Dashboard data retrieved', result);
    } catch (err: any) {
      logger.error(`[BRAND_MENTIONS] dashboard: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve dashboard');
    }
  };

  /**
   * GET /brand-mentions/export
   * Query: same filters as /brand-mentions
   * Returns: text/csv attachment
   */
  exportCsv = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const csv = await this.service.exportCsv(userId, req.query as any);

      const filename = `brand-mentions-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (err: any) {
      logger.error(`[BRAND_MENTIONS] export: ${err.message}`);
      ResponseUtil.serverError(res, 'Export failed');
    }
  };
}

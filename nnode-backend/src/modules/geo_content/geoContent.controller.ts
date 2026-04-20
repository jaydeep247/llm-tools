import { Request, Response } from 'express';
import { z } from 'zod';
import { GeoContentService } from './geoContent.service';
import { ResponseUtil } from '../../utils/response';
import { logger } from '../../shared/logger/logger';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const generateSchema = z.object({
  brief: z.string().min(10, 'Content brief must be at least 10 characters').max(5000),
  title: z.string().max(300).optional(),
  keywords: z.array(z.string().max(200)).max(20).optional().default([]),
  targetPrompt: z.string().max(1000).optional(),
  listicle: z.boolean().optional().default(false),
  brandId: z.string().optional(),
});

const updateTitleSchema = z.object({
  title: z.string().min(1).max(300).trim(),
});

// ─── Controller ───────────────────────────────────────────────────────────────

export class GeoContentController {
  private service = new GeoContentService();

  /**
   * POST /geo-content/generate
   * Generate a new GEO article via Claude and save to DB.
   */
  generate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const parsed = generateSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtil.error(
          res,
          'Validation failed',
          parsed.error.errors.map((e) => e.message).join('; '),
          400,
        );
      }

      const userId = req.user!.userId;
      const content = await this.service.generate(userId, parsed.data);
      return ResponseUtil.created(res, 'GEO content generated successfully', content);
    } catch (err: any) {
      logger.error(`[GEO_CONTENT] generate: ${err.message}`);
      if (err.message?.includes('ANTHROPIC_API_KEY')) {
        return ResponseUtil.error(res, err.message, undefined, 503);
      }
      return ResponseUtil.serverError(res, 'Failed to generate GEO content');
    }
  };

  /**
   * GET /geo-content
   * List all content for the authenticated user.
   */
  list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
      const limit = Math.min(50, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
      const result = await this.service.list(userId, page, limit);
      return ResponseUtil.success(res, 'GEO content list retrieved', result);
    } catch (err: any) {
      logger.error(`[GEO_CONTENT] list: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve GEO content list');
    }
  };

  /**
   * GET /geo-content/brand-prompts
   * Fetch saved brand prompts from the Python backend for the dropdown.
   * Query: ?jobId=<string>
   */
  getBrandPrompts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const jobId = req.query.jobId as string;
      if (!jobId) {
        return ResponseUtil.success(res, 'No jobId provided', { prompts: [] });
      }
      const prompts = await this.service.getBrandPrompts(jobId);
      return ResponseUtil.success(res, 'Brand prompts retrieved', { prompts });
    } catch (err: any) {
      logger.error(`[GEO_CONTENT] getBrandPrompts: ${err.message}`);
      return ResponseUtil.success(res, 'Brand prompts unavailable', { prompts: [] });
    }
  };

  /**
   * GET /geo-content/:id
   * Fetch a single piece of content.
   */
  getById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.userId;
      const id = String(req.params.id);
      const content = await this.service.getById(id, userId);
      if (!content) {
        return ResponseUtil.notFound(res, 'GEO content not found');
      }
      return ResponseUtil.success(res, 'GEO content retrieved', content);
    } catch (err: any) {
      logger.error(`[GEO_CONTENT] getById: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve GEO content');
    }
  };

  /**
   * PATCH /geo-content/:id/title
   * Inline title update from the content viewer.
   */
  updateTitle = async (req: Request, res: Response): Promise<Response> => {
    try {
      const parsed = updateTitleSchema.safeParse(req.body);
      if (!parsed.success) {
        return ResponseUtil.error(
          res,
          'Validation failed',
          parsed.error.errors.map((e) => e.message).join('; '),
          400,
        );
      }

      const userId = req.user!.userId;
      const id = String(req.params.id);
      const updated = await this.service.updateTitle(id, userId, parsed.data.title);
      if (!updated) {
        return ResponseUtil.notFound(res, 'GEO content not found');
      }
      return ResponseUtil.success(res, 'Title updated successfully');
    } catch (err: any) {
      logger.error(`[GEO_CONTENT] updateTitle: ${err.message}`);
      return ResponseUtil.serverError(res, 'Failed to update title');
    }
  };
}

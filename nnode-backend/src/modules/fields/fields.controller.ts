import { Request, Response } from 'express';
import { FieldsService } from './fields.service';
import { logger } from '../../shared/logger/logger';

export class FieldsController {
  private fieldsService: FieldsService;

  constructor() {
    this.fieldsService = new FieldsService();
  }

  getSeoExtract = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { url, jobId } = req.body ?? {};
      const finalUrl = url || req.body?.final_url;

      if (!finalUrl) {
        return res.status(400).json({ error: 'URL is required' });
      }
      if (!jobId || typeof jobId !== 'string') {
        return res.status(400).json({ error: 'jobId is required' });
      }

      const result = await this.fieldsService.getSeoExtract(finalUrl, jobId);

      if (!result) {
        return res.status(404).json({ error: 'SEO fields not found', url: finalUrl, jobId });
      }

      return res.json(result);
    } catch (error: any) {
      logger.error(`Error getting SEO fields: ${error.message}`);
      return res.status(500).json({ error: 'SEO extraction lookup failed', details: error.message });
    }
  };
}

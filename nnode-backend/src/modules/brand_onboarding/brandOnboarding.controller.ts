import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { BrandOnboardingService } from './brandOnboarding.service';
import { brandDescriptionSchema } from './brandOnboarding.validator';
import { logger } from '../../shared/logger/logger';

export class BrandOnboardingController {
  private brandOnboardingService: BrandOnboardingService;

  constructor() {
    this.brandOnboardingService = new BrandOnboardingService();
  }

  /**
   * POST /brand-onboarding/describe
   * Accepts { url, jobId? } and returns an AI-generated brand description.
   */
  describeBrand = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { url, jobId } = brandDescriptionSchema.parse(req.body);
      const description = await this.brandOnboardingService.generateBrandDescription(url, jobId);
      return ResponseUtil.success(res, 'Brand description generated', { description });
    } catch (error: any) {
      logger.error(`Brand description error: ${error.message}`);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to generate brand description');
    }
  };

  /**
   * GET /brand-onboarding/description/:jobId
   * Returns a previously stored brand description.
   */
  getBrandDescription = async (req: Request, res: Response): Promise<Response> => {
    try {
      const jobId = req.params.jobId as string;
      if (!jobId) {
        return ResponseUtil.error(res, 'jobId is required');
      }
      const description = await this.brandOnboardingService.getBrandDescription(jobId);
      if (!description) {
        return ResponseUtil.error(res, 'Brand description not yet available', undefined, 404);
      }
      return ResponseUtil.success(res, 'Brand description retrieved', { description });
    } catch (error: any) {
      logger.error(`Get brand description error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve brand description');
    }
  };
}

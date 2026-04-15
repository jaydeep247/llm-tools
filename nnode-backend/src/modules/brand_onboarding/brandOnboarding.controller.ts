import { Request, Response } from 'express';
import { ResponseUtil } from '../../utils/response';
import { BrandOnboardingService } from './brandOnboarding.service';
import { brandDescriptionSchema, brandTopicsSchema, saveBrandTopicsSchema, brandPromptsSchema, saveBrandPromptsSchema, executeBrandPromptsSchema } from './brandOnboarding.validator';
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
      const result = await this.brandOnboardingService.generateBrandDescription(url, jobId);
      return ResponseUtil.success(res, 'Brand description generated', result);
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
      const result = await this.brandOnboardingService.getBrandDescription(jobId);
      if (!result) {
        return ResponseUtil.error(res, 'Brand description not yet available', undefined, 404);
      }
      return ResponseUtil.success(res, 'Brand description retrieved', result);
    } catch (error: any) {
      logger.error(`Get brand description error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve brand description');
    }
  };

  /**
   * GET /brand-onboarding/data/:jobId
   * Returns all stored onboarding data.
   */
  getOnboardingData = async (req: Request, res: Response): Promise<Response> => {
    try {
      const jobId = req.params.jobId as string;
      if (!jobId) {
        return ResponseUtil.error(res, 'jobId is required');
      }
      const data = await this.brandOnboardingService.getOnboardingData(jobId);
      if (!data) {
        return ResponseUtil.error(res, 'No onboarding data found', undefined, 404);
      }
      return ResponseUtil.success(res, 'Onboarding data retrieved', data);
    } catch (error: any) {
      logger.error(`Get onboarding data error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve onboarding data');
    }
  };

  /**
   * POST /brand-onboarding/topics
   * Generates AI-suggested topics based on brand info.
   */
  generateTopics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { url, brandName, brandDescription, jobId } = brandTopicsSchema.parse(req.body);
      const topics = await this.brandOnboardingService.generateBrandTopics(url, brandName, brandDescription, jobId);
      return ResponseUtil.success(res, 'Brand topics generated', { topics });
    } catch (error: any) {
      logger.error(`Brand topics error: ${error.message}`);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to generate brand topics');
    }
  };

  /**
   * POST /brand-onboarding/topics/save
   * Saves the user's selected topics.
   */
  saveTopics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { jobId, selectedTopics } = saveBrandTopicsSchema.parse(req.body);
      await this.brandOnboardingService.saveBrandTopics(jobId, selectedTopics);
      return ResponseUtil.success(res, 'Brand topics saved');
    } catch (error: any) {
      logger.error(`Save brand topics error: ${error.message}`);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to save brand topics');
    }
  };

  /**
   * POST /brand-onboarding/prompts
   * Generates AI prompts based on selected topics.
   */
  generatePrompts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { brandName, brandDescription, selectedTopics, jobId } = brandPromptsSchema.parse(req.body);
      const topics = await this.brandOnboardingService.generateBrandPrompts(brandName, brandDescription, selectedTopics, jobId);
      return ResponseUtil.success(res, 'Brand prompts generated', { topics });
    } catch (error: any) {
      logger.error(`Brand prompts error: ${error.message}`);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to generate brand prompts');
    }
  };

  /**
   * POST /brand-onboarding/prompts/save
   * Saves the user's selected prompts.
   */
  savePrompts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { jobId, selectedPrompts } = saveBrandPromptsSchema.parse(req.body);
      await this.brandOnboardingService.saveBrandPrompts(jobId, selectedPrompts);
      return ResponseUtil.success(res, 'Brand prompts saved');
    } catch (error: any) {
      logger.error(`Save brand prompts error: ${error.message}`);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to save brand prompts');
    }
  };

  /**
   * POST /brand-onboarding/prompts/execute
   * Executes all prompts against GPT, Gemini, and Claude.
   */
  executePrompts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { brandName, prompts, jobId } = executeBrandPromptsSchema.parse(req.body);
      const results = await this.brandOnboardingService.executeBrandPrompts(brandName, prompts, jobId);
      return ResponseUtil.success(res, 'Prompts executed', { results });
    } catch (error: any) {
      logger.error(`Execute prompts error: ${error.message}`);
      if (error.name === 'ZodError') {
        return ResponseUtil.error(res, 'Validation failed', error.errors);
      }
      return ResponseUtil.serverError(res, 'Failed to execute prompts');
    }
  };

  /**
   * GET /brand-onboarding/prompts/results/:jobId
   * Returns stored prompt execution results.
   */
  getPromptResults = async (req: Request, res: Response): Promise<Response> => {
    try {
      const jobId = req.params.jobId as string;
      if (!jobId) {
        return ResponseUtil.error(res, 'jobId is required');
      }
      const results = await this.brandOnboardingService.getBrandPromptResults(jobId);
      if (!results) {
        return ResponseUtil.error(res, 'No prompt results found', undefined, 404);
      }
      return ResponseUtil.success(res, 'Prompt results retrieved', { results });
    } catch (error: any) {
      logger.error(`Get prompt results error: ${error.message}`);
      return ResponseUtil.serverError(res, 'Failed to retrieve prompt results');
    }
  };
}

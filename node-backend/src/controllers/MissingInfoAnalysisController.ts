/**
 * Missing Information Analysis Controller
 * Handles API endpoints for analyzing missing information gaps in content
 */

import express from 'express';
import { Logger } from '../helpers/logging/Logger.js';
import {
  MissingInfoAnalysisService,
  type MissingInfoAnalysisResult,
} from '../services/MissingInfoAnalysisService.js';

const logger = Logger.getInstance();

export class MissingInfoAnalysisController {
  /**
   * Analyze missing information for a given URL
   * GET /api/analysis/missing-info?url=...
   */
  public static async analyzeMissingInfo(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { url } = req.query;

      // Validate input
      if (!url || typeof url !== 'string') {
        res.status(400).json({ 
          success: false,
          error: 'URL is required as a query parameter' 
        });
        return;
      }

      // Normalize and validate URL format
      let normalizedUrl = url.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        if (normalizedUrl.startsWith('//')) {
          normalizedUrl = 'https:' + normalizedUrl;
        } else {
          normalizedUrl = 'https://' + normalizedUrl;
        }
      }

      try {
        new URL(normalizedUrl);
      } catch (error) {
        res.status(400).json({ 
          success: false,
          error: 'Invalid URL format' 
        });
        return;
      }

      logger.info('Starting missing information analysis', { url: normalizedUrl, userId });

      // Perform missing information analysis
      const result = await MissingInfoAnalysisService.analyzeMissingInfo(normalizedUrl);

      logger.info('Missing information analysis completed successfully', { 
        url: normalizedUrl, 
        userId,
        missing_count: result.summary.missing_count 
      });

      res.status(200).json({
        success: true,
        url: normalizedUrl,
        ...result,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      logger.error('Missing information analysis failed', error as Error,{  
        userId: req.user?.userId,
        url: req.query.url
      });

      res.status(500).json({
        success: false,
        error: 'Failed to analyze missing information',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      });
    }
  }
}
/**
 * Actionable Insights Controller
 * Handles API endpoints for page-level improvement recommendations
 */

import { Request, Response } from 'express';
import { 
  actionableInsightsService,
  AnalyzePageActionsRequest
} from '../services/ActionableInsightsService.js';

export class ActionableInsightsController {
  /**
   * Analyze page content for actionable improvements
   * POST /api/actionable-insights/analyze
   */
  static async analyzePageActions(req: Request, res: Response): Promise<void> {
    try {
      const { url, content, sessionId } = req.body as AnalyzePageActionsRequest;

      console.log('Controller analyzePageActions called:', {
        hasUrl: !!url,
        contentLength: content?.length || 0,
        sessionId
      });

      // Validate that at least one of url or content is provided
      if (!url && (!content || typeof content !== 'string' || content.trim().length === 0)) {
        res.status(400).json({
          success: false,
          error: 'Either URL or content is required for analysis'
        });
        return;
      }

      // Validate URL format if provided
      if (url) {
        let normalizedUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          normalizedUrl = `https://${url}`;
        }

        try {
          new URL(normalizedUrl);
        } catch {
          res.status(400).json({
            success: false,
            error: 'Invalid URL format'
          });
          return;
        }
      }

      // Limit content size to prevent abuse
      const limitedContent = content ? content.substring(0, 50000) : undefined;

      console.log('Calling actionable insights service with:', {
        url,
        contentLength: limitedContent?.length || 0,
        sessionId
      });

      const result = await actionableInsightsService.analyzePageActions(
        url,
        limitedContent,
        sessionId
      );

      console.log('Actionable insights service returned:', {
        totalActions: result.totalActions,
        improvement: result.improvement,
        currentScore: result.currentScore,
        predictedScore: result.predictedScore
      });

      res.json({
        success: true,
        data: result,
        message: 'Page analysis completed successfully'
      });
    } catch (error) {
      console.error('Error in analyzePageActions controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze page for actionable insights',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  }

  /**
   * Get session results
   * GET /api/actionable-insights/results/:sessionId
   */
  static async getSessionResults(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = parseInt(req.params.sessionId);
      
      if (isNaN(sessionId) || sessionId <= 0) {
        res.status(400).json({
          success: false,
          error: 'Valid session ID is required'
        });
        return;
      }

      const result = await actionableInsightsService.getSessionResults(sessionId);
      
      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Session results not found',
          message: 'No actionable insights data available for this session'
        });
        return;
      }

      res.json({
        success: true,
        data: result,
        message: 'Session results retrieved successfully'
      });
    } catch (error) {
      console.error('Error in getSessionResults:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get session results',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  }

  /**
   * Get actionable insights statistics
   * GET /api/actionable-insights/stats
   */
  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const result = await actionableInsightsService.getStats();
      
      res.json({
        success: true,
        data: result,
        message: 'Actionable insights statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Error in getStats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get actionable insights stats',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  }

  /**
   * Health check endpoint
   * GET /api/actionable-insights/health
   */
  static async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        message: 'Actionable Insights service is operational',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      });
    } catch (error) {
      console.error('Error in healthCheck:', error);
      res.status(500).json({
        success: false,
        error: 'Service health check failed'
      });
    }
  }
}

export default ActionableInsightsController;
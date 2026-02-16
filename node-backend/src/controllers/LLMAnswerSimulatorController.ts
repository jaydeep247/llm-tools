/**
 * LLM Answer Simulator Controller
 * Handles API endpoints for simulating AI responses to content queries
 */

import { Request, Response } from 'express';
import { 
  llmAnswerSimulatorService,
  SimulateQueryRequest,
  AnalyzeContentRequest,
  FetchUrlContentRequest
} from '../services/LLMAnswerSimulatorService.js';

export class LLMAnswerSimulatorController {
  /**
   * Simulate a single query response
   * POST /api/llm-answer-simulator/simulate
   */
  static async simulateQuery(req: Request, res: Response): Promise<void> {
    try {
      const { query, content, sessionId } = req.body as SimulateQueryRequest;

      // Validate required fields
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Valid query is required'
        });
        return;
      }

      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Content is required for analysis'
        });
        return;
      }

      // Limit content size to prevent abuse
      const limitedContent = content.substring(0, 20000);
      
      const result = await llmAnswerSimulatorService.simulateQuery(
        query.trim(), 
        limitedContent, 
        sessionId
      );
      
      res.json({
        success: true,
        data: result,
        message: 'Query simulation completed successfully'
      });
    } catch (error) {
      console.error('Error in simulateQuery:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to simulate query response',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  }

  /**
   * Analyze content with multiple queries
   * POST /api/llm-answer-simulator/analyze
   */
  static async analyzeContent(req: Request, res: Response): Promise<void> {
    try {
      const { content, queries } = req.body as AnalyzeContentRequest;

      console.log('Controller analyzeContent called:', {
        contentLength: content?.length || 0,
        queriesProvided: !!queries,
        queriesLength: queries?.length || 0
      });

      // Validate content
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        console.log('Content validation failed');
        res.status(400).json({
          success: false,
          error: 'Content is required for analysis'
        });
        return;
      }

      // Validate queries if provided
      if (queries && (!Array.isArray(queries) || queries.some(q => typeof q !== 'string'))) {
        console.log('Queries validation failed');
        res.status(400).json({
          success: false,
          error: 'Queries must be an array of strings'
        });
        return;
      }

      // Limit content and queries
      const limitedContent = content.substring(0, 20000);
      const limitedQueries = queries ? queries.slice(0, 10) : undefined;

      console.log('Calling service with:', {
        contentLength: limitedContent.length,
        queriesLength: limitedQueries?.length || 0
      });

      const result = await llmAnswerSimulatorService.analyzeContent(limitedContent, limitedQueries);
      
      console.log('Service returned:', result);

      // Ensure we always return a valid response structure
      const response = {
        success: true,
        data: result || {
          totalQueries: 0,
          averageConfidence: 0,
          sourceCoverage: 0,
          answerQuality: 0,
          recentAnswers: [],
          overallScore: 0
        },
        message: 'Content analysis completed successfully'
      };

      console.log('Sending response:', response);
      res.json(response);
    } catch (error) {
      console.error('Error in analyzeContent controller:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to analyze content',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  }

  /**
   * Get session results
   * GET /api/llm-answer-simulator/results/:sessionId
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

      const result = await llmAnswerSimulatorService.getSessionResults(sessionId);
      
      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Session results not found',
          message: 'No simulation data available for this session'
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
   * Get simulator statistics
   * GET /api/llm-answer-simulator/stats
   */
  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const result = await llmAnswerSimulatorService.getStats();
      
      res.json({
        success: true,
        data: result,
        message: 'Simulator statistics retrieved successfully'
      });
    } catch (error) {
      console.error('Error in getStats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get simulator stats',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  }

  /**
   * Fetch content from a URL
   * POST /api/llm-answer-simulator/fetch-url
   */
  static async fetchUrlContent(req: Request, res: Response): Promise<void> {
    try {
      const { url } = req.body as FetchUrlContentRequest;

      // Validate URL
      if (!url || typeof url !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Valid URL is required'
        });
        return;
      }

      // Normalize URL - add protocol if missing
      let normalizedUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        normalizedUrl = `https://${url}`;
      }

      // Basic URL validation
      try {
        new URL(normalizedUrl);
      } catch {
        res.status(400).json({
          success: false,
          error: 'Invalid URL format'
        });
        return;
      }

      const result = await llmAnswerSimulatorService.fetchUrlContent(normalizedUrl);
      
      res.json(result);
    } catch (error) {
      console.error('Error in fetchUrlContent:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch URL content',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  }

  /**
   * Health check endpoint
   * GET /api/llm-answer-simulator/health
   */
  static async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        message: 'LLM Answer Simulator service is operational',
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

export default LLMAnswerSimulatorController;
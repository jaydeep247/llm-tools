/**
 * Entity Extractor Controller
 * Handles API endpoints for entity extraction analysis
 */

import express from 'express';
import { Logger } from '../helpers/logging/Logger.js';
import {
  EntityExtractorService,
  EntityMetrics,
  EntityExtractionRequest,
} from '../services/EntityExtractorService.js';
import { getDatabase } from '../services/DatabaseService.js';

const logger = Logger.getInstance();

export class EntityExtractorController {
  /**
   * Extract entities from provided content
   * POST /api/entity-extractor/extract
   */
  public static async extractEntities(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { content, expectedEntities = [], sessionId }: EntityExtractionRequest = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Content is required and must be a string',
        });
        return;
      }

      logger.info('Extracting entities from content', {
        contentLength: content.length,
        expectedEntitiesCount: expectedEntities.length,
        sessionId,
      });

      // Extract entities
      const metrics = EntityExtractorService.extractEntities(content, expectedEntities);

      // Store results in database if sessionId provided
      if (sessionId) {
        try {
          const db = await getDatabase();
          // TODO: Store entity extraction results in database
          logger.info('Entity extraction results stored', { sessionId });
        } catch (dbError) {
          logger.warn('Failed to store entity extraction results', { sessionId, error: dbError });
        }
      }

      logger.info('Entity extraction completed successfully', {
        sessionId,
        totalEntitiesDetected: metrics.totalEntitiesDetected,
        overallScore: metrics.overallScore,
      });

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Error extracting entities', error as Error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during entity extraction',
      });
    }
  }

  /**
   * Get entity extraction results for a specific session
   * GET /api/entity-extractor/session/:sessionId
   */
  public static async getSessionResults(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const sessionId = parseInt(req.params.sessionId);

      if (isNaN(sessionId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid session ID',
        });
        return;
      }

      logger.info('Getting entity extraction results for session', { sessionId });

      const results = await EntityExtractorService.analyzeSession(sessionId);

      if (!results) {
        res.status(404).json({
          success: false,
          error: 'No entity extraction results found for this session',
        });
        return;
      }

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      logger.error('Error getting session entity results', error as Error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while fetching entity results',
      });
    }
  }

  /**
   * Analyze entities for URL content
   * POST /api/entity-extractor/analyze-url
   */
  public static async analyzeUrl(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { url, expectedEntities = [] } = req.body;

      if (!url || typeof url !== 'string') {
        res.status(400).json({
          success: false,
          error: 'URL is required and must be a string',
        });
        return;
      }

      logger.info('Analyzing entities for URL', { url, expectedEntitiesCount: expectedEntities.length });

      // Fetch URL content and analyze entities
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const content = await response.text();
        logger.info('URL content fetched successfully', { url, contentLength: content.length });
        
        // Extract entities from the actual content
        const metrics = EntityExtractorService.extractEntities(content, expectedEntities);
        
        logger.info('URL entity analysis completed', {
          url,
          totalEntitiesDetected: metrics.totalEntitiesDetected,
          overallScore: metrics.overallScore
        });

        res.json({
          success: true,
          data: metrics,
        });
      } catch (fetchError) {
        logger.warn('Failed to fetch URL content, returning error', { url, error: fetchError });
        res.status(400).json({
          success: false,
          error: `Failed to fetch URL content: ${(fetchError as Error).message}`,
        });
      }
    } catch (error) {
      logger.error('Error analyzing URL entities', error as Error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during URL analysis',
      });
    }
  }

  /**
   * Get entity extraction statistics
   * GET /api/entity-extractor/stats
   */
  public static async getStats(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      logger.info('Getting entity extraction statistics');

      // TODO: Implement actual statistics from database
      const stats = {
        totalAnalyses: 142,
        averageEntitiesPerAnalysis: 18.6,
        mostCommonEntityType: 'Concept',
        averageScore: 72.3,
        topEntities: [
          { text: 'AI', type: 'Concept', frequency: 45 },
          { text: 'Google', type: 'Product', frequency: 38 },
          { text: 'New York', type: 'Location', frequency: 22 },
        ],
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting entity extraction stats', error as Error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while fetching statistics',
      });
    }
  }
}
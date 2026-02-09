/**
 * Entity Coverage Audit Controller
 * Handles API endpoints for entity coverage analysis
 */

import express from 'express';
import { Logger } from '../helpers/logging/Logger.js';
import {
  EntityCoverageAuditService,
  type EntityCoverageResult,
  type EntityCoverageRequest,
} from '../services/EntityCoverageAuditService.js';

const logger = Logger.getInstance();

/**
 * Interface to extend the Request with user data
 * Solve the "Property 'user' does not exist" error
 */
interface AuthenticatedRequest extends express.Request {
  user?: {
    userId: number;
    email: string;
    role: "user" | "admin" | "premium";
  };
}

export class EntityCoverageAuditController {
  /**
   * Validate URL format
   */
  private static validateUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate entities array
   */
  private static validateEntities(entities: any): entities is string[] {
    return Array.isArray(entities) && entities.every(entity => typeof entity === 'string');
  }

  /**
   * Common entity coverage analysis logic
   */
  private static async performEntityAnalysis(
    req: AuthenticatedRequest,
    res: express.Response,
    url: string,
    entities: string[],
    sessionId?: string
  ): Promise<void> {
    const userId = req.user?.userId?.toString() || 'anonymous';

    logger.info('Starting entity coverage audit', { 
      userId, 
      url, 
      sessionId,
      entitiesCount: entities.length
    });

    try {
      const result: EntityCoverageResult = await EntityCoverageAuditService.analyzeEntityCoverage(
        url, 
        entities
      );

      /**
       * TASK INTEGRATION: Page-Level Improvement Actions
       * Here we inject the recommended actions based on the analysis result
       */
      const recommendedActions = this.generateRecommendedActions(result);

      logger.info('Entity coverage audit completed successfully', { 
        userId, 
        url, 
        entityCoveragePercent: result.entityCoveragePercent,
        // entityRelevanceScore: result.entityRelevanceScore,
        // detectedEntitiesCount: result.detectedEntitiesCount
      });

      res.json({
        success: true,
        data:{
          ...result,
          recommendations: recommendedActions // New field for your task
        }
      });

    } catch (error) {
      logger.error('Error in entity coverage audit', 
        error as Error,{
        userId: userId,
        url: url,
        sessionId: sessionId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform entity coverage audit',
        details: error instanceof Error ? error.message : String(error)
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform entity coverage audit',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Helper to generate the "Page-Level Improvement Actions" you requested
   */
  private static generateRecommendedActions(result: EntityCoverageResult) {
    const actions = [];

    if (result.entityCoveragePercent < 50) {
      actions.push({
        action: "Inject missing semantic entities into content",
        priority: "High",
        impact: "+25 points"
      });
    }

    if (result.detectedEntitiesCount < 5) {
      actions.push({
        action: "Add structured data (JSON-LD) for better entity recognition",
        priority: "Medium",
        impact: "+15 points"
      });
    }

    return actions;
  }

  /**
   * Analyze entity coverage for a given URL
   * POST /api/aeo/entity-coverage-audit
   */
  public static async analyzeEntityCoverage(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { url, expectedEntities, sessionId }: EntityCoverageRequest = req.body;

      // Validate input
      if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
      }

      if (!this.validateUrl(url)) {
        res.status(400).json({ error: 'Invalid URL format' });
        return;
      }

      const entities = expectedEntities || [];
      if (expectedEntities && !this.validateEntities(expectedEntities)) {
        res.status(400).json({ error: 'Expected entities must be an array of strings' });
        return;
      }

      await this.performEntityAnalysis(req, res, url, entities, sessionId?.toString());

    } catch (error) {
      logger.error('Error in analyzeEntityCoverage', error as Error ,{
        stack: error instanceof Error ? error.stack : undefined,
        url: req.body?.url || 'unknown'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process entity coverage request'
      });
    }
  }

  /**
   * Get cached entity coverage audit results for a session
   * GET /api/aeo/entity-coverage-audit/:sessionId
   */
  public static async getCachedResults(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const userId = req.user?.userId?.toString();
      const sessionId = req.params.sessionId;

      if (!sessionId || isNaN(parseInt(sessionId))) {
        res.status(400).json({ error: 'Invalid session ID' });
        return;
      }

      // TODO: Implement caching/database storage for audit results
      // For now, return a message that caching is not implemented
      logger.info('Entity coverage audit cache lookup requested', { userId, sessionId });

      res.json({
        success: true,
        message: 'Caching not yet implemented. Please use POST endpoint to generate new analysis.',
        data: null
      });

    } catch (error) {
      logger.error('Error retrieving cached entity coverage audit', error as Error ,{
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.user?.userId,
        sessionId: req.params.sessionId
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve entity coverage audit results'
      });
    }
  }

  /**
   * Analyze entity coverage with custom expected entities
   * POST /api/aeo/entity-coverage-audit/custom
   */
  public static async analyzeWithCustomEntities(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const { url, customEntities, sessionId } = req.body;

      if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
      }

      if (!customEntities) {
        res.status(400).json({ error: 'customEntities is required' });
        return;
      }

      if (!this.validateUrl(url)) {
        res.status(400).json({ error: 'Invalid URL format' });
        return;
      }

      if (!this.validateEntities(customEntities)) {
        res.status(400).json({ 
          error: 'customEntities must be an array of strings' 
        });
        return;
      }

      await this.performEntityAnalysis(req as AuthenticatedRequest, res, url, customEntities, sessionId);

    } catch (error) {
      logger.error('Error in analyzeWithCustomEntities', error as Error ,{
        stack: error instanceof Error ? error.stack : undefined,
        url: req.body?.url || 'unknown'
      });

      res.status(500).json({
        success: false,
        error: 'Failed to process custom entity coverage request'
      });
    }
  }
}
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

export class EntityCoverageAuditController {
  /**
   * Analyze entity coverage for a given URL
   * POST /api/aeo/entity-coverage-audit
   */
  public static async analyzeEntityCoverage(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { url, expectedEntities, sessionId }: EntityCoverageRequest = req.body;

      // Validate input
      if (!url) {
        res.status(400).json({ error: 'URL is required' });
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
        res.status(400).json({ error: 'Invalid URL format' });
        return;
      }

      logger.info('Starting entity coverage audit', { 
        userId, 
        url: normalizedUrl, 
        sessionId,
        expectedEntitiesCount: expectedEntities?.length || 0 
      });

      // Perform entity coverage analysis
      const result: EntityCoverageResult = await EntityCoverageAuditService.analyzeEntityCoverage(
        normalizedUrl, 
        expectedEntities || []
      );

      logger.info('Entity coverage audit completed successfully', { 
        userId, 
        url: normalizedUrl, 
        entityCoveragePercent: result.entityCoveragePercent,
        entityRelevanceScore: result.entityRelevanceScore,
        detectedEntitiesCount: result.detectedEntitiesCount
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Error in entity coverage audit',error as Error, {
        stack: error instanceof Error ? error.stack : undefined,
        url: req.body.url
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform entity coverage audit',
        details: error instanceof Error ? error.message : String(error)
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
      const userId = req.user!.userId;
      const sessionId = parseInt(req.params.sessionId);

      if (isNaN(sessionId)) {
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
      logger.error('Error retrieving cached entity coverage audit', error as Error, {
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
      const userId = req.user!.userId;
      const { url, customEntities, sessionId } = req.body;

      if (!url || !customEntities || !Array.isArray(customEntities)) {
        res.status(400).json({ 
          error: 'URL and customEntities array are required' 
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
        res.status(400).json({ error: 'Invalid URL format' });
        return;
      }

      logger.info('Starting custom entity coverage audit', { 
        userId, 
        url: normalizedUrl, 
        sessionId,
        customEntitiesCount: customEntities.length
      });

      // Perform analysis with custom expected entities
      const result: EntityCoverageResult = await EntityCoverageAuditService.analyzeEntityCoverage(
        normalizedUrl, 
        customEntities
      );

      logger.info('Custom entity coverage audit completed', { 
        userId, 
        url: normalizedUrl, 
        entityCoveragePercent: result.entityCoveragePercent,
        entityRelevanceScore: result.entityRelevanceScore
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      logger.error('Error in custom entity coverage audit',error as Error, {
        stack: error instanceof Error ? error.stack : undefined,
        url: req.body.url
      });

      res.status(500).json({
        success: false,
        error: 'Failed to perform custom entity coverage audit',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export const entityCoverageAuditController = new EntityCoverageAuditController();
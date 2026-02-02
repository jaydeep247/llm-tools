/**
 * Entity Extractor Routes
 * Routes for entity extraction analysis API
 */

import express from 'express';
import { EntityExtractorController } from '../../controllers/EntityExtractorController.js';
import { authenticateUser } from '../../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Extract entities from content
 * POST /api/entity-extractor/extract
 */
router.post(
  '/extract',
  authenticateUser,
  EntityExtractorController.extractEntities
);

/**
 * Get entity extraction results for a session
 * GET /api/entity-extractor/session/:sessionId
 */
router.get(
  '/session/:sessionId',
  authenticateUser,
  EntityExtractorController.getSessionResults
);

/**
 * Analyze entities for URL content
 * POST /api/entity-extractor/analyze-url
 */
router.post(
  '/analyze-url',
  authenticateUser,
  EntityExtractorController.analyzeUrl
);

/**
 * Get entity extraction statistics
 * GET /api/entity-extractor/stats
 */
router.get(
  '/stats',
  authenticateUser,
  EntityExtractorController.getStats
);

export default router;
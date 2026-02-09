import express from 'express';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { EntityCoverageAuditController } from '../../controllers/EntityCoverageAuditController.js';

const router = express.Router();

/**
 * POST /api/aeo/entity-coverage-audit
 * Analyze entity coverage for a given URL
 */
router.post('/entity-coverage-audit', authenticateUser, EntityCoverageAuditController.analyzeEntityCoverage);

/**
 * GET /api/aeo/entity-coverage-audit/:sessionId
 * Get cached entity coverage audit results for a session
 */
router.get('/entity-coverage-audit/:sessionId', authenticateUser, EntityCoverageAuditController.getCachedResults);

/**
 * POST /api/aeo/entity-coverage-audit/custom
 * Analyze entity coverage with custom expected entities
 */
router.post('/entity-coverage-audit/custom', authenticateUser, EntityCoverageAuditController.analyzeWithCustomEntities);

export default router;
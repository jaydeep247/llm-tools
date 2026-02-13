import express from 'express';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { MissingInfoAnalysisController } from '../../controllers/MissingInfoAnalysisController.js';

const router = express.Router();

/**
 * GET /api/analysis/missing-info
 * Analyze missing information for a given URL
 * Query params: url (required)
 */
router.get('/missing-info', authenticateUser, MissingInfoAnalysisController.analyzeMissingInfo);

export default router;
/**
 * Actionable Insights Routes
 * API routes for page-level improvement recommendations
 */

import express from 'express';
import { ActionableInsightsController } from '../../controllers/ActionableInsightsController.js';

const router = express.Router();

/**
 * @route POST /api/actionable-insights/analyze
 * @desc Analyze page content for actionable improvements
 * @access Public
 */
router.post('/analyze', ActionableInsightsController.analyzePageActions);

/**
 * @route GET /api/actionable-insights/results/:sessionId
 * @desc Get analysis results for a specific session
 * @access Public
 */
router.get('/results/:sessionId', ActionableInsightsController.getSessionResults);

/**
 * @route GET /api/actionable-insights/stats
 * @desc Get actionable insights statistics
 * @access Public
 */
router.get('/stats', ActionableInsightsController.getStats);

/**
 * @route GET /api/actionable-insights/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', ActionableInsightsController.healthCheck);

export default router;
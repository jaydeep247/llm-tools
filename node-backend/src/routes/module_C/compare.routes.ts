/**
 * Multi-Model Comparison Routes
 */

import { Router } from 'express';
import CompareController from '../../controllers/compare.controller.js';
import { body, param } from 'express-validator';
import { validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

const router = Router();
const compareController = new CompareController();

// Validation middleware
const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

// Routes

/**
 * @route   POST /api/compare
 * @desc    Compare responses from multiple LLM providers
 * @access  Public
 * @body    { sourceUrl: string, question?: string }
 */
router.post(
    '/',
    [
        body('sourceUrl')
            .isURL()
            .withMessage('Must be a valid URL'),
        body('question')
            .optional()
            .isString()
            .isLength({ min: 1, max: 1000 })
            .withMessage('Question must be between 1 and 1000 characters')
    ],
    handleValidationErrors,
    compareController.compare
);

/**
 * @route   GET /api/compare/status
 * @desc    Get provider availability status
 * @access  Public
 */
router.get('/status', compareController.getStatus);

/**
 * @route   POST /api/compare/test/:provider
 * @desc    Test a specific provider
 * @access  Public
 * @params  provider: string (openai|claude|gemini)
 */
router.post(
    '/test/:provider',
    [
        param('provider')
            .isIn(['openai', 'claude', 'gemini'])
            .withMessage('Provider must be one of: openai, claude, gemini'),
        body('testPrompt')
            .optional()
            .isString()
            .isLength({ min: 1, max: 500 })
            .withMessage('Test prompt must be between 1 and 500 characters')
    ],
    handleValidationErrors,
    compareController.testProvider
);

/**
 * @route   GET /api/compare/debug
 * @desc    Get debug information about the service
 * @access  Public
 */
router.get('/debug', compareController.getDebugInfo);

/**
 * @route   GET /api/compare/debug-gemini
 * @desc    Debug Gemini integration - test multiple approaches
 * @access  Public
 */
router.get('/debug-gemini', compareController.debugGemini);

/**
 * @route   GET /api/compare/test-gemini
 * @desc    Test Gemini API and list available models
 * @access  Public
 */
router.get('/test-gemini', compareController.testGemini);

export { router as compareRoutes };
export default router;

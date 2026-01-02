import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

/**
 * Validation middleware for crawl requests
 */
export const validateCrawlRequest = [
    body('url')
        .trim()
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('Invalid URL format. Must be a valid HTTP/HTTPS URL'),
    body('maxPages')
        .optional()
        .isInt({ min: 1, max: 10000 })
        .withMessage('maxPages must be between 1 and 10000'),
    body('maxDepth')
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('maxDepth must be between 0 and 100'),
    body('runAudits')
        .optional()
        .isBoolean()
        .withMessage('runAudits must be a boolean'),
    body('device')
        .optional()
        .isIn(['mobile', 'desktop'])
        .withMessage('device must be either "mobile" or "desktop"')
];

/**
 * Validation middleware for session ID parameters
 */
export const validateSessionId = [
    param('sessionId')
        .isInt({ min: 1 })
        .withMessage('Session ID must be a positive integer')
];

/**
 * Validation middleware for pagination
 */
export const validatePagination = [
    query('limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('limit must be between 1 and 1000'),
    query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('offset must be a non-negative integer')
];

/**
 * Validation middleware for user registration
 */
export const validateUserRegistration = [
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Invalid email address'),
    body('password')
        .isLength({ min: 8, max: 100 })
        .withMessage('Password must be between 8 and 100 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('name')
        .optional()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Name must be between 1 and 100 characters')
];

/**
 * Validation middleware for user login
 */
export const validateUserLogin = [
    body('email')
        .trim()
        .isEmail()
        .normalizeEmail()
        .withMessage('Invalid email address'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

/**
 * Validation middleware for schedule creation
 */
export const validateSchedule = [
    body('url')
        .trim()
        .isURL({ protocols: ['http', 'https'], require_protocol: true })
        .withMessage('Invalid URL format'),
    body('cronExpression')
        .trim()
        .notEmpty()
        .withMessage('Cron expression is required'),
    body('enabled')
        .optional()
        .isBoolean()
        .withMessage('enabled must be a boolean')
];

/**
 * Middleware to handle validation errors
 * Call this after validation middleware to check for errors
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Validation failed',
            details: errors.array().map(err => ({
                field: err.type === 'field' ? err.path : undefined,
                message: err.msg
            }))
        });
    }
    next();
};

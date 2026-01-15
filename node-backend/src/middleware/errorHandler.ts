/**
 * Global Error Handling Middleware
 * Handles 404 errors and uncaught exceptions
 */

import express from 'express';
import { Logger } from '../helpers/logging/Logger.js';

const logger = Logger.getInstance();

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: express.Request, res: express.Response): void {
    logger.warn(`404 Not Found: ${req.method} ${req.url}`, { ip: req.ip });
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.url}`
    });
}

/**
 * Global error handler
 * Must be used after all routes
 */
export function globalErrorHandler(
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
): void {
    // Log the error
    logger.error('Unhandled error', err, {
        url: req.url,
        method: req.method,
        ip: req.ip,
        userId: req.user?.userId
    });

    // Determine if we're in production
    const isProduction = process.env.NODE_ENV === 'production';

    // Send appropriate response
    if (isProduction) {
        // Production: Don't expose internal details
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'An unexpected error occurred. Please try again later.',
            timestamp: new Date().toISOString()
        });
    } else {
        // Development: Provide detailed error info
        res.status(500).json({
            error: err.name || 'Error',
            message: err.message,
            stack: err.stack,
            timestamp: new Date().toISOString()
        });
    }
}

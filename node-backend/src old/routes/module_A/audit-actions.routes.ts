import { Router, Request, Response } from 'express';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { getCancellationManager } from '../../services/crawlCancellationManager.js';
import { Logger } from '../../helpers/logging/Logger.js';
import { getDatabase } from '../../services/DatabaseService.js';

const router = Router();
const logger = Logger.getInstance();

/**
 * Cancel all crawling and audit processes for the authenticated user
 * POST /api/cancel-audits
 */
router.post('/cancel-audits', authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const { sessionId } = req.body; // Optional: specific session to cancel
        
        const cancellationManager = getCancellationManager();
        const db = getDatabase();

        if (sessionId) {
            // Cancel specific session
            const sessionIdNum = parseInt(String(sessionId));
            if (isNaN(sessionIdNum)) {
                return res.status(400).json({
                    error: 'Invalid sessionId',
                    success: false
                });
            }

            // Verify ownership
            const session = await db.getCrawlSession(sessionIdNum);
            if (!session) {
                return res.status(404).json({
                    error: 'Session not found',
                    success: false
                });
            }

            if (session.userId !== userId && req.user!.role !== 'admin') {
                return res.status(403).json({
                    error: 'Access denied',
                    success: false
                });
            }

            await cancellationManager.cancelCrawl(sessionIdNum, userId);
            logger.info(`[cancel-audits] Cancelled crawl for session ${sessionIdNum}, user ${userId}`);

            res.status(200).json({
                message: `Crawl cancelled for session ${sessionIdNum}`,
                sessionId: sessionIdNum,
                timestamp: new Date().toISOString(),
                success: true
            });
        } else {
            // Cancel all active crawls for the user
            const result = await cancellationManager.cancelUserCrawls(userId);
            logger.info(`[cancel-audits] Cancelled ${result.cancelled.length} crawl(s) for user ${userId}`);

            if (result.errors.length > 0) {
                logger.warn(`[cancel-audits] Errors during cancellation: ${result.errors.join(', ')}`);
            }

            res.status(200).json({
                message: `Cancelled ${result.cancelled.length} active crawl(s)`,
                cancelledSessions: result.cancelled,
                errors: result.errors,
                timestamp: new Date().toISOString(),
                success: true
            });
        }
    } catch (error) {
        logger.error('[cancel-audits] Failed to cancel crawls', error as Error);
        res.status(500).json({
            error: 'Failed to cancel crawls',
            details: (error as Error).message,
            success: false
        });
    }
});

export default router;

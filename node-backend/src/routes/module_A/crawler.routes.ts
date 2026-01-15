import express from 'express';
import { getDatabase } from '../../services/DatabaseService.js';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { validatePagination, handleValidationErrors } from '../../utils/validation.js';
import { Logger } from '../../helpers/logging/Logger.js';

const router = express.Router();
const logger = Logger.getInstance();

// Share session endpoint - called when user views previous results
router.post('/sessions/:sessionId/share', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const sessionId = parseInt(req.params.sessionId);

        if (isNaN(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        const db = getDatabase();
        const session = await db.getCrawlSession(sessionId);

        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Share session with user
        await db.shareSessionWithUser(sessionId, userId);

        logger.info('Session shared with user', { sessionId, userId });
        res.json({ success: true, message: 'Session shared successfully' });
    } catch (error) {
        logger.error('Failed to share session', error as Error);
        res.status(500).json({ error: 'Failed to share session' });
    }
});

// Crawl history endpoint
router.get('/crawl-history', authenticateUser, validatePagination, handleValidationErrors, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user!.userId;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

        const db = getDatabase();
        const history = await db.getUserCrawlSessionsWithResults(userId, limit, offset);

        res.json({
            success: true,
            history,
            pagination: {
                limit,
                offset,
                hasMore: history.length === limit
            }
        });
    } catch (error) {
        logger.error('Failed to get crawl history', error as Error);
        res.status(500).json({ error: 'Failed to get crawl history' });
    }
});

// Get session crawl data (pages, resources, logs, statistics)
router.get('/data/list', authenticateUser, validatePagination, handleValidationErrors, async (req: express.Request, res: express.Response) => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
        const { sessionId } = req.query;
        const userId = req.user!.userId;
        const limit = Math.min(parseInt(req.query.limit as string) || 1000, 10000);
        const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

        // ✅ DETAILED LOGGING
        console.log(`[${requestId}] [DEBUG] /api/data/list called`, {
            userId,
            sessionId,
            limit,
            offset,
            hasUser: !!req.user,
            userRole: req.user?.role
        });

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const db = getDatabase();
        const sessionIdNum = parseInt(sessionId as string);

        // Get the session and verify ownership
        const session = await db.getCrawlSession(sessionIdNum);
        if (!session) {
            logger.warn('Session not found', { sessionId: sessionIdNum, userId });
            return res.status(404).json({ error: 'Session not found' });
        }

        console.log(`[${requestId}] [DEBUG] Session found`, {
            sessionId: session.id,
            sessionOwner: session.userId,
            status: session.status
        });

        // Check if user owns this session or is admin
        if (session.userId && session.userId !== userId && req.user!.role !== 'admin') {
            logger.warn('Unauthorized access to session', { sessionId: sessionIdNum, userId, sessionOwner: session.userId });
            return res.status(403).json({ error: 'Access denied' });
        }

        const pages = await db.getPages(sessionIdNum, limit, offset);
        const totalPageCount = await db.getPageCount(sessionIdNum);
        const resources = await db.getResources(sessionIdNum);
        const totalResourceCount = await db.getResourceCount(sessionIdNum);
        const logs = await db.getCrawlLogs(sessionIdNum);

        const resourceStats = await db.getResourceTypeStats(sessionIdNum);

        // Calculate statistics
        const successfulPages = pages.filter(p => p.success).length;
        const failedPages = pages.filter(p => !p.success).length;
        const avgResponseTime = pages.length > 0
            ? Math.round(pages.reduce((sum, p) => sum + (p.responseTime || 0), 0) / pages.length)
            : 0;
        const totalWords = pages.reduce((sum, p) => sum + (p.wordCount || 0), 0);
        const avgTitleLength = pages.length > 0
            ? Math.round(pages.reduce((sum, p) => sum + (p.titleLength || 0), 0) / pages.length)
            : 0;
        const avgDescriptionLength = pages.length > 0
            ? Math.round(pages.reduce((sum, p) => sum + (p.descriptionLength || 0), 0) / pages.length)
            : 0;



        logger.info('Session data retrieved', {
            sessionId: sessionIdNum,
            userId,
            pagesCount: pages.length,
            resourcesCount: resources.length
        });

        res.json({
            success: true,
            data: pages,
            resources: resources,
            logs: logs,
            session: session,
            paging: {
                limit,
                offset,
                count: pages.length,
                total: totalPageCount,
                hasMore: offset + limit < totalPageCount
            },
            pagination: {
                limit,
                offset,
                total: totalPageCount,
                hasMore: offset + limit < totalPageCount
            },
            statistics: {
                totalPages: totalPageCount,
                totalResources: totalResourceCount,
                successfulPages,
                failedPages,
                averageResponseTime: avgResponseTime,
                totalWords: totalWords,
                averageTitleLength: avgTitleLength,
                averageDescriptionLength: avgDescriptionLength,
                resourceStats: resourceStats
            }
        });

    } catch (error) {
        logger.error('Failed to get session data', error as Error);
        res.status(500).json({
            error: 'Failed to fetch session data',
            details: (error as Error).message
        });
    }
});

export default router;

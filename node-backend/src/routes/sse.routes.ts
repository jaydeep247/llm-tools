import { Router } from 'express';
import { authenticateUser } from '../middleware/authMiddleware.js';
import { registerClient, unregisterClient } from '../services/SSEService.js';
import { Logger } from '../helpers/logging/Logger.js';

const router = Router();
const logger = Logger.getInstance();

// ✅ FIXED: Protected SSE endpoint - requires Authorization header
router.get('/events', authenticateUser, (req, res) => {
    const requestId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const userId = req.user!.userId;
    const clientId = registerClient(res, userId);

    // ✅ FIXED: Send proper initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({
        clientId: clientId,
        userId: userId,
        serverTime: new Date().toISOString()
    })}\n\n`);

    req.on('close', () => {
        unregisterClient(clientId);
    });

    req.on('error', (err) => {
        logger.error(`SSE connection error: ${err.message}`, err);
        unregisterClient(clientId);
    });
});

export default router;

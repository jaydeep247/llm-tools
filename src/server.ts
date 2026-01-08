import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCrawl, cancelAudits, resetAuditCancellation } from './crawler.js';
import { monitoringRoutes, healthChecker, metricsCollector } from './routes/monitoring.routes.js';
import { auditsRoutes } from './routes/audits.routes.js';
import seoRoutes from './routes/seo.routes.js';
import linksRoutes from './routes/links.routes.js';
import linkScoreRoutes from './routes/linkScore.routes.js';
import aeoRoutes from './routes/aeo.routes.js';
import authRoutes from './routes/auth.routes.js';
import { authenticateUser, checkUsageLimit, optionalAuth } from './auth/authMiddleware.js';
import { Logger } from './logging/Logger.js';
import { SchedulerService } from './scheduler/SchedulerService.js';
import { getDatabase } from './database/DatabaseService.js';
import { AuditIntegration } from './audits/AuditIntegration.js';
import { CrawlAuditIntegration } from './audits/CrawlAuditIntegration.js';
import { Mailer } from './utils/Mailer.js';
import { validateCrawlRequest, validateSessionId, validatePagination, handleValidationErrors } from './utils/validation.js';

type Client = {
    id: number;
    res: express.Response;
    userId: number;
};

const app = express();
const logger = Logger.getInstance();
const mailer = Mailer.getInstance();

// Security: Helmet.js for secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "data:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true
}));


app.use(cors({
    origin: process.env.CORS_ORIGIN?.replace(/\/$/, ''), // Remove trailing slash
    credentials: true // Allow cookies to be sent
}));
app.use(cookieParser());

// Request logging with morgan
app.use(morgan('combined', {
    stream: {
        write: (message: string) => logger.info(message.trim())
    },
    skip: (req: express.Request) => req.url === '/api/health' || req.url === '/health' // Skip health checks
}));

// Increase JSON body limit; configurable via BODY_LIMIT (default 5mb)
const bodyLimit = process.env.BODY_LIMIT || '5mb';
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

// Serve built frontend (Vite output)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distFrontendPath = path.resolve(__dirname, '../dist-frontend');
app.use(express.static(distFrontendPath));

// Add monitoring routes (rate limiting removed)
app.use('/api', monitoringRoutes);
app.use('/api', auditsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', seoRoutes);
app.use(linksRoutes);
app.use(linkScoreRoutes);
app.use('/aeo', aeoRoutes);

// Cancel audits endpoint
app.post('/api/cancel-audits', (req, res) => {
    try {
        cancelAudits();
        logger.info('Audit cancellation requested by user');

        res.status(200).json({
            message: 'Audit cancellation requested',
            timestamp: new Date().toISOString(),
            success: true
        });
    } catch (error) {
        logger.error('Failed to cancel audits', error as Error);
        res.status(500).json({
            error: 'Failed to cancel audits',
            details: (error as Error).message,
            success: false
        });
    }
});

// Schedule management routes (protected)
app.get('/api/schedules', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const allSchedules = await scheduleManager.getAllSchedules();

        // Filter schedules by user (admins can see all)
        const schedules = req.user!.role === 'admin'
            ? allSchedules
            : allSchedules.filter((s: any) => s.userId === userId);

        res.json({ schedules });
    } catch (error) {
        logger.error('Failed to get schedules', error as Error);
        res.status(500).json({ error: 'Failed to get schedules' });
    }
});

app.post('/api/schedules', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();

        // Add userId to schedule data
        const scheduleData = { ...req.body, userId };
        const scheduleId = await scheduleManager.createSchedule(scheduleData);

        logger.info('Schedule created', { userId, scheduleId });
        res.json({ id: scheduleId, message: 'Schedule created successfully' });
    } catch (error) {
        logger.error('Failed to create schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

app.get('/api/schedules/:id', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can access all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({ schedule });
    } catch (error) {
        logger.error('Failed to get schedule', error as Error);
        res.status(500).json({ error: 'Failed to get schedule' });
    }
});

app.put('/api/schedules/:id', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can update all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await scheduleManager.updateSchedule(parseInt(req.params.id), req.body);
        res.json({ message: 'Schedule updated successfully' });
    } catch (error) {
        logger.error('Failed to update schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

app.delete('/api/schedules/:id', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can delete all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await scheduleManager.deleteSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule deleted successfully' });
    } catch (error) {
        logger.error('Failed to delete schedule', error as Error);
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

app.post('/api/schedules/:id/toggle', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can toggle all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await scheduleManager.toggleSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule toggled successfully' });
    } catch (error) {
        logger.error('Failed to toggle schedule', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});

app.post('/api/schedules/:id/trigger', authenticateUser, async (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = await scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can trigger all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        await schedulerService.triggerSchedule(parseInt(req.params.id));
        res.json({ message: 'Schedule triggered successfully' });
    } catch (error) {
        logger.error('Failed to trigger schedule', error as Error);
        res.status(400).json({ error: (error as Error).message });
    }
});

// Share session endpoint - called when user views previous results
app.post('/api/sessions/:sessionId/share', authenticateUser, async (req, res) => {
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
app.get('/api/crawl-history', authenticateUser, validatePagination, handleValidationErrors, async (req: express.Request, res: express.Response) => {
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
app.get('/api/data/list', authenticateUser, validatePagination, handleValidationErrors, async (req: express.Request, res: express.Response) => {
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

app.get('/api/schedules/:id/executions', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can view all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const executions = scheduleManager.getExecutionHistory(parseInt(req.params.id), limit);
        res.json({ executions });
    } catch (error) {
        logger.error('Failed to get schedule executions', error as Error);
        res.status(500).json({ error: 'Failed to get schedule executions' });
    }
});

app.get('/api/schedules/:id/stats', authenticateUser, (req, res) => {
    try {
        const userId = req.user!.userId;
        const scheduleManager = schedulerService.getScheduleManager();
        const schedule = scheduleManager.getSchedule(parseInt(req.params.id)) as any;

        if (!schedule) {
            return res.status(404).json({ error: 'Schedule not found' });
        }

        // Check ownership (admins can view all)
        if (req.user!.role !== 'admin' && schedule.userId !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const stats = scheduleManager.getScheduleStats(parseInt(req.params.id));
        res.json({ stats });
    } catch (error) {
        logger.error('Failed to get schedule stats', error as Error);
        res.status(500).json({ error: (error as Error).message });
    }
});


app.get('/api/scheduler/status', authenticateUser, (req, res) => {
    try {
        const status = schedulerService.getStatus();
        res.json({ status });
    } catch (error) {
        logger.error('Failed to get scheduler status', error as Error);
        res.status(500).json({ error: 'Failed to get scheduler status' });
    }
});

app.post('/api/scheduler/validate-cron', authenticateUser, (req, res) => {
    try {
        const { cronExpression } = req.body;
        if (!cronExpression) {
            return res.status(400).json({ error: 'cronExpression is required' });
        }

        const scheduleManager = schedulerService.getScheduleManager();
        const validation = scheduleManager.validateCronExpression(cronExpression);
        const description = scheduleManager.getCronDescription(cronExpression);

        res.json({ validation, description });
    } catch (error) {
        logger.error('Failed to validate cron expression', error as Error);
        res.status(500).json({ error: 'Failed to validate cron expression' });
    }
});

let nextClientId = 1;
const clients: Client[] = [];

// Updated to support user-specific events
function sendEvent(data: unknown, event: string = 'message', userId?: number) {
    const jsonString = JSON.stringify(data);
    const payload = `event: ${event}\ndata: ${jsonString}\n\n`;
    console.log('sendEvent data:', data);
    console.log('sendEvent userId:', userId);

    // If userId is specified, only send to that user's clients
    const targetClients = userId
        ? clients.filter(c => c.userId === userId)
        : clients; // Fallback to broadcast if no userId (for backwards compatibility)

    for (const c of targetClients) {
        try {
            c.res.write(payload);
        } catch (error) {
            console.error('Failed to write to client:', error);
        }
    }

    if (userId) {
    }
}

// ✅ FIXED: Protected SSE endpoint - requires Authorization header
app.get('/events', authenticateUser, (req, res) => {
    const requestId = `sse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const id = nextClientId++;
    const userId = req.user!.userId;

    clients.push({ id, res, userId });
    logger.info(`SSE client connected: ${id} for user ${userId}`);

    // ✅ FIXED: Send proper initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({
        clientId: id,
        userId: userId,
        serverTime: new Date().toISOString()
    })}\n\n`);

    req.on('close', () => {
        const idx = clients.findIndex(c => c.id === id);
        if (idx !== -1) {
            clients.splice(idx, 1);
            logger.info(`SSE client disconnected: ${id}`);
        }
    });

    req.on('error', (err) => {
        logger.error(`SSE connection error: ${err.message}`, err);
        const idx = clients.findIndex(c => c.id === id);
        if (idx !== -1) {
            clients.splice(idx, 1);
        }
    });
});


/**
 * Run audits on an existing crawl session
 * Called when a user requests audits but the session doesn't have them
 */
async function runAuditsOnExistingSession(
    sessionId: number,
    device: 'mobile' | 'desktop',
    userId: number
): Promise<void> {
    const logger = Logger.getInstance();
    const db = getDatabase();

    try {
        logger.info(`Running audits on existing session ${sessionId}`, { userId, device });

        // Update session status to 'auditing'
        await db.updateCrawlSession(sessionId, { status: 'auditing' });

        // Notify user via SSE that audits are starting
        sendEvent({
            type: 'session-status-update',
            sessionId: sessionId,
            status: 'auditing',
            message: 'Running performance audits...'
        }, 'session-status-update', userId);

        // Get crawled URLs for auditing (all pages, not just successful ones)
        // Use a high limit to get all pages from the session
        const crawledPages = await db.getPages(sessionId, 100000, 0);
        const urlsToAudit = crawledPages
            // Filter to only HTML pages (not resources like CSS, JS, images)
            // Note: getPages() already returns only pages (not resources), but we filter by contentType as extra safety
            .filter(page => {
                const contentType = (page.contentType || '').toLowerCase();
                // Include HTML pages (text/html, application/xhtml+xml, etc.)
                return contentType.includes('text/html') ||
                    contentType.includes('application/xhtml') ||
                    contentType.includes('html') ||
                    // If contentType is missing/unknown, include it (likely HTML page)
                    (!contentType || contentType === 'unknown');
            })
            .map(page => page.url);

        if (urlsToAudit.length === 0) {
            logger.warn(`No valid URLs found for auditing in session ${sessionId}`);
            await db.updateCrawlSession(sessionId, { status: 'completed' });
            sendEvent({
                type: 'session-status-update',
                sessionId: sessionId,
                status: 'completed',
                message: 'No URLs to audit'
            }, 'session-status-update', userId);
            return;
        }

        const auditIntegration = new CrawlAuditIntegration(sessionId);

        // Use same batch processing logic as crawler.ts
        const totalUrls = urlsToAudit.length;
        let batchSize = 8;

        if (totalUrls > 50) {
            batchSize = 12;
        } else if (totalUrls > 20) {
            batchSize = 10;
        }

        const batches = [];
        for (let i = 0; i < urlsToAudit.length; i += batchSize) {
            batches.push(urlsToAudit.slice(i, i + batchSize));
        }

        const startTime = Date.now();
        let completedAudits = 0;
        let successfulAudits = 0;

        logger.info(`Processing ${totalUrls} audits in ${batches.length} batches`, {
            sessionId,
            device,
            batchSize
        });

        // Process batches
        for (const batch of batches) {
            const batchPromises = batch.map(async (url) => {
                try {
                    // Notify audit start
                    sendEvent({ type: 'audit-start', url }, 'audit', userId);

                    // Run audit
                    const auditResult = await auditIntegration.runAuditForUrl(url, device);

                    completedAudits++;
                    if (auditResult.success) {
                        successfulAudits++;
                    }

                    // Notify audit completion
                    sendEvent({
                        type: 'audit-complete',
                        url,
                        success: auditResult.success,
                        lcp: auditResult.lcp,
                        tbt: auditResult.tbt,
                        cls: auditResult.cls,
                        performanceScore: auditResult.performanceScore
                    }, 'audit', userId);

                    // Send progress update
                    const progress = Math.round((completedAudits / totalUrls) * 100);
                    sendEvent({
                        type: 'audit-progress',
                        sessionId,
                        completed: completedAudits,
                        total: totalUrls,
                        progress,
                        successful: successfulAudits
                    }, 'audit', userId);

                    return { url, success: auditResult.success };
                } catch (error) {
                    logger.error(`Audit failed for ${url}`, error as Error);
                    completedAudits++;

                    sendEvent({
                        type: 'audit-complete',
                        url,
                        success: false,
                        error: (error as Error).message
                    }, 'audit', userId);

                    return { url, success: false };
                }
            });

            await Promise.all(batchPromises);

            // Small delay between batches
            if (batches.indexOf(batch) < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        // Update session status to completed
        await db.updateCrawlSession(sessionId, { status: 'completed' });

        const duration = Date.now() - startTime;

        // Send completion event
        sendEvent({
            type: 'session-status-update',
            sessionId: sessionId,
            status: 'completed',
            message: `Audits completed: ${successfulAudits}/${totalUrls} successful`
        }, 'session-status-update', userId);

        logger.info(`Audits completed for session ${sessionId}`, {
            totalUrls,
            successfulAudits,
            failedAudits: totalUrls - successfulAudits,
            duration: `${duration}ms`
        });

        // Track audit usage
        try {
            await db.recordUserUsage(userId, 'audit', successfulAudits);
            logger.info('Audit usage tracked', { userId, count: successfulAudits });
        } catch (error) {
            logger.error('Failed to track audit usage', error as Error);
        }

        // Send email notification if enabled
        try {
            const user = await db.getUserById(userId);
            const userSettings = await db.getUserSettings(userId);
            if (user && userSettings?.emailNotifications) {
                const session = await db.getCrawlSession(sessionId);
                if (session) {
                    await mailer.send(
                        `Performance Audits Completed: ${session.startUrl}`,
                        `Hello ${user.name || user.email},\n\n🎉 Performance audits have been completed!\n\nURL: ${session.startUrl}\nTotal Pages: ${session.totalPages}\nAudits Completed: ${successfulAudits}/${totalUrls}\nDuration: ${Math.round(duration / 1000)}s\nCompleted: ${new Date().toLocaleString()}\n\nView your results in the dashboard: ${process.env.APP_URL || 'http://localhost:3004'}\n\nBest regards,\nContentlytics Team`,
                        undefined,
                        user.email
                    );
                }
            }
        } catch (error) {
            logger.error('Failed to send audit completion email', error as Error);
        }

    } catch (error) {
        logger.error(`Failed to run audits on session ${sessionId}`, error as Error);

        // Update session status back to completed (even on error)
        await db.updateCrawlSession(sessionId, { status: 'completed' });

        // Notify user of error
        sendEvent({
            type: 'session-status-update',
            sessionId: sessionId,
            status: 'completed',
            error: (error as Error).message,
            message: 'Audit execution failed'
        }, 'session-status-update', userId);
    }
}

app.post('/api/crawl',
    authenticateUser,              // Require authentication
    checkUsageLimit('crawl'),      // Check daily usage limit
    async (req, res) => {
        const { url, allowSubdomains, maxConcurrency, mode, runAudits, auditDevice, captureLinkDetails, forceRecrawl } = req.body ?? {};
        if (!url) return res.status(400).json({ error: 'url is required' });

        // Normalize and validate URL input
        const normalizeUrlInput = (input: string): string => {
            const trimmed = String(input).trim();
            if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
            return trimmed;
        };

        const safeUrl = normalizeUrlInput(url);
        try {
            // Validate
            // eslint-disable-next-line no-new
            new URL(safeUrl);
        } catch {
            return res.status(400).json({ error: 'Invalid URL. Please include a valid domain (e.g. https://example.com)' });
        }

        const userId = req.user!.userId; // Get authenticated user ID

        // Check if a completed session already exists for this URL (unless forceRecrawl)
        let existingSession = null;
        try {
            const db = getDatabase();
            if (!forceRecrawl) {
                existingSession = await db.getSessionByUrl(safeUrl, userId);
            }

            if (existingSession) {
                // Don't share session yet - only share when user clicks "View previous results"
                // This prevents adding sessions to history if user cancels the modal

                // Check if audits are requested
                if (runAudits) {
                    // Check if session has audits for the requested device
                    const requestedDevice = auditDevice === 'mobile' ? 'mobile' : 'desktop';
                    const hasAudits = await db.hasAuditsForSession(existingSession.id); // Note: hasAuditsForSession currently doesn't take device in my repository, I should probably check that

                    // Re-fetch session to get current status (avoid race condition)
                    // This ensures we see the latest status even if another user just triggered audits
                    const currentSession = await db.getCrawlSession(existingSession.id);
                    const isAuditing = currentSession?.status === 'auditing';

                    // Check if audits exist for ANY device (to detect if audits are running for a different device)
                    const hasAnyAudits = await db.hasAuditsForSession(existingSession.id);

                    if (hasAudits) {
                        // Audits already exist for this device, reuse normally
                        logger.info('Session reused with existing audits', {
                            sessionId: existingSession.id,
                            userId,
                            device: requestedDevice,
                            url: safeUrl
                        });
                    } else if (isAuditing && hasAnyAudits) {
                        // Status is 'auditing' AND audits exist for other devices
                        // This means audits are running for a DIFFERENT device
                        // But double-check to ensure audits don't exist for requested device (race condition prevention)
                        const finalCheck = await db.hasAuditsForSession(existingSession.id);
                        if (finalCheck) {
                            // Audits now exist for requested device (race condition: audits completed between checks)
                            logger.info('Session reused, audits now exist for requested device (race condition handled)', {
                                sessionId: existingSession.id,
                                userId,
                                device: requestedDevice,
                                url: safeUrl
                            });

                            return res.status(200).json({
                                ok: true,
                                reuseMode: true,
                                sessionId: existingSession.id,
                                url: safeUrl,
                                hasAudits: true,
                                message: `Reusing crawl data with existing audits`
                            });
                        }

                        // We can trigger audits for the requested device in parallel
                        logger.info('Session reused, audits running for different device, triggering audits for requested device', {
                            sessionId: existingSession.id,
                            userId,
                            device: requestedDevice,
                            url: safeUrl
                        });

                        // Run audits in background (non-blocking)
                        void runAuditsOnExistingSession(
                            existingSession.id,
                            requestedDevice,
                            userId
                        );

                        return res.status(200).json({
                            ok: true,
                            reuseMode: true,
                            sessionId: existingSession.id,
                            url: safeUrl,
                            auditsTriggered: true,
                            message: `Reusing crawl data. Running performance audits in the background...`
                        });
                    } else if (isAuditing && !hasAnyAudits) {
                        // Status is 'auditing' but NO audits exist yet
                        // This means audits were just triggered (< 1 second ago)
                        // Wait a moment, then check if audits exist for requested device
                        // If they exist, they're for the requested device (don't trigger duplicate)
                        // If they don't exist, they're for a different device (can trigger)

                        // Small delay to allow first audit result to be saved
                        await new Promise(resolve => setTimeout(resolve, 1500));

                        // Re-check after delay
                        const refreshedSession = await db.getCrawlSession(existingSession.id);
                        const refreshedHasAudits = await db.hasAuditsForSession(existingSession.id);
                        const refreshedHasAnyAudits = await db.hasAuditsForSession(existingSession.id);
                        const stillAuditing = refreshedSession?.status === 'auditing';

                        if (refreshedHasAudits) {
                            // Audits now exist for requested device - they were for this device
                            logger.info('Session reused, audits confirmed for requested device', {
                                sessionId: existingSession.id,
                                userId,
                                device: requestedDevice,
                                url: safeUrl
                            });

                            return res.status(200).json({
                                ok: true,
                                reuseMode: true,
                                sessionId: existingSession.id,
                                url: safeUrl,
                                auditsInProgress: true,
                                message: `Reusing crawl data. Audits are already running for this device...`
                            });
                        } else if (stillAuditing && refreshedHasAnyAudits) {
                            // Still auditing, but audits exist for OTHER devices
                            // Safe to trigger for requested device
                            logger.info('Session reused, audits running for different device (confirmed), triggering for requested device', {
                                sessionId: existingSession.id,
                                userId,
                                device: requestedDevice,
                                url: safeUrl
                            });

                            void runAuditsOnExistingSession(
                                existingSession.id,
                                requestedDevice,
                                userId
                            );

                            return res.status(200).json({
                                ok: true,
                                reuseMode: true,
                                sessionId: existingSession.id,
                                url: safeUrl,
                                auditsTriggered: true,
                                message: `Reusing crawl data. Running performance audits in the background...`
                            });
                        } else if (!stillAuditing) {
                            // Auditing completed while we waited, check if audits exist now
                            const finalHasAudits = await db.hasAuditsForSession(existingSession.id);
                            if (finalHasAudits) {
                                logger.info('Session reused, audits completed for requested device', {
                                    sessionId: existingSession.id,
                                    userId,
                                    device: requestedDevice,
                                    url: safeUrl
                                });
                            } else {
                                // Completed but no audits for requested device - trigger
                                logger.info('Session reused, audits completed for different device, triggering for requested device', {
                                    sessionId: existingSession.id,
                                    userId,
                                    device: requestedDevice,
                                    url: safeUrl
                                });

                                void runAuditsOnExistingSession(
                                    existingSession.id,
                                    requestedDevice,
                                    userId
                                );

                                return res.status(200).json({
                                    ok: true,
                                    reuseMode: true,
                                    sessionId: existingSession.id,
                                    url: safeUrl,
                                    auditsTriggered: true,
                                    message: `Reusing crawl data. Running performance audits in the background...`
                                });
                            }
                        } else {
                            // Still auditing, no audits yet - assume they're for requested device (safe default)
                            logger.info('Session reused, audits just started (uncertain device), waiting', {
                                sessionId: existingSession.id,
                                userId,
                                device: requestedDevice,
                                url: safeUrl
                            });

                            return res.status(200).json({
                                ok: true,
                                reuseMode: true,
                                sessionId: existingSession.id,
                                url: safeUrl,
                                auditsInProgress: true,
                                message: `Reusing crawl data. Audits are already running for this session...`
                            });
                        }
                    } else {
                        // !hasAudits && !isAuditing
                        // Session exists but doesn't have audits and not currently auditing
                        // But double-check status one more time to prevent race condition with concurrent requests
                        const finalStatusCheck = await db.getCrawlSession(existingSession.id);
                        const finalIsAuditing = finalStatusCheck?.status === 'auditing';
                        const finalHasAudits = await db.hasAuditsForSession(existingSession.id);

                        if (finalHasAudits) {
                            // Audits now exist (race condition: another request completed audits)
                            logger.info('Session reused, audits now exist (race condition handled)', {
                                sessionId: existingSession.id,
                                userId,
                                device: requestedDevice,
                                url: safeUrl
                            });

                            return res.status(200).json({
                                ok: true,
                                reuseMode: true,
                                sessionId: existingSession.id,
                                url: safeUrl,
                                hasAudits: true,
                                message: `Reusing crawl data with existing audits`
                            });
                        } else if (finalIsAuditing) {
                            // Audits just started (race condition: another request triggered audits)
                            logger.info('Session reused, audits just started by another request (race condition handled)', {
                                sessionId: existingSession.id,
                                userId,
                                device: requestedDevice,
                                url: safeUrl
                            });

                            return res.status(200).json({
                                ok: true,
                                reuseMode: true,
                                sessionId: existingSession.id,
                                url: safeUrl,
                                auditsInProgress: true,
                                message: `Reusing crawl data. Audits are already running for this session...`
                            });
                        }

                        // Safe to trigger audits
                        logger.info('Session reused but audits missing, triggering audits', {
                            sessionId: existingSession.id,
                            userId,
                            device: requestedDevice,
                            url: safeUrl
                        });

                        // Run audits in background (non-blocking)
                        void runAuditsOnExistingSession(
                            existingSession.id,
                            requestedDevice,
                            userId
                        );

                        return res.status(200).json({
                            ok: true,
                            reuseMode: true,
                            sessionId: existingSession.id,
                            url: safeUrl,
                            auditsTriggered: true,
                            message: `Reusing crawl data. Running performance audits in the background...`
                        });
                    }
                }

                // Normal reuse (no audits requested OR audits already exist)
                logger.info('Session reused', {
                    sessionId: existingSession.id,
                    userId,
                    url: safeUrl,
                    hasAudits: runAudits ? true : undefined
                });

                return res.status(200).json({
                    ok: true,
                    reuseMode: true,
                    sessionId: existingSession.id,
                    url: safeUrl,
                    hasAudits: runAudits ? true : undefined,
                    message: `Reusing crawl data from ${existingSession.completedAt ? new Date(existingSession.completedAt).toLocaleString() : 'earlier'}`
                });
            }
        } catch (e) {
            logger.warn('Failed to check for existing session', e as Error);
        }

        // Block manual crawl if the same URL is already running FOR THIS USER
        try {
            const db = getDatabase();
            // Check if THIS USER already has a running crawl for this URL
            const running = await db.getRunningSessionByUrl(safeUrl, userId);
            if (running) {
                return res.status(409).json({
                    error: 'You already have a crawl running for this URL',
                    message: 'Please wait for your current crawl to complete before starting a new one',
                    runningSession: { id: running.id, startedAt: running.startedAt },
                });
            }
        } catch (e) {
            logger.warn('Failed to check running session before manual crawl', e as Error);
        }

        // Create session ID immediately for better synchronization
        let sessionId: number | null = null;
        try {
            const db = getDatabase();
            sessionId = await db.createCrawlSession({
                startUrl: safeUrl,
                allowSubdomains: Boolean(allowSubdomains),
                maxConcurrency: 150, // Default for background crawl
                mode: 'html',
                userId: userId,
                startedAt: new Date().toISOString(),
                totalPages: 0,
                totalResources: 0,
                duration: 0,
                status: 'running'
            });
            logger.info(`Session created early for manual crawl: ${sessionId}`, { userId, url: safeUrl });
        } catch (e) {
            logger.warn('Failed to create session early', e as Error);
        }

        const requestId = `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        logger.info('Crawl request received', { url: safeUrl, userId, allowSubdomains, maxConcurrency, mode, sessionId }, requestId);

        res.json({ ok: true, requestId, url: safeUrl, sessionId });

        // Update health checker
        healthChecker.recordCrawlStart();
        healthChecker.setActiveCrawls(1);

        // Kick off crawl in background
        let finalSessionId = sessionId;
        void (async () => {
            const startTime = Date.now();
            const db = getDatabase();
            let auditStartTime: number | null = null;
            let finalEmailSent = false; // Flag to prevent multiple emails
            const logBuffer: string[] = [];

            const initialMsg = `Starting crawl: ${url}`;
            sendEvent({ type: 'log', message: initialMsg }, 'log', userId);
            logBuffer.push(initialMsg);

            // Send email notification for crawl start (if user has notifications enabled)
            try {
                const user = await db.getUserById(userId);
                const userSettings = await db.getUserSettings(userId);
                if (user && userSettings?.emailNotifications) {
                    await mailer.send(
                        `Crawl Started: ${safeUrl}`,
                        `Hello ${user.name || user.email},\n\nYour crawl has started!\n\nURL: ${safeUrl}\nStarted: ${new Date().toLocaleString()}\nRun Audits: ${runAudits ? 'Yes' : 'No'}\n\nYou'll receive another email when the crawl completes.\n\nBest regards,\nContentlytics Team`,
                        undefined,
                        user.email
                    );
                }
            } catch (error) {
                logger.error('Failed to send crawl start email', error as Error);
            }

            try {
                await runCrawl({
                    startUrl: safeUrl,
                    allowSubdomains: true,
                    maxConcurrency: 150,
                    perHostDelayMs: Number(process.env.CRAWL_PER_HOST_DELAY_MS) || 150,
                    denyParamPrefixes: (process.env.DENY_PARAMS || 'utm_,session,sort,filter,ref,fbclid,gclid')
                        .split(',')
                        .map((s) => s.trim().toLowerCase())
                        .filter(Boolean),
                    mode: 'html',
                    userId: userId,
                    runAudits: Boolean(runAudits),
                    auditDevice: auditDevice === 'mobile' ? 'mobile' : 'desktop',
                    captureLinkDetails: Boolean(captureLinkDetails),
                    sessionId: finalSessionId || undefined,
                }, {
                    onSessionStart: (id) => {
                        finalSessionId = id;
                        // Also log that we have the session ID now
                        if (finalSessionId) {
                            void db.logCrawlMessage(finalSessionId, `Session ID confirmed: ${finalSessionId}`, 'info').catch(() => { });

                            // Flush buffered logs
                            if (logBuffer.length > 0) {
                                for (const msg of logBuffer) {
                                    void db.logCrawlMessage(finalSessionId, msg, 'info').catch(() => { });
                                }
                                logBuffer.length = 0;
                            }
                        }
                    },
                    onLog: async (msg) => {
                        sendEvent({ type: 'log', message: msg }, 'log', userId);
                        logger.info(msg, {}, requestId);
                        if (finalSessionId) {
                            await db.logCrawlMessage(finalSessionId, msg, 'info').catch(err =>
                                logger.error('Failed to save crawl log', err as Error)
                            );
                        } else {
                            logBuffer.push(msg);
                        }
                    },
                    onPage: (urlFound) => {
                        sendEvent({ type: 'page', url: urlFound }, 'page', userId);
                        logger.debug('Page discovered', { url: urlFound }, requestId);
                    },
                    onDone: async (count) => {
                        const duration = Date.now() - startTime;
                        const durationSeconds = Math.max(1, Math.floor(duration / 1000));
                        const pagesPerSecond = parseFloat((count / (duration / 1000)).toFixed(2));

                        const eventData = {
                            type: 'done',
                            count: count,
                            duration: durationSeconds,
                            pagesPerSecond: pagesPerSecond
                        };

                        console.log('Sending done event:', eventData);
                        console.log('Duration calculation:', { startTime, currentTime: Date.now(), duration, durationSeconds, pagesPerSecond });
                        sendEvent(eventData, 'done', userId);

                        logger.info('Crawl completed', {
                            userId,
                            totalPages: count,
                            duration: `${duration}ms`,
                            pagesPerSecond: pagesPerSecond
                        }, requestId);

                        if (finalSessionId) {
                            await db.logCrawlMessage(finalSessionId, `Crawl completed. Discovered ${count} pages in ${durationSeconds}s.`, 'success').catch(e => e);
                        }

                        // Track user usage
                        try {
                            await db.recordUserUsage(userId, 'crawl', 1);
                            logger.info('User usage tracked', { userId, action: 'crawl' });
                        } catch (error) {
                            logger.error('Failed to track user usage', error as Error);
                        }

                        // Send email notification for crawl completion (if user has notifications enabled)
                        // Only send if no audits are enabled - otherwise wait for all audits to complete
                        try {
                            const user = await db.getUserById(userId);
                            const userSettings = await db.getUserSettings(userId);
                            if (user && userSettings?.emailNotifications && !runAudits) {
                                // Only send email if audits are disabled
                                await mailer.send(
                                    `Crawl Completed: ${safeUrl}`,
                                    `Hello ${user.name || user.email},\n\nYour crawl has completed successfully! 🎉\n\nURL: ${safeUrl}\nTotal Pages: ${count}\nDuration: ${durationSeconds}s\nSpeed: ${pagesPerSecond} pages/second\nCompleted: ${new Date().toLocaleString()}\n\nView your results in the dashboard: ${process.env.APP_URL || 'http://localhost:3004'}\n\nBest regards,\nContentlytics Team`,
                                    undefined,
                                    user.email
                                );
                            }
                        } catch (error) {
                            logger.error('Failed to send crawl completion email', error as Error);
                        }

                        // Update health checker
                        healthChecker.setActiveCrawls(0);

                        // Send real-time status update if audits are running
                        if (runAudits && finalSessionId) {
                            sendEvent({
                                type: 'session-status-update',
                                sessionId: finalSessionId,
                                status: 'auditing'
                            }, 'session-status-update', userId);
                        }
                    },
                    onAuditStart: async (url) => {
                        // Track when audits actually start
                        if (!auditStartTime) {
                            auditStartTime = Date.now();
                        }
                        sendEvent({ type: 'audit-start', url }, 'audit', userId);
                        logger.info(`Starting audit for ${url}`, {}, requestId);
                        if (finalSessionId) {
                            await db.logCrawlMessage(finalSessionId, `Starting audit for ${url}`, 'info').catch(e => e);
                        }
                    },
                    onAuditComplete: async (url, success, lcp, tbt, cls, performanceScore) => {
                        sendEvent({
                            type: 'audit-complete',
                            url,
                            success,
                            lcp,
                            tbt,
                            cls,
                            performanceScore
                        }, 'audit', userId);
                        const msg = `Audit completed for ${url} (Score: ${performanceScore || 'N/A'}, LCP: ${lcp ? Math.round(lcp) : 'N/A'}ms)`;
                        logger.info(msg, { success, lcp, tbt, cls, performanceScore }, requestId);

                        if (finalSessionId) {
                            await db.logCrawlMessage(finalSessionId, msg, success ? 'info' : 'error').catch(e => e);
                        }

                        // Check if all audits are now complete and send final email
                        if (runAudits && finalSessionId) {
                            try {
                                const sessionId = finalSessionId;
                                const auditProgress = await db.getAuditProgressBySession(sessionId);
                                const allAuditsComplete = auditProgress.total > 0 && auditProgress.completed >= auditProgress.total;

                                // Check if audits have been running too long (timeout after 30 minutes)
                                // Use actual audit start time, not session start time
                                const auditTimeout = 30 * 60 * 1000; // 30 minutes
                                const hasTimedOut = auditStartTime ? (Date.now() - auditStartTime) > auditTimeout : false;

                                if ((allAuditsComplete || hasTimedOut) && !finalEmailSent) {
                                    // Update session status to truly completed (or timed out)
                                    await db.updateCrawlSession(sessionId, { status: 'completed' });

                                    // Send real-time status update via SSE
                                    sendEvent({
                                        type: 'session-status-update',
                                        sessionId: sessionId,
                                        status: 'completed'
                                    }, 'session-status-update', userId);

                                    // Mark email as sent to prevent duplicates
                                    finalEmailSent = true;

                                    const user = await db.getUserById(userId);
                                    const userSettings = await db.getUserSettings(userId);

                                    if (user && userSettings?.emailNotifications) {
                                        // Get crawl stats from the session (it already has updated values)
                                        const latestSession = await db.getCrawlSession(sessionId);
                                        const totalPages = latestSession?.totalPages || 0;
                                        const totalResources = latestSession?.totalResources || 0;
                                        const duration = latestSession?.duration || 0;
                                        const pagesPerSecond = duration > 0 && totalPages > 0 ? (totalPages / duration).toFixed(2) : '0';

                                        const emailSubject = hasTimedOut
                                            ? `Crawl Completed (Audits Partial): ${safeUrl}`
                                            : `Crawl & Audits Completed: ${safeUrl}`;

                                        const emailBody = hasTimedOut
                                            ? `Hello ${user.name || user.email},\n\nYour crawl has completed! ⚠️\n\nURL: ${safeUrl}\nTotal Pages: ${totalPages}\nDuration: ${duration}s\nSpeed: ${pagesPerSecond} pages/second\nCompleted: ${new Date().toLocaleString()}\n\nNote: Some performance audits may not have completed due to timeout (30 minutes).\n\nView your results in the dashboard: ${process.env.APP_URL || 'http://localhost:3004'}\n\nBest regards,\nContentlytics Team`
                                            : `Hello ${user.name || user.email},\n\n🎉 Your crawl and performance audits have been completed successfully!\n\nURL: ${safeUrl}\nTotal Pages: ${totalPages}\nDuration: ${duration}s\nSpeed: ${pagesPerSecond} pages/second\nCompleted: ${new Date().toLocaleString()}\n\nYour crawl and performance analysis are now fully complete.\n\nView your results in the dashboard: ${process.env.APP_URL || 'http://localhost:3004'}\n\nBest regards,\nContentlytics Team`;

                                        await mailer.send(emailSubject, emailBody, undefined, user.email);
                                        logger.info('Final crawl and audit completion email sent', { userId, sessionId }, requestId);
                                    }
                                }
                            } catch (error) {
                                logger.error('Failed to send final audit completion email', error as Error, {}, requestId);
                            }
                        }
                    },
                    onAuditResults: async (results) => {
                        logger.info('All audit results received', { count: results.length }, requestId);
                    },
                    onAuditsComplete: async () => {
                        // This is called after ALL audits have completed
                        if (finalSessionId && !finalEmailSent) {
                            try {
                                // Update session status to completed
                                await db.updateCrawlSession(finalSessionId, { status: 'completed' });

                                // Send real-time status update via SSE
                                sendEvent({
                                    type: 'session-status-update',
                                    sessionId: finalSessionId,
                                    status: 'completed'
                                }, 'session-status-update', userId);

                                // Mark email as sent to prevent duplicates
                                finalEmailSent = true;

                                // Send completion email
                                const user = await db.getUserById(userId);
                                const userSettings = await db.getUserSettings(userId);

                                if (user && userSettings?.emailNotifications) {
                                    const latestSession = await db.getCrawlSession(finalSessionId);
                                    const totalPages = latestSession?.totalPages || 0;
                                    const totalResources = latestSession?.totalResources || 0;
                                    const durationSeconds = latestSession?.duration || 0;
                                    const auditDuration = auditStartTime ? Math.round((Date.now() - auditStartTime) / 1000) : 0;

                                    await mailer.send(
                                        `Crawl & Audits Completed: ${safeUrl}`,
                                        `Hello ${user.name || user.email},\n\nYour crawl and audits have completed successfully! 🎉\n\nURL: ${safeUrl}\nTotal Pages: ${totalPages}\nTotal Resources: ${totalResources}\nCrawl Duration: ${durationSeconds}s\nAudit Duration: ${auditDuration}s\nCompleted: ${new Date().toLocaleString()}\n\nView your results in the dashboard: ${process.env.APP_URL || 'http://localhost:3004'}\n\nBest regards,\nContentlytics Team`,
                                        undefined,
                                        user.email
                                    );
                                }

                                logger.info('All audits completed, session status updated', { sessionId: finalSessionId });
                            } catch (error) {
                                logger.error('Failed to handle audit completion', error as Error);
                            }
                        }
                    },
                }, metricsCollector);
            } catch (e) {
                const error = e as Error;
                const duration = Date.now() - startTime;
                const durationSeconds = Math.floor(duration / 1000);
                sendEvent({ type: 'log', message: `Error: ${error.message}` }, 'log', userId);
                logger.error('Crawl failed', error, { duration: `${duration}ms` }, requestId);
                healthChecker.recordError(error.message);
                healthChecker.setActiveCrawls(0);

                // Send email notification for crawl failure (if user has notifications enabled)
                try {
                    const user = await db.getUserById(userId);
                    const userSettings = await db.getUserSettings(userId);
                    if (user && userSettings?.emailNotifications) {
                        await mailer.send(
                            `Crawl Failed: ${safeUrl}`,
                            `Hello ${user.name || user.email},\n\nYour crawl encountered an error and could not complete. ⚠️\n\nURL: ${safeUrl}\nError: ${error.message}\nDuration: ${durationSeconds}s\nFailed: ${new Date().toLocaleString()}\n\nPlease try again or contact support if the issue persists.\n\nBest regards,\nContentlytics Team`,
                            undefined,
                            user.email
                        );
                    }
                } catch (emailError) {
                    logger.error('Failed to send crawl failure email', emailError as Error);
                }
            }
        })();
    });

// Initialize scheduler service
const schedulerService = new SchedulerService({
    checkIntervalMs: 60000, // Check every minute
    maxConcurrentRuns: 3,
    retryFailedSchedules: true,
    retryDelayMs: 300000 // 5 minutes
});

// ====================================
// Global Error Handling Middleware
// ====================================
// This must be defined AFTER all routes but BEFORE server.listen

// 404 handler for undefined routes
app.use((req: express.Request, res: express.Response) => {
    logger.warn(`404 Not Found: ${req.method} ${req.url}`, { ip: req.ip });
    res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.url}`
    });
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
});

// ====================================
// Start Server
// ====================================

// ==================== Initialization State Management ====================
let serverInitializationComplete = false;
let isShuttingDown = false;
const initStartTime = Date.now();

console.log('[INIT DEBUG] Server initialization starting...');

const port = Number(process.env.PORT) || 3004;
const server = app.listen(port, () => {
    const initDuration = Date.now() - initStartTime;
    console.log(`[INIT DEBUG] Server listening callback triggered after ${initDuration}ms`);
    logger.info(`Server started`, { port, environment: process.env.NODE_ENV || 'development' });
    console.log(`Server listening on http://localhost:${port}`);
    console.log(`Health check: http://localhost:${port}/api/health`);
    console.log(`Metrics: http://localhost:${port}/api/metrics`);
    console.log(`Logs: http://localhost:${port}/api/logs`);

    // Start scheduler service
    console.log('[INIT DEBUG] Starting scheduler service...');
    schedulerService.start();
    console.log('[INIT DEBUG] Scheduler service started');

    // Start audit integration
    console.log('[INIT DEBUG] Starting audit integration...');
    const auditIntegration = new AuditIntegration();
    auditIntegration.start();
    console.log('[INIT DEBUG] Audit integration started');

    // Mark initialization as complete AFTER all services are started
    serverInitializationComplete = true;
    const totalInitTime = Date.now() - initStartTime;
    console.log(`[INIT DEBUG] ✅ Server initialization COMPLETE (${totalInitTime}ms)`);
    logger.info('Server initialization complete - ready to accept requests', { duration: `${totalInitTime}ms` });
});

// Error handling
server.on('error', (error) => {
    if ((error as any).code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`, error as Error);
        console.error(`Error: Port ${port} is already in use. Please free the port or change PORT environment variable.`);
        process.exit(1);
    } else {
        logger.error('Server error', error as Error);
        console.error('Server error:', error);
    }
});

// Listen for unexpected process exits from child processes
process.on('exit', (code) => {
    console.log(`[DEBUG] Process exit event fired with code: ${code}, serverInitComplete: ${serverInitializationComplete}, isShuttingDown: ${isShuttingDown}`);
});

// ==================== Graceful Shutdown with Debug Logging ====================
process.on('SIGINT', () => {
    console.log(`[SHUTDOWN DEBUG] SIGINT received. InitComplete: ${serverInitializationComplete}, Shutting down: ${isShuttingDown}`);

    // Prevent multiple shutdown attempts
    if (isShuttingDown) {
        console.log('[SHUTDOWN DEBUG] Already shutting down, ignoring SIGINT');
        return;
    }

    // Prevent shutdown during initialization
    if (!serverInitializationComplete) {
        console.log('[SHUTDOWN DEBUG] Initialization not complete yet, ignoring SIGINT (likely from child process)');
        logger.warn('SIGINT received during initialization - ignored (child process signal)');
        return;
    }

    isShuttingDown = true;
    console.log('[SHUTDOWN DEBUG] Starting graceful shutdown sequence...');
    logger.info('Graceful shutdown initiated via SIGINT');

    console.log('[SHUTDOWN DEBUG] Stopping scheduler service...');
    schedulerService.stop();

    console.log('[SHUTDOWN DEBUG] Closing all SSE client connections...');
    // Close all SSE client connections
    for (const client of clients) {
        try {
            client.res.end();
        } catch (err) {
            console.log('[SHUTDOWN DEBUG] Error closing SSE client:', err);
        }
    }
    clients.length = 0; // Clear the clients array

    console.log('[SHUTDOWN DEBUG] Closing HTTP server...');
    server.close(() => {
        console.log('[SHUTDOWN DEBUG] ✅ HTTP server closed');
        logger.info('HTTP server closed gracefully');
        console.log('[SHUTDOWN DEBUG] Exiting process...');
        process.exit(0);
    });

    // Force exit after 15 seconds if graceful shutdown doesn't work
    const shutdownTimeout = setTimeout(() => {
        console.error('[SHUTDOWN DEBUG] Graceful shutdown timeout, forcing exit...');
        logger.error('Graceful shutdown timeout - forcing process exit');
        console.log('[SHUTDOWN DEBUG] Active connections still open, destroying them...');
        process.exit(1);
    }, 15000);

    // Make timeout unreferable so it doesn't keep process alive
    shutdownTimeout.unref();
});

process.on('SIGTERM', () => {
    console.log(`[SHUTDOWN DEBUG] SIGTERM received. InitComplete: ${serverInitializationComplete}, Shutting down: ${isShuttingDown}`);

    // Prevent multiple shutdown attempts
    if (isShuttingDown) {
        console.log('[SHUTDOWN DEBUG] Already shutting down, ignoring SIGTERM');
        return;
    }

    // Prevent shutdown during initialization
    if (!serverInitializationComplete) {
        console.log('[SHUTDOWN DEBUG] Initialization not complete yet, ignoring SIGTERM (likely from child process)');
        logger.warn('SIGTERM received during initialization - ignored (child process signal)');
        return;
    }

    isShuttingDown = true;
    console.log('[SHUTDOWN DEBUG] Starting graceful shutdown sequence...');
    logger.info('Graceful shutdown initiated via SIGTERM');

    console.log('[SHUTDOWN DEBUG] Stopping scheduler service...');
    schedulerService.stop();

    console.log('[SHUTDOWN DEBUG] Closing all SSE client connections...');
    // Close all SSE client connections
    for (const client of clients) {
        try {
            client.res.end();
        } catch (err) {
            console.log('[SHUTDOWN DEBUG] Error closing SSE client:', err);
        }
    }
    clients.length = 0; // Clear the clients array

    console.log('[SHUTDOWN DEBUG] Closing HTTP server...');
    server.close(() => {
        console.log('[SHUTDOWN DEBUG] ✅ HTTP server closed');
        logger.info('HTTP server closed gracefully');
        console.log('[SHUTDOWN DEBUG] Exiting process...');
        process.exit(0);
    });

    // Force exit after 15 seconds if graceful shutdown doesn't work
    const shutdownTimeout = setTimeout(() => {
        console.error('[SHUTDOWN DEBUG] Graceful shutdown timeout, forcing exit...');
        logger.error('Graceful shutdown timeout - forcing process exit');
        console.log('[SHUTDOWN DEBUG] Active connections still open, destroying them...');
        process.exit(1);
    }, 15000);

    // Make timeout unreferable so it doesn't keep process alive
    shutdownTimeout.unref();
});

// Log any uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('[ERROR DEBUG] Uncaught exception:', error);
    logger.error('Uncaught exception', error);
    if (!isShuttingDown) {
        isShuttingDown = true;
        process.exit(1);
    }
});

// Log any unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERROR DEBUG] Unhandled rejection:', reason, 'Promise:', promise);
    logger.error('Unhandled promise rejection', new Error(String(reason)));
});



/**
 * Module A: Crawling Routes
 * Handles main crawl endpoint with session reuse logic, audit triggering, and background execution
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../../services/DatabaseService.js';
import { runCrawl } from '../../crawler.js';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { checkUsageLimit } from '../../middleware/authMiddleware.js';
import { Logger } from '../../helpers/logging/Logger.js';
import { sendEvent } from '../../services/SSEService.js';
import { runAuditsOnExistingSession } from '../../services/module_A/AuditHelper.js';
import { processExistingSessionData } from '../../crawlers/core/postProcessor.js';
import { Mailer } from '../../utils/Mailer.js';
import { healthChecker, metricsCollector } from '../module_D/index.js';

const router = Router();
const logger = Logger.getInstance();
const mailer = Mailer.getInstance();

/**
 * Main crawl endpoint
 * Handles URL validation, session reuse, audit triggering, and background crawl execution
 * POST /api/crawl
 */
router.post('/crawl',
    authenticateUser,              // Require authentication
    checkUsageLimit('crawl'),      // Check daily usage limit
    async (req: Request, res: Response) => {
        const { url, projectId, allowSubdomains, maxConcurrency, mode, runAudits, auditDevice, captureLinkDetails, forceRecrawl } = req.body ?? {};
        if (!url) return res.status(400).json({ error: 'url is required', message: 'Please enter a URL to analyze.' });
        if (!projectId) return res.status(400).json({ error: 'projectId is required', message: 'Please select a project.' });

        const userId = req.user!.userId; // Get authenticated user ID

        // Verify project ownership
        try {
            const db = getDatabase();
            const project = await db.getProject(projectId, userId);
            if (!project) {
                return res.status(404).json({ error: 'Project not found', message: 'The specified project does not exist or you do not have access to it.' });
            }
        } catch (error) {
            logger.error('Failed to verify project ownership', error as Error);
            return res.status(500).json({ error: 'Failed to verify project', message: 'An error occurred while verifying the project.' });
        }

        // When forceRecrawl is true, log it to help debug any issues
        if (forceRecrawl) {
            logger.info('Force recrawl requested - will create completely new session and ignore all previous sessions', { url, userId, projectId });
        }

        // Normalize and validate URL input
        const normalizeUrlInput = (input: string): string => {
            const trimmed = String(input).trim();
            if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
            return trimmed;
        };

        const safeUrl = normalizeUrlInput(url);
        try {
            // Validate URL format
            // eslint-disable-next-line no-new
            new URL(safeUrl);
        } catch {
            return res.status(400).json({ error: 'Invalid URL. Please include a valid domain (e.g. https://example.com)', message: 'Invalid URL. Please include a valid domain (e.g. https://example.com).' });
        }

        // Verify the website exists and is reachable before creating any session
        const URL_REACHABILITY_TIMEOUT_MS = 12000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), URL_REACHABILITY_TIMEOUT_MS);
        try {
            const headResponse = await fetch(safeUrl, {
                method: 'HEAD',
                signal: controller.signal,
                redirect: 'follow',
                headers: { 'User-Agent': 'Contentlytics-Crawler/1.0 (URL validation)' },
            });
            clearTimeout(timeoutId);
            if (!headResponse.ok && headResponse.status !== 405) {
                const getController = new AbortController();
                const getTimeoutId = setTimeout(() => getController.abort(), URL_REACHABILITY_TIMEOUT_MS);
                const getResponse = await fetch(safeUrl, {
                    method: 'GET',
                    signal: getController.signal,
                    redirect: 'follow',
                    headers: { 'User-Agent': 'Contentlytics-Crawler/1.0 (URL validation)' },
                }).catch(() => null);
                clearTimeout(getTimeoutId);
                if (!getResponse?.ok) {
                    return res.status(400).json({
                        error: 'URL is not reachable',
                        message: `The website at ${safeUrl} could not be reached (HTTP ${headResponse.status}). Please check that the URL is correct and the website is online.`,
                    });
                }
            }
        } catch (reachError: any) {
            clearTimeout(timeoutId);
            const isAbort = reachError?.name === 'AbortError';
            const msg = isAbort
                ? `The website at ${safeUrl} did not respond in time. Please check that the URL is correct and the website is online.`
                : `The website at ${safeUrl} could not be reached. Please check that the URL is correct and the website exists (e.g. DNS or connection error).`;
            logger.warn('URL reachability check failed', { url: safeUrl, error: reachError?.message });
            return res.status(400).json({ error: 'URL is not reachable', message: msg });
        }

        // When forceRecrawl is true, mark any previous running or auditing session for the same URL as completed
        // This prevents the previous session from going into auditing or continuing to audit, avoiding conflicts with the new crawl
        if (forceRecrawl) {
            try {
                const db = getDatabase();
                // Check for running session
                const previousRunningSession = await db.getRunningSessionByUrl(safeUrl, userId);
                if (previousRunningSession) {
                    logger.info('Force recrawl: Marking previous running session as completed to prevent conflicts', {
                        previousSessionId: previousRunningSession.id,
                        url: safeUrl,
                        userId
                    });
                    // Mark the previous session as completed (without audits) to prevent it from going into auditing
                    await db.updateCrawlSession(previousRunningSession.id, {
                        status: 'completed',
                        completedAt: new Date().toISOString()
                    });
                }
                
                // Also check for any session in auditing status for the same URL
                // This handles the case where a previous session is already auditing
                const latestSession = await db.getLatestSessionByUrl(safeUrl, userId);
                if (latestSession && latestSession.status === 'auditing') {
                    logger.info('Force recrawl: Marking previous auditing session as completed to prevent conflicts', {
                        previousSessionId: latestSession.id,
                        url: safeUrl,
                        userId
                    });
                    // Mark the auditing session as completed to stop it from continuing
                    await db.updateCrawlSession(latestSession.id, {
                        status: 'completed',
                        completedAt: new Date().toISOString()
                    });
                }
            } catch (e) {
                logger.warn('Failed to mark previous session as completed during force recrawl', e as Error);
                // Continue execution - don't block if this fails
            }
        }

        // Check if user already has ANY running crawl (regardless of URL)
        // This prevents multiple concurrent crawls for the same user
        // Skip this check when forceRecrawl is true to allow new crawl sessions
        if (!forceRecrawl) {
            try {
                const db = getDatabase();
                const anyRunningSession = await db.getAnyRunningSessionByUserId(userId);
                if (anyRunningSession) {
                    const statusText = anyRunningSession.status === 'auditing' ? 'auditing' : 'crawling';
                    return res.status(409).json({
                        error: `A crawl is already in progress`,
                        message: `You already have a crawl session in progress (${statusText}). Please wait for it to complete before starting a new one.`,
                        runningSession: {
                            id: anyRunningSession.id,
                            url: anyRunningSession.startUrl,
                            status: anyRunningSession.status,
                            startedAt: anyRunningSession.startedAt
                        }
                    });
                }
            } catch (e) {
                logger.warn('Failed to check for any running session', e as Error);
                // Continue execution - don't block if check fails
            }
        }

        // Check if a completed session already exists for this URL (unless forceRecrawl)
        // When forceRecrawl is true, completely skip this check to ensure previous sessions are never touched
        // IMPORTANT: When forceRecrawl is true, we must NEVER query for existing sessions to prevent
        // any possibility of finding and updating the previous session
        let existingSession: any = null;
        if (!forceRecrawl) {
            try {
                const db = getDatabase();
                existingSession = await db.getSessionByUrl(safeUrl, userId);
            } catch (e) {
                logger.warn('Failed to check for existing session', e as Error);
            }
        } else {
            // When forceRecrawl is true, explicitly ensure existingSession is null
            // This prevents any code path from accidentally using a previous session
            existingSession = null;
            logger.info('Force recrawl: explicitly setting existingSession to null to prevent any session reuse', { url: safeUrl, userId });
        }

        if (existingSession) {
            // Double-check: if forceRecrawl is true, we should never have an existingSession
            // This is a safety check to prevent any code path from accidentally using a previous session
            if (forceRecrawl) {
                const error = new Error('CRITICAL: existingSession found when forceRecrawl is true - this should never happen!');
                logger.error(error.message, error, { 
                    existingSessionId: existingSession.id, 
                    url: safeUrl, 
                    userId 
                });
                existingSession = null; // Force it to null to prevent any session reuse
            }
            
            // Never reuse cancelled sessions - they should always remain cancelled
            if (existingSession.status === 'cancelled') {
                logger.info('Skipping cancelled session - will create new session instead', {
                    cancelledSessionId: existingSession.id,
                    url: safeUrl,
                    userId
                });
                existingSession = null; // Force it to null to create a new session
            }
        }

        if (existingSession) {
            const db = getDatabase();
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

            // Process existing session data in background (SEO extraction, semantic analysis, link analysis, etc.)
            void processExistingSessionData(
                existingSession.id,
                safeUrl,
                Boolean(captureLinkDetails),
                Boolean(runAudits),
                (auditDevice === 'mobile' ? 'mobile' : 'desktop') as 'desktop' | 'mobile',
                {
                    onLog: (msg) => {
                        logger.info(`[Reuse Processing] ${msg}`);
                        sendEvent({ type: 'log', message: msg }, 'log', userId);
                    },
                    onPage: (url) => {
                        // Not needed for reuse, but keeping for compatibility
                    },
                    onDone: () => {
                        logger.info(`[Reuse Processing] Completed processing for session ${existingSession.id}`);
                    }
                }
            );

            return res.status(200).json({
                ok: true,
                reuseMode: true,
                sessionId: existingSession.id,
                url: safeUrl,
                hasAudits: runAudits ? true : undefined,
                message: `Reusing crawl data from ${existingSession.completedAt ? new Date(existingSession.completedAt).toLocaleString() : 'earlier'}. Processing existing data...`
            });
        }

        // Block manual crawl if the same URL is already running FOR THIS USER
        // Skip this check when forceRecrawl is true to allow new crawl sessions
        if (!forceRecrawl) {
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
        }

        // Create session ID immediately for better synchronization
        // When forceRecrawl is true, skip early session creation to ensure a completely fresh session
        let sessionId: number | null = null;
        if (!forceRecrawl) {
            try {
                const db = getDatabase();
                sessionId = await db.createCrawlSession({
                    projectId: projectId,
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
                logger.info(`Session created early for manual crawl: ${sessionId}`, { userId, projectId, url: safeUrl });
            } catch (e) {
                logger.warn('Failed to create session early', e as Error);
            }
        } else {
            logger.info('Skipping early session creation for forceRecrawl - will create fresh session in runCrawl', { userId, projectId, url: safeUrl });
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
                    projectId: projectId,
                    userId: userId,
                    runAudits: Boolean(runAudits),
                    auditDevice: auditDevice === 'mobile' ? 'mobile' : 'desktop',
                    captureLinkDetails: Boolean(captureLinkDetails),
                    // When forceRecrawl is true, don't pass sessionId to ensure a completely new session is created
                    // Otherwise, use the sessionId created early for better synchronization
                    sessionId: forceRecrawl ? undefined : (finalSessionId || undefined),
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

                            // Send session status update with sessionId for frontend tracking
                            sendEvent({
                                type: 'session-status-update',
                                sessionId: finalSessionId,
                                status: 'running',
                                message: `Crawl started for session ${finalSessionId}`
                            }, 'session-status-update', userId);
                        }
                    },
                    onLog: async (msg) => {
                        sendEvent({ type: 'log', message: msg }, 'log', userId);
                        logger.info(msg, {}, requestId);
                        if (finalSessionId) {
                            await db.logCrawlMessage(finalSessionId, msg, 'info').catch((err: Error) =>
                                logger.error('Failed to save crawl log', err)
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

                        // Get the actual status from the database (finalizeSession sets it correctly based on whether audits will actually run)
                        let nextStatus: 'auditing' | 'completed' = 'completed';
                        if (finalSessionId) {
                            const session = await db.getCrawlSession(finalSessionId);
                            nextStatus = (session?.status === 'auditing') ? 'auditing' : 'completed';
                        } else {
                            // Fallback: if no session ID yet, check if audits are enabled
                            nextStatus = runAudits ? 'auditing' : 'completed';
                        }

                        const eventData = {
                            type: 'done',
                            count: count,
                            duration: durationSeconds,
                            pagesPerSecond: pagesPerSecond,
                            status: nextStatus // Include status in done event
                        };

                        console.log('Sending done event:', eventData);
                        console.log('Duration calculation:', { startTime, currentTime: Date.now(), duration, durationSeconds, pagesPerSecond });
                        sendEvent(eventData, 'done', userId);

                        logger.info('Crawl completed', {
                            userId,
                            totalPages: count,
                            duration: `${duration}ms`,
                            pagesPerSecond: pagesPerSecond,
                            nextStatus
                        }, requestId);

                        if (finalSessionId) {
                            await db.logCrawlMessage(finalSessionId, `Crawl completed. Discovered ${count} pages in ${durationSeconds}s.`, 'success').catch((e: Error) => e);
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

                        // Send real-time status update - use the actual status from database
                        if (finalSessionId) {
                            const session = await db.getCrawlSession(finalSessionId);
                            const actualStatus = session?.status || 'completed';
                            
                            sendEvent({
                                type: 'session-status-update',
                                sessionId: finalSessionId,
                                status: actualStatus,
                                message: actualStatus === 'auditing' 
                                    ? 'Crawl completed. Starting performance audits...'
                                    : 'Crawl completed.'
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
                            await db.logCrawlMessage(finalSessionId, `Starting audit for ${url}`, 'info').catch((e: Error) => e);
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
                            await db.logCrawlMessage(finalSessionId, msg, success ? 'info' : 'error').catch((e: Error) => e);
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

/**
 * Trigger audits on an existing completed session
 * POST /api/crawl/:sessionId/run-audits
 */
router.post('/crawl/:sessionId/run-audits',
    authenticateUser,
    async (req: Request, res: Response) => {
        const sessionId = parseInt(req.params.sessionId);
        const { device } = req.body;
        const userId = req.user!.userId;

        if (isNaN(sessionId)) {
            return res.status(400).json({ error: 'Invalid session ID' });
        }

        if (!device || !['mobile', 'desktop'].includes(device)) {
            return res.status(400).json({ error: 'Device must be either "mobile" or "desktop"' });
        }

        try {
            const db = getDatabase();
            
            // Verify session exists and user has access
            const session = await db.getCrawlSession(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session not found' });
            }

            // Check ownership (admins can trigger audits on any session)
            if (session.userId !== userId && req.user!.role !== 'admin') {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Check if session is in a valid state for auditing
            if (session.status !== 'completed' && session.status !== 'auditing') {
                return res.status(400).json({ 
                    error: 'Session must be completed before running audits',
                    currentStatus: session.status 
                });
            }

            // Check if audits already exist for this device
            const hasAudits = await db.hasAuditsForSession(sessionId);
            if (hasAudits && session.status === 'completed') {
                logger.info('Audits already exist for session, re-running', { sessionId, device, userId });
            }

            // Trigger audits in background
            logger.info('Triggering audits for session', { sessionId, device, userId });
            
            // Run audits asynchronously
            void runAuditsOnExistingSession(sessionId, device as 'mobile' | 'desktop', userId);

            res.status(200).json({ 
                message: 'Audit started successfully',
                sessionId,
                device,
                status: 'auditing'
            });

        } catch (error) {
            logger.error('Failed to trigger audits', error as Error);
            res.status(500).json({ error: 'Failed to start audits' });
        }
    });

export default router;

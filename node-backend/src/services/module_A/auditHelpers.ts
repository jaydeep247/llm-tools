import { Logger } from '../../helpers/logging/Logger.js';
import { getDatabase } from '../../services/DatabaseService.js';
import { CrawlAuditIntegration } from '../../services/module_A/audits/CrawlAuditIntegration.js';
import { sendEvent } from '../SSEService.js';

const logger = Logger.getInstance();

/**
 * Run audits on an existing crawl session
 * Called when a user requests audits but the session doesn't have them
 */
export async function runAuditsOnExistingSession(
    sessionId: number,
    device: 'mobile' | 'desktop',
    userId: number
): Promise<void> {
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
                    if (auditResult && !auditResult.error) {
                        successfulAudits++;
                    }

                    // Notify audit completion
                    sendEvent({
                        type: 'audit-complete',
                        url,
                        device,
                        progress: completedAudits,
                        total: totalUrls,
                        result: auditResult
                    }, 'audit', userId);

                    logger.info(`Audit completed: ${url}`, { progress: `${completedAudits}/${totalUrls}` });
                } catch (error) {
                    completedAudits++;
                    logger.error(`Audit failed for ${url}`, error as Error);

                    sendEvent({
                        type: 'audit-error',
                        url,
                        error: (error as Error).message,
                        progress: completedAudits,
                        total: totalUrls
                    }, 'audit', userId);
                }
            });

            await Promise.all(batchPromises);
        }

        const duration = Date.now() - startTime;

        logger.info(`All audits completed for session ${sessionId}`, {
            total: totalUrls,
            successful: successfulAudits,
            failed: totalUrls - successfulAudits,
            duration: `${Math.round(duration / 1000)}s`
        });

        // Update session status to completed
        await db.updateCrawlSession(sessionId, { status: 'completed' });

        // Notify user that all audits are complete
        sendEvent({
            type: 'session-status-update',
            sessionId: sessionId,
            status: 'completed',
            message: 'All audits completed',
            stats: {
                total: totalUrls,
                successful: successfulAudits,
                failed: totalUrls - successfulAudits,
                duration: Math.round(duration / 1000)
            }
        }, 'session-status-update', userId);

        // Send audit completion email
        try {
            const user = await db.getUserById(userId);
            const userSettings = await db.getUserSettings(userId);

            if (user && userSettings?.emailNotifications) {
                const { Mailer } = await import('../../utils/Mailer.js');
                const mailer = Mailer.getInstance();

                await mailer.send(
                    `Audits Completed: Session ${sessionId}`,
                    `Hello ${user.name || user.email},\n\nYour performance audits have completed!\n\nSession ID: ${sessionId}\nTotal Audits: ${totalUrls}\nSuccessful: ${successfulAudits}\nFailed: ${totalUrls - successfulAudits}\nDuration: ${Math.round(duration / 1000)}s\nDevice: ${device}\n\nView your results in the dashboard.\n\nBest regards,\nContentlytics Team`,
                    undefined,
                    user.email
                );
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

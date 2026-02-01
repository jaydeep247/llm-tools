/**
 * Crawl Cancellation Manager
 * Centralized service for managing crawl cancellation across all processes
 */

import { CheerioCrawler } from 'crawlee';
import { Logger } from '../helpers/logging/Logger.js';
import { getDatabase } from './DatabaseService.js';
import { cancelAuditWorker } from '../redis/audit/audit-worker.js';
import { cancelAuditsForSession } from '../crawlers/modules/module_A/auditManager.js';
import { sendEvent } from './SSEService.js';

const logger = Logger.getInstance();

interface ActiveCrawl {
    sessionId: number;
    userId: number;
    crawler: CheerioCrawler;
    cancelled: boolean;
    cancelledAt?: Date;
}

class CrawlCancellationManager {
    private activeCrawls: Map<number, ActiveCrawl> = new Map(); // sessionId -> ActiveCrawl
    private cancelledSessions: Set<number> = new Set(); // Track cancelled sessionIds

    /**
     * Register an active crawl
     */
    registerCrawl(sessionId: number, userId: number, crawler: CheerioCrawler): void {
        this.activeCrawls.set(sessionId, {
            sessionId,
            userId,
            crawler,
            cancelled: false
        });
        logger.info(`[CancellationManager] Registered crawl for session ${sessionId}, user ${userId}`);
    }

    /**
     * Unregister a crawl (when it completes or is cancelled)
     */
    unregisterCrawl(sessionId: number): void {
        const crawl = this.activeCrawls.get(sessionId);
        if (crawl) {
            this.activeCrawls.delete(sessionId);
            logger.info(`[CancellationManager] Unregistered crawl for session ${sessionId}`);
        }
    }

    /**
     * Cancel all crawls for a specific user
     */
    async cancelUserCrawls(userId: number): Promise<{ cancelled: number[]; errors: string[] }> {
        const cancelled: number[] = [];
        const errors: string[] = [];

        // Find all active crawls for this user
        const userCrawls = Array.from(this.activeCrawls.values()).filter(
            crawl => crawl.userId === userId && !crawl.cancelled
        );

        logger.info(`[CancellationManager] Cancelling ${userCrawls.length} crawl(s) for user ${userId}`);

        for (const crawl of userCrawls) {
            try {
                await this.cancelCrawl(crawl.sessionId, userId);
                cancelled.push(crawl.sessionId);
            } catch (error) {
                const errorMsg = `Failed to cancel crawl ${crawl.sessionId}: ${(error as Error).message}`;
                errors.push(errorMsg);
                logger.error(`[CancellationManager] ${errorMsg}`, error as Error);
            }
        }

        return { cancelled, errors };
    }

    /**
     * Cancel a specific crawl by sessionId.
     * @param message Optional message (e.g. "Crawl timed out (exceeded 12 hours)") for SSE and DB errorMessage.
     */
    async cancelCrawl(sessionId: number, userId?: number, message?: string): Promise<void> {
        const crawl = this.activeCrawls.get(sessionId);
        const displayMessage = message || 'Crawl cancelled by user';

        if (!crawl) {
            // Check if it's already cancelled
            if (this.cancelledSessions.has(sessionId)) {
                logger.info(`[CancellationManager] Session ${sessionId} already cancelled`);
                return;
            }

            // Session might not be registered yet, but mark it as cancelled
            this.cancelledSessions.add(sessionId);
            logger.info(`[CancellationManager] Marked session ${sessionId} as cancelled (not yet registered)`);

            // Also cancel audits for this session
            try {
                await cancelAuditsForSession(sessionId);
            } catch (error) {
                logger.warn(`[CancellationManager] Failed to cancel audits for session ${sessionId}`, error as Error);
            }

            // Update database status even if crawler not registered yet
            try {
                const db = getDatabase();
                const session = await db.getCrawlSession(sessionId);
                if (session) {
                    await db.updateCrawlSession(sessionId, {
                        status: 'cancelled',
                        completedAt: new Date().toISOString(),
                        ...(message && { errorMessage: message } as any),
                    });

                    // Send SSE event if we have userId
                    if (session.userId) {
                        try {
                            sendEvent({
                                type: 'session-status-update',
                                sessionId: sessionId,
                                status: 'cancelled',
                                message: displayMessage
                            }, 'session-status-update', session.userId);
                        } catch (sseError) {
                            logger.warn(`[CancellationManager] Failed to send SSE event`, sseError as Error);
                        }
                    }
                }
            } catch (error) {
                logger.warn(`[CancellationManager] Failed to update session ${sessionId} status (not registered)`, error as Error);
            }

            return;
        }

        // Verify user ownership if userId provided
        if (userId !== undefined && crawl.userId !== userId) {
            throw new Error(`User ${userId} does not own session ${sessionId}`);
        }

        if (crawl.cancelled) {
            logger.info(`[CancellationManager] Session ${sessionId} already cancelled`);
            return;
        }

        logger.info(`[CancellationManager] Cancelling crawl for session ${sessionId}`);

        // Mark as cancelled
        crawl.cancelled = true;
        crawl.cancelledAt = new Date();
        this.cancelledSessions.add(sessionId);

        // Stop the crawler by marking it as cancelled
        // The crawler will check for cancellation in the request handler
        // and stop processing new requests
        logger.info(`[CancellationManager] Crawler marked for cancellation for session ${sessionId}`);

        // Cancel audit processing for this session
        try {
            await cancelAuditsForSession(sessionId);
        } catch (error) {
            logger.warn(`[CancellationManager] Failed to cancel audits for session ${sessionId}`, error as Error);
        }

        // Update database status to cancelled
        try {
            const db = getDatabase();
            await db.updateCrawlSession(sessionId, {
                status: 'cancelled',
                completedAt: new Date().toISOString(),
                ...(message && { errorMessage: message } as any),
            });
            logger.info(`[CancellationManager] Updated session ${sessionId} status to cancelled`);

            // Send SSE event to notify frontend
            try {
                sendEvent({
                    type: 'session-status-update',
                    sessionId: sessionId,
                    status: 'cancelled',
                    message: displayMessage
                }, 'session-status-update', crawl.userId);
            } catch (sseError) {
                logger.warn(`[CancellationManager] Failed to send SSE event for cancelled session`, sseError as Error);
            }
        } catch (error) {
            logger.warn(`[CancellationManager] Failed to update session ${sessionId} status`, error as Error);
        }
    }

    /**
     * Mark a crawl as timed out (exceeded CRAWL_COMPLETION_TIMEOUT_HOURS).
     * Uses cancelCrawl with a timeout message.
     */
    async timeoutCrawl(sessionId: number, timeoutHours: number): Promise<void> {
        const message = `Crawl timed out (exceeded ${timeoutHours} hour limit)`;
        await this.cancelCrawl(sessionId, undefined, message);
    }

    /**
     * Check if a session is cancelled
     */
    isCancelled(sessionId: number): boolean {
        const crawl = this.activeCrawls.get(sessionId);
        return crawl?.cancelled === true || this.cancelledSessions.has(sessionId);
    }

    /**
     * Get active crawl for a session
     */
    getActiveCrawl(sessionId: number): ActiveCrawl | undefined {
        return this.activeCrawls.get(sessionId);
    }

    /**
     * Get all active crawls for a user
     */
    getUserCrawls(userId: number): ActiveCrawl[] {
        return Array.from(this.activeCrawls.values()).filter(crawl => crawl.userId === userId);
    }

    /**
     * Clear cancelled session tracking (for cleanup)
     */
    clearCancelledSession(sessionId: number): void {
        this.cancelledSessions.delete(sessionId);
    }
}

// Singleton instance
let cancellationManager: CrawlCancellationManager | null = null;

export function getCancellationManager(): CrawlCancellationManager {
    if (!cancellationManager) {
        cancellationManager = new CrawlCancellationManager();
    }
    return cancellationManager;
}

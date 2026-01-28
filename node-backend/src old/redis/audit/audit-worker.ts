/**
 * Redis Worker for Performance Audits
 * Processes audit jobs from Redis queue in parallel
 */

import {
    dequeueAudit,
    markAuditComplete,
    getAuditQueueStats,
    closeAuditRedis,
    type AuditJob
} from './audit-queue.js';
import { CrawlAuditIntegration } from '../../services/module_A/audits/CrawlAuditIntegration.js';
import { Logger } from '../../helpers/logging/Logger.js';
import { sendEvent } from '../../services/SSEService.js';
import { getCancellationManager } from '../../services/crawlCancellationManager.js';

const logger = Logger.getInstance();

// Global cancellation flag
let workerCancelled = false;

export function cancelAuditWorker(): void {
    workerCancelled = true;
}

export function resetAuditWorkerCancellation(): void {
    workerCancelled = false;
}

async function processAuditJob(job: AuditJob, sessionUserId?: number): Promise<boolean> {
    const auditIntegration = new CrawlAuditIntegration(job.sessionId);
    const startTime = Date.now();

    try {
        // Minimal logging for speed - only log retries and errors
        if (job.retryCount && job.retryCount > 0) {
            logger.info(`[audit-worker] Retry ${job.retryCount} for ${job.url}`);
        }

        // Notify audit start via SSE if userId provided
        if (sessionUserId) {
            sendEvent({ type: 'audit-start', url: job.url }, 'audit', sessionUserId);
        }

        const result = await auditIntegration.runAuditForUrl(job.url, job.device);

        // Notify audit complete via SSE if userId provided
        if (sessionUserId) {
            sendEvent({
                type: 'audit-complete',
                url: job.url,
                success: result.success,
                lcp: result.lcp,
                tbt: result.tbt,
                cls: result.cls,
                performanceScore: result.performanceScore
            }, 'audit', sessionUserId);
        }

        // Only log failures for debugging
        if (!result.success) {
            logger.warn(`[audit-worker] ✗ ${job.url} failed: ${result.error}`);
        }

        return result.success;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`[audit-worker] ✗ ${job.url} error after ${duration}ms:`, error as Error);

        // Notify audit error via SSE if userId provided
        if (sessionUserId) {
            sendEvent({
                type: 'audit-complete',
                url: job.url,
                success: false,
                error: (error as Error).message
            }, 'audit', sessionUserId);
        }

        return false;
    }
}


// Cache userId lookups to avoid repeated database queries
const userIdCache = new Map<number, number>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get userId for a session (for SSE notifications) with caching
 */
async function getUserIdForSessionCached(sessionId: number): Promise<number | undefined> {
    // Check cache first
    const cached = userIdCache.get(sessionId);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const { getDatabase } = await import('../../services/DatabaseService.js');
        const db = getDatabase();
        const session = await db.getCrawlSession(sessionId);
        const userId = session?.userId;
        
        if (userId) {
            userIdCache.set(sessionId, userId);
            // Clear cache after TTL
            setTimeout(() => userIdCache.delete(sessionId), CACHE_TTL);
        }
        
        return userId;
    } catch (error) {
        logger.warn(`[audit-worker] Failed to get userId for session ${sessionId}:`, error as Error);
        return undefined;
    }
}

/**
 * Main worker function with configurable concurrency
 * Highly optimized for maximum speed
 */
export async function worker(concurrency: number = 25) {
    let processed = 0;
    let errors = 0;
    let running = true;

    logger.info(`[audit-worker] Starting with concurrency=${concurrency} (maximum speed mode)`);

    // Graceful shutdown handling
    process.on('SIGINT', () => {
        logger.info('[audit-worker] Received SIGINT, shutting down gracefully...');
        running = false;
    });

    process.on('SIGTERM', () => {
        logger.info('[audit-worker] Received SIGTERM, shutting down gracefully...');
        running = false;
    });

    const workers = Array.from({ length: concurrency }, async (_, workerId) => {
        logger.info(`[audit-worker] Worker ${workerId + 1} started`);
        const cancellationManager = getCancellationManager();

        while (running && !workerCancelled) {
            try {
                const job = await dequeueAudit();

                if (!job) {
                    // No jobs available, minimal poll interval for instant job pickup
                    await new Promise(resolve => setTimeout(resolve, 50));
                    continue;
                }

                // Check if this session is cancelled before processing
                if (cancellationManager.isCancelled(job.sessionId)) {
                    logger.info(`[audit-worker] Skipping job for cancelled session ${job.sessionId}`);
                    // Mark as failed since it was cancelled
                    await markAuditComplete(job.url, false, job.sessionId, job, 0);
                    continue;
                }

                // Get userId for SSE notifications (cached)
                const userId = await getUserIdForSessionCached(job.sessionId);

                // Retry logging handled in processAuditJob

                // Check cancellation again before processing (in case it was cancelled while we were waiting)
                if (cancellationManager.isCancelled(job.sessionId)) {
                    logger.info(`[audit-worker] Job cancelled for session ${job.sessionId} before processing`);
                    await markAuditComplete(job.url, false, job.sessionId, job, 0);
                    continue;
                }

                const success = await processAuditJob(job, userId);

                // Check if cancelled during processing
                if (cancellationManager.isCancelled(job.sessionId)) {
                    logger.info(`[audit-worker] Job cancelled for session ${job.sessionId} during processing`);
                    await markAuditComplete(job.url, false, job.sessionId, job, 0);
                    continue;
                }

                // Pass job object for retry logic
                await markAuditComplete(job.url, success, job.sessionId, job, 3);

                if (success) {
                    processed++;
                } else {
                    // Only count as error if max retries exceeded
                    if ((job.retryCount || 0) >= 3) {
                        errors++;
                    }
                }

                // Minimal delay - rate limiting is fully handled by psiClient
                // No artificial delay needed, process immediately for maximum speed
                // Only tiny delay to prevent tight loop if queue is empty
                await new Promise(resolve => setTimeout(resolve, 10));

                // Progress reporting every 25 jobs (less frequent for speed)
                if ((processed + errors) % 25 === 0) {
                    const stats = await getAuditQueueStats(job.sessionId);
                    logger.info(`[audit-worker] Progress: ${processed} successful, ${errors} failed | Session ${job.sessionId}: ${stats.totalQueued} queued, ${stats.processing} processing, ${stats.completed} completed`);
                }

            } catch (error) {
                logger.error(`[audit-worker] Worker ${workerId + 1} error:`, error as Error);
                // Minimal delay on errors to recover quickly
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        logger.info(`[audit-worker] Worker ${workerId + 1} stopped`);
    });

    // Wait for all workers to complete
    await Promise.all(workers);

    logger.info(`[audit-worker] Final stats: ${processed} successful, ${errors} failed`);
}

/**
 * Main entry point for audit worker
 * Maximum speed configuration
 */
export async function main() {
    // High concurrency for maximum parallel processing
    // 25 workers process jobs in parallel, rate limiter controls API calls
    // Rate limiting in psiClient ensures we don't exceed API limits
    const concurrency: number = Number(process.env.AUDIT_CONCURRENCY) || 25;

    logger.info(`[audit-worker] Starting Redis-based audit worker with concurrency=${concurrency}`);
    logger.info(`[audit-worker] Maximum speed mode - minimal delays, rate limiting handled by psiClient`);

    try {
        resetAuditWorkerCancellation();
        await worker(concurrency);
    } finally {
        await closeAuditRedis();
        logger.info('[audit-worker] Redis connection closed');
    }
}

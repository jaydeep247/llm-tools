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
} from './audit-redis-queue.js';
import { CrawlAuditIntegration } from './CrawlAuditIntegration.js';
import { Logger } from '../../../helpers/logging/Logger.js';
import { sendEvent } from '../../SSEService.js';

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
        logger.info(`[audit-worker] Processing ${job.url} (${job.device}) for session ${job.sessionId}`);

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

        const duration = Date.now() - startTime;
        if (result.success) {
            logger.info(`[audit-worker] ✓ ${job.url} completed in ${duration}ms`);
        } else {
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

/**
 * Get userId for a session (for SSE notifications)
 */
async function getUserIdForSession(sessionId: number): Promise<number | undefined> {
    try {
        const { getDatabase } = await import('../../DatabaseService.js');
        const db = getDatabase();
        const session = await db.getCrawlSession(sessionId);
        return session?.userId;
    } catch (error) {
        logger.warn(`[audit-worker] Failed to get userId for session ${sessionId}:`, error as Error);
        return undefined;
    }
}

/**
 * Main worker function with configurable concurrency
 */
export async function worker(concurrency: number = 50) {
    let processed = 0;
    let errors = 0;
    let running = true;

    logger.info(`[audit-worker] Starting with concurrency=${concurrency}`);

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

        while (running && !workerCancelled) {
            try {
                const job = await dequeueAudit();

                if (!job) {
                    // No jobs available, short poll to reduce latency
                    await new Promise(resolve => setTimeout(resolve, 100));
                    continue;
                }

                // Get userId for SSE notifications
                const userId = await getUserIdForSession(job.sessionId);

                const success = await processAuditJob(job, userId);

                await markAuditComplete(job.url, success, job.sessionId);

                if (success) {
                    processed++;
                } else {
                    errors++;
                }

                // Progress reporting every 10 jobs
                if ((processed + errors) % 10 === 0) {
                    const stats = await getAuditQueueStats(job.sessionId);
                    logger.info(`[audit-worker] Progress: ${processed} successful, ${errors} errors | Session ${job.sessionId}: ${stats.totalQueued} queued, ${stats.processing} processing`);
                }

            } catch (error) {
                logger.error(`[audit-worker] Worker ${workerId + 1} error:`, error as Error);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        logger.info(`[audit-worker] Worker ${workerId + 1} stopped`);
    });

    // Wait for all workers to complete
    await Promise.all(workers);

    logger.info(`[audit-worker] Final stats: ${processed} successful, ${errors} errors`);
}

/**
 * Main entry point for audit worker
 */
export async function main() {
    // Get concurrency from environment or use default
    // High default concurrency for fast parallel processing
    const concurrency: number = Number(process.env.AUDIT_CONCURRENCY) || 50;

    logger.info(`[audit-worker] Starting Redis-based audit worker with concurrency=${concurrency}`);

    try {
        resetAuditWorkerCancellation();
        await worker(concurrency);
    } finally {
        await closeAuditRedis();
        logger.info('[audit-worker] Redis connection closed');
    }
}

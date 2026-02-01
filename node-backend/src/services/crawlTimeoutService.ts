/**
 * Periodic cleanup: mark running/auditing sessions that exceeded
 * CRAWL_COMPLETION_TIMEOUT_HOURS as cancelled (timed out).
 */

import { getDatabase } from './DatabaseService.js';
import { getCancellationManager } from './crawlCancellationManager.js';
import { CRAWL_COMPLETION_TIMEOUT_HOURS } from '../config/appConfig.js';
import { Logger } from '../helpers/logging/Logger.js';

const logger = Logger.getInstance();
const INTERVAL_MS = 5 * 60 * 1000; // run every 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function runCrawlTimeoutCleanup(): Promise<void> {
    const db = getDatabase();
    const cancellationManager = getCancellationManager();
    const cutoff = new Date(Date.now() - CRAWL_COMPLETION_TIMEOUT_HOURS * 60 * 60 * 1000);

    try {
        const sessions = await db.getRunningSessionsStartedBefore(cutoff);
        if (sessions.length === 0) return;

        logger.info(`[CrawlTimeout] Marking ${sessions.length} session(s) as timed out (started before ${cutoff.toISOString()})`);
        for (const session of sessions) {
            try {
                await cancellationManager.timeoutCrawl(session.id, CRAWL_COMPLETION_TIMEOUT_HOURS);
            } catch (err) {
                logger.warn(`[CrawlTimeout] Failed to timeout session ${session.id}`, err as Error);
            }
        }
    } catch (err) {
        logger.error('[CrawlTimeout] Cleanup failed', err as Error);
    }
}

export function startCrawlTimeoutScheduler(): void {
    if (intervalId) return;
    logger.info(`[CrawlTimeout] Starting scheduler (interval ${INTERVAL_MS / 60000} min, timeout ${CRAWL_COMPLETION_TIMEOUT_HOURS}h)`);
    runCrawlTimeoutCleanup(); // run once on startup
    intervalId = setInterval(runCrawlTimeoutCleanup, INTERVAL_MS);
}

export function stopCrawlTimeoutScheduler(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info('[CrawlTimeout] Scheduler stopped');
    }
}

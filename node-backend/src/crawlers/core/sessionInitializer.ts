/**
 * Session Initialization Module
 * Handles crawl session creation and validation
 */

import { Logger } from '../../helpers/logging/Logger.js';
import { getDatabase } from '../../services/DatabaseService.js';
import type { CrawlOptions, CrawlEvents } from '../types/index.js';

const logger = Logger.getInstance();

export async function initializeSession(
    options: CrawlOptions,
    startUrl: string,
    startUrlObj: URL,
    events: CrawlEvents
): Promise<number> {
    const { scheduleId, userId } = options;
    const db = getDatabase();

    if (options.sessionId) {
        logger.info(`Using provided crawl session: ${options.sessionId}`);
        return options.sessionId;
    }

    try {
        const sessionId = await db.createCrawlSession({
            startUrl,
            allowSubdomains: options.allowSubdomains,
            maxConcurrency: options.maxConcurrency,
            mode: 'html',
            scheduleId,
            userId,
            startedAt: new Date().toISOString(),
            totalPages: 0,
            totalResources: 0,
            duration: 0,
            status: 'running'
        });
        logger.info(`Created crawl session: ${sessionId}`);
        events.onSessionStart?.(sessionId);
        return sessionId;
    } catch (error) {
        const errorMsg = `Failed to create crawl session: ${(error as Error).message}`;
        logger.error(errorMsg, error as Error);
        events.onLog?.(errorMsg);
        throw error;
    }
}

export function validateStartUrl(startUrl: string): { url: URL; host: string } {
    try {
        const url = new URL(startUrl);
        const host = url.hostname;
        const msg = `Starting crawl for ${startUrl} (host=${host})`;
        logger.info(msg);
        return { url, host };
    } catch (error) {
        const errorMsg = `Invalid start URL: ${startUrl}`;
        logger.error(errorMsg, error as Error);
        throw error;
    }
}

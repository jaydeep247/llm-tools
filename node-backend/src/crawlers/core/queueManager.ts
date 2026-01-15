/**
 * Queue Manager Module
 * Handles request queue initialization and URL loading
 */

import { RequestQueue, log } from 'crawlee';
import { Logger } from '../../helpers/logging/Logger.js';
import type { CrawlEvents } from '../types/index.js';

const logger = Logger.getInstance();

export async function initializeQueue(
    sessionId: number,
    startUrl: string,
    sitemapUrls: string[],
    events: CrawlEvents
): Promise<RequestQueue> {
    const queue = await RequestQueue.open(`crawl-session-${sessionId}-${Date.now()}`);

    try {
        // Add start URL
        await queue.addRequest({ url: startUrl, userData: { depth: 0 } });
        
        // Add sitemap URLs
        for (const url of sitemapUrls) {
            await queue.addRequest({ url, userData: { depth: 0 } });
        }

        const queueInfo = await queue.getInfo();
        const qmsg = `Queue prepared: pending=${queueInfo?.pendingRequestCount ?? 'n/a'}, handled=${queueInfo?.handledRequestCount ?? 'n/a'}`;
        log.info(qmsg);
        events.onLog?.(qmsg);

        if (sitemapUrls.length > 0) {
            const sitemapMsg = `Added ${sitemapUrls.length} sitemap URLs to crawl queue`;
            log.info(sitemapMsg);
            events.onLog?.(sitemapMsg);
        }

        return queue;
    } catch (error) {
        const errorMsg = `Failed to initialize queue: ${error}`;
        log.error(errorMsg);
        events.onLog?.(errorMsg);
        throw error;
    }
}

export async function cleanupQueue(queue: RequestQueue): Promise<void> {
    try {
        await queue.drop();
        log.info('Request queue cleaned up');
    } catch (error) {
        log.warning('Failed to clean up request queue', error as Error);
    }
}

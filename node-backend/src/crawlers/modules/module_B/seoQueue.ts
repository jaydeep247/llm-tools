/**
 * Module B - SEO Queue Management
 */

import { log } from 'crawlee';
import type { CrawlEvents } from '../../types/index.js';
import { initSeoEnqueue, maybeEnqueueSeo } from '../../../services/module_B/seo/redis-queue.js';

export async function initializeSeoQueue(startUrl: string, sessionId: number, events: CrawlEvents): Promise<void> {
    const { onLog } = events;

    try {
        const initMsg = '🚀 Initializing SEO extraction queue...';
        log.info(initMsg);
        onLog?.(initMsg);

        await initSeoEnqueue(startUrl, sessionId);

        const readyMsg = '✓ SEO extraction queue initialized';
        log.info(readyMsg);
        onLog?.(readyMsg);
    } catch (error) {
        log.warning(`Failed to initialize SEO queue: ${error}`);
    }
}

export async function enqueueSeoIfEligible(
    url: string,
    sessionId: number,
    host: string,
    contentType: string,
    wordCount: number
): Promise<void> {
    try {
        await maybeEnqueueSeo(url, sessionId, host, contentType, wordCount);
    } catch {
        // Non-blocking, continue crawl even if SEO enqueue fails
    }
}

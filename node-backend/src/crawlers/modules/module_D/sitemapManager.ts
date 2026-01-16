/**
 * Module D - Sitemap Discovery and Management
 */

import { log } from 'crawlee';
import { Logger } from '../../../helpers/logging/Logger.js';
import { getDatabase } from '../../../services/DatabaseService.js';
import { SitemapService } from '../../../helpers/module_D/sitemap/SitemapService.js';
import type { CrawlEvents } from '../../types/index.js';

const logger = Logger.getInstance();

export async function discoverAndLoadSitemaps(
    startUrl: string,
    sessionId: number,
    events: CrawlEvents
): Promise<string[]> {
    const { onLog } = events;
    const db = getDatabase();

    const sitemapMsg = 'Discovering sitemaps...';
    log.info(sitemapMsg);
    onLog?.(sitemapMsg);

    try {
        const sitemapResult = await SitemapService.discoverSitemaps(startUrl);

        // Store sitemap discovery results
        for (const sitemapUrl of sitemapResult.sitemapUrls) {
            await db.insertSitemapDiscovery({
                sessionId,
                sitemapUrl,
                discoveredUrls: 0,
                lastModified: new Date().toISOString(),
                success: true,
                errorMessage: undefined
            });
        }

        // Store discovered URLs from sitemaps
        for (const urlData of sitemapResult.discoveredUrls) {
            await db.insertSitemapUrl({
                sessionId,
                url: urlData.url,
                lastModified: urlData.lastModified || undefined,
                changeFrequency: urlData.changeFrequency || undefined,
                priority: urlData.priority || undefined,
            });
        }

        const discoveryMsg = `Discovered ${sitemapResult.discoveredUrls.length} URLs from ${sitemapResult.sitemapUrls.length} sitemaps`;
        log.info(discoveryMsg);
        onLog?.(discoveryMsg);

        if (sitemapResult.errors.length > 0) {
            const errorMsg = `Sitemap discovery errors: ${sitemapResult.errors.join(', ')}`;
            onLog?.(errorMsg);
        }

        return sitemapResult.discoveredUrls.map(u => u.url);
    } catch (error) {
        const errorMsg = `Sitemap discovery failed: ${error}`;
        log.error(errorMsg);
        onLog?.(errorMsg);
        return [];
    }
}

export async function markSitemapUrlAsCrawled(sessionId: number, url: string): Promise<void> {
    try {
        await getDatabase().markSitemapUrlAsCrawled(sessionId, url);
    } catch (error) {
        logger.debug('Failed to mark sitemap URL as crawled', { url, error });
    }
}

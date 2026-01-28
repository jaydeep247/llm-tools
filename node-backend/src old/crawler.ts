import { CheerioCrawler, log, Configuration } from 'crawlee';
import { Logger } from './helpers/logging/Logger.js';
import { MetricsCollector } from './controllers/module_D/monitoring/MetricsCollector.js';
import { getCancellationManager } from './services/crawlCancellationManager.js';

// Import core functions
import { 
    initializeSession, 
    validateStartUrl, 
    initializeQueue, 
    cleanupQueue, 
    executePostProcessing, 
    finalizeSession 
} from './crawlers/core/index.js';

// Import handler factories
import { 
    createRequestHandler, 
    createErrorHandler 
} from './crawlers/handlers/index.js';

// Import module initialization
import { initializeSeoQueue } from './crawlers/modules/module_B/index.js';
import { discoverAndLoadSitemaps } from './crawlers/modules/module_D/index.js';

// Import types
import type { CrawlOptions, CrawlEvents } from './crawlers/types/index.js';

Configuration.set('systemInfoV2', true);

const logger = Logger.getInstance();
let auditCancelled = false;

/**
 * Cancel active audits (legacy function for backward compatibility)
 */
export function cancelAudits(): void {
    auditCancelled = true;
}

/**
 * Reset audit cancellation flag
 */
export function resetAuditCancellation(): void {
    auditCancelled = false;
}

/**
 * Main crawl orchestrator - delegates to specialized modules
 */
export async function runCrawl(
    options: CrawlOptions, 
    events: CrawlEvents = {}, 
    metricsCollector?: MetricsCollector
): Promise<void> {
    const { startUrl, allowSubdomains, maxConcurrency, denyParamPrefixes, runAudits = false, auditDevice = 'desktop', captureLinkDetails = false } = options;

    try {
        events.onLog?.(`🚀 Starting crawl: ${startUrl}`);

        // Validate and parse start URL
        const { url: startUrlObj, host: allowedHost } = validateStartUrl(startUrl);

        // Initialize session
        const sessionId = await initializeSession(options, startUrl, startUrlObj, events);

        // Initialize module systems
        await initializeSeoQueue(startUrl, sessionId, events);
        const sitemapUrls = await discoverAndLoadSitemaps(startUrl, sessionId, events);

        // Initialize queue
        const queue = await initializeQueue(sessionId, startUrl, sitemapUrls, events);

        // Prepare request tracking
        const requestStartTimes = new Map<string, number>();
        const emittedCss = new Set<string>();
        const emittedJs = new Set<string>();
        const emittedImg = new Set<string>();
        const emittedExternal = new Set<string>();
        const crawledPagesWithHtml: Array<{ id: number; url: string; htmlContent: string }> = [];

        // Create request handler
        const requestHandler = createRequestHandler({
            sessionId,
            allowedHost,
            allowSubdomains,
            denyParamPrefixes,
            captureLinkDetails,
            events,
            metricsCollector,
            requestStartTimes,
            emittedCss,
            emittedJs,
            emittedImg,
            emittedExternal,
            crawledPagesWithHtml
        });

        // Create error handler
        const errorHandler = createErrorHandler({
            sessionId,
            events,
            metricsCollector,
            requestStartTimes
        });

        // Create and run crawler
        const crawler = new CheerioCrawler({
            requestQueue: queue,
            maxConcurrency,
            requestHandlerTimeoutSecs: 45,
            maxRequestRetries: 1,
            preNavigationHooks: [async ({ request }) => { requestStartTimes.set(request.url, Date.now()); }],
            requestHandler,
            errorHandler
        });

        // Register crawler with cancellation manager
        const cancellationManager = getCancellationManager();
        const userId = options.userId;
        if (userId) {
            cancellationManager.registerCrawl(sessionId, userId, crawler);
        }

        try {
            // Check for cancellation before starting
            if (cancellationManager.isCancelled(sessionId)) {
                events.onLog?.('🛑 Crawl cancelled before starting');
                return;
            }

            // Run crawler - cancellation is checked in the request handler
            await crawler.run();

            // Check if cancelled after crawl completes
            if (cancellationManager.isCancelled(sessionId)) {
                events.onLog?.('🛑 Crawl was cancelled, skipping post-processing');
                return;
            }

            // Post-processing and finalization
            await executePostProcessing(sessionId, captureLinkDetails, runAudits, auditDevice, events, crawledPagesWithHtml);
            await finalizeSession(sessionId, runAudits, events);
        } finally {
            // Always unregister the crawler
            cancellationManager.unregisterCrawl(sessionId);
        }

        // Cleanup
        await cleanupQueue(queue);

    } catch (error) {
        const errorMsg = `Crawl failed: ${(error as Error).message}`;
        logger.error(errorMsg, error as Error);
        events.onLog?.(errorMsg);
        throw error;
    }
}

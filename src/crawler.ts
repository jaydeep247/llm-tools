import { CheerioCrawler, log, RequestQueue, Configuration } from 'crawlee';
import { canonicalizeUrl, isSameSite } from './utils/url.js';
import { Logger } from './logging/Logger.js';
import { MetricsCollector } from './monitoring/MetricsCollector.js';
import { getDatabase, DatabaseService } from './database/DatabaseService.js';
import { SitemapService } from './sitemap/SitemapService.js';
import { CrawlAuditIntegration } from './audits/CrawlAuditIntegration.js';
import { extractLinkMetadata } from './utils/linkAnalyzer.js';
import { initSeoEnqueue, maybeEnqueueSeo } from './seo/redis-queue.js';
import { extractPageMetrics } from './modules/module_A/pageMetrics/index.js';
import { extractContentMetrics } from './modules/module_A/contentAnalysis/index.js';
import { extractLinksForCrawling, isValidHttpLink } from './modules/module_A/linkExtractor/index.js';
import { collectPageResources } from './modules/module_A/resourceCollector/index.js';
import { analyzeLinkDetails } from './modules/module_A/linkAnalysis/index.js';
import { calculateCarbon } from './modules/module_A/carbon/carbonCalculator.js';
import { fetchResourceSizes } from './modules/module_A/carbon/resourceSizer.js';
import { calculateFolderDepth, getCrawlDepthFromRequest } from './modules/module_A/contentAnalysis/urlDepth.js';
import { linkScoreService } from './services/LinkScoreService.js';
import { createFingerprint } from './modules/module_A/duplicateDetection/index.js';
import { analyzeSessionDuplicates } from './modules/module_A/duplicateDetection/sessionAnalyzer.js';

Configuration.set('systemInfoV2', true);

/**
 * Check if a URL is a valid HTTP/HTTPS link that should be processed
 */
function isValidHttpLink(href: string): boolean {
    if (!href) return false;

    // Skip non-HTTP protocols
    const lowerHref = href.toLowerCase();
    if (lowerHref.startsWith('javascript:') ||
        lowerHref.startsWith('mailto:') ||
        lowerHref.startsWith('tel:') ||
        lowerHref.startsWith('sms:') ||
        lowerHref.startsWith('ftp:') ||
        lowerHref.startsWith('file:') ||
        lowerHref.startsWith('data:') ||
        lowerHref.startsWith('blob:') ||
        lowerHref.startsWith('chrome:') ||
        lowerHref.startsWith('about:') ||
        lowerHref.startsWith('#')) {
        return false;
    }

    // Must be HTTP or HTTPS
    if (!lowerHref.startsWith('http://') && !lowerHref.startsWith('https://')) {
        return false;
    }

    // Skip common image and media extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico', '.bmp', '.tiff', '.mp4', '.mp3', '.pdf', '.zip', '.tar', '.gz'];
    if (imageExtensions.some(ext => lowerHref.endsWith(ext))) {
        return false;
    }

    return true;
}

type CrawlOptions = {
    startUrl: string;
    allowSubdomains: boolean;
    maxConcurrency: number;
    perHostDelayMs: number;
    denyParamPrefixes: string[];
    mode?: 'html';
    scheduleId?: number;
    userId?: number;
    runAudits?: boolean;
    auditDevice?: 'mobile' | 'desktop';
    captureLinkDetails?: boolean;
    sessionId?: number;
};

type CrawlEvents = {
    onLog?: (message: string) => void;
    onPage?: (url: string) => void;
    onDone?: (count: number) => void;
    onAuditStart?: (url: string) => void;
    onAuditComplete?: (url: string, success: boolean, lcp?: number, tbt?: number, cls?: number, performanceScore?: number) => void;
    onAuditResults?: (results: any) => void;
    onAuditsComplete?: () => void;
    onSessionStart?: (sessionId: number) => void;
};

// Global flag to control audit cancellation
let auditCancelled = false;

export function cancelAudits(): void {
    auditCancelled = true;
}

export function resetAuditCancellation(): void {
    auditCancelled = false;
}

export async function runCrawl(options: CrawlOptions, events: CrawlEvents = {}, metricsCollector?: MetricsCollector): Promise<void> {
    const { startUrl, allowSubdomains, maxConcurrency, perHostDelayMs, denyParamPrefixes, scheduleId, userId, runAudits = false, auditDevice = 'desktop', captureLinkDetails = false } = options;
    const { onLog, onPage, onDone, onAuditStart, onAuditComplete, onAuditResults, onAuditsComplete, onSessionStart } = events;
    const logger = Logger.getInstance();
    const db = getDatabase();

    let start: URL;
    let allowedHost: string;

    try {
        start = new URL(startUrl);
        allowedHost = start.hostname;

        const startMsg = `Starting crawl for ${startUrl} (host=${allowedHost}, allowSubdomains=${allowSubdomains})`;
        log.info(startMsg);
        onLog?.(startMsg);

        // Initialize SEO enqueue with the crawl's origin
        try { await initSeoEnqueue(start.href); } catch { }
    } catch (error) {
        const errorMsg = `Invalid start URL: ${startUrl}`;
        logger.error(errorMsg, error as Error);
        onLog?.(errorMsg);
        throw error;
    }

    // Create crawl session (only if not provided)
    let sessionId: number;
    if (options.sessionId) {
        sessionId = options.sessionId;
        logger.info(`Using provided crawl session: ${sessionId}`);
    } else {
        try {
            sessionId = await db.createCrawlSession({
                startUrl,
                allowSubdomains,
                maxConcurrency,
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
        } catch (error) {
            const errorMsg = `Failed to create crawl session: ${(error as Error).message}`;
            logger.error(errorMsg, error as Error);
            onLog?.(errorMsg);
            throw error;
        }
    }

    // Notify listeners about the session ID
    onSessionStart?.(sessionId);

    // Helper function to log and save to database
    const logAndSave = async (message: string, level: string = 'info') => {
        onLog?.(message);
        try {
            await db.saveCrawlLog(sessionId, message, level);
        } catch (error) {
            logger.error('Failed to save log to database', error as Error);
        }
    };

    // Discover sitemaps and add URLs to queue
    const sitemapMsg = 'Discovering sitemaps...';
    log.info(sitemapMsg);
    await logAndSave(sitemapMsg);

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
        await logAndSave(discoveryMsg);

        if (sitemapResult.errors.length > 0) {
            const errorMsg = `Sitemap discovery errors: ${sitemapResult.errors.join(', ')}`;
            await logAndSave(errorMsg, 'warning');
        }
    } catch (error) {
        const errorMsg = `Sitemap discovery failed: ${error}`;
        log.error(errorMsg);
        await logAndSave(errorMsg, 'error');
    }

    // Use a unique queue per session run to avoid reusing handled requests
    const queue = await RequestQueue.open(`crawl-session-${sessionId}-${Date.now()}`);

    // Add discovered sitemap URLs to the queue
    try {
        const sitemapUrls = await db.getUncrawledSitemapUrls(sessionId);
        // Add requests directly to the same RequestQueue Cheerio will use
        // Set depth=0 for the start URL (homepage)
        await queue.addRequest({ 
            url: start.href,
            userData: { depth: 0 }
        });
        for (const u of sitemapUrls) {
            // Sitemap URLs are discovered URLs, so they're at depth 0 (same as start URL)
            await queue.addRequest({ 
                url: u.url,
                userData: { depth: 0 }
            });
        }

        // Debug: report queue stats
        try {
            const info = await queue.getInfo();
            const qmsg = `Queue prepared: pending=${info?.pendingRequestCount ?? 'n/a'}, handled=${info?.handledRequestCount ?? 'n/a'}`;
            log.info(qmsg);
            onLog?.(qmsg);
        } catch { }

        if (sitemapUrls.length > 0) {
            const queueMsg = `Added ${sitemapUrls.length} sitemap URLs to crawl queue`;
            log.info(queueMsg);
            onLog?.(queueMsg);
        }
    } catch (error) {
        const errorMsg = `Failed to add sitemap URLs to queue: ${error}`;
        log.error(errorMsg);
        onLog?.(errorMsg);
    }

    // Track request start times for response time calculation
    const requestStartTimes = new Map<string, number>();

    // Track globally emitted resources to avoid duplicate rows across pages
    const emittedCss = new Set<string>();
    const emittedJs = new Set<string>();
    const emittedImg = new Set<string>();
    const emittedExternal = new Set<string>();

    const cheerioCrawler = new CheerioCrawler({
        requestQueue: queue,
        maxConcurrency,
        requestHandlerTimeoutSecs: 45,
        maxRequestRetries: 1,
        preNavigationHooks: [
            async ({ request }) => {
                requestStartTimes.set(request.url, Date.now());
            }
        ],
        requestHandler: async ({ request, $, enqueueLinks, log: reqLog, response }) => {
            const { url } = request;

            if (response?.statusCode && response.statusCode >= 400) {
                const errorMsg = `Skipping ${url} due to status ${response.statusCode}`;
                reqLog.debug(errorMsg);
                onLog?.(errorMsg);

                // Store failed request data
                await db.insertPage({
                    sessionId,
                    url,
                    title: 'Request Failed',
                    titleLength: 0,
                    description: `HTTP ${response.statusCode} Error`,
                    descriptionLength: 0,
                    contentType: response?.headers?.['content-type'] || response?.responseHeaders?.['content-type'] || 'Unknown',
                    lastModified: response?.headers?.['last-modified'] || response?.responseHeaders?.['last-modified'] || null,
                    statusCode: response.statusCode,
                    responseTime: 0,
                    wordCount: 0,
                    sentenceCount: 0,
                    averageWordsPerSentence: 0,
                    fleschReadingEase: undefined,
                    readabilityLevel: undefined,
                    textToHtmlRatio: undefined,
                    crawlDepth: getCrawlDepthFromRequest(request),
                    folderDepth: calculateFolderDepth(url),
                    timestamp: new Date().toISOString(),
                    success: false,
                    errorMessage: `HTTP ${response.statusCode} Error`
                });

                onPage?.(url);
                return;
            }

            // Calculate response time
            const startTime = requestStartTimes.get(url) || Date.now();
            const responseTime = Date.now() - startTime;

            // Enhance response object with final URL for redirect detection
            const enhancedResponse = {
                ...response,
                url: response?.url || request.loadedUrl || url
            };

            // Extract page metrics using module_A (now async for Last-Modified)
            const pageMetrics = await extractPageMetrics(request.url, $, enhancedResponse, responseTime);
            
            // Extract content metrics using module_A
            const contentMetrics = extractContentMetrics($);
            
            // Calculate depths
            const crawlDepth = getCrawlDepthFromRequest(request);
            const folderDepth = calculateFolderDepth(url);
            
            // Use extracted metrics
            const resolvedContentType = pageMetrics.contentType;
            const wordCount = contentMetrics.visibleWordCount;
            const sentenceCount = contentMetrics.sentenceCount;
            const averageWordsPerSentence = contentMetrics.averageSentenceLength;
            const fleschReadingEase = contentMetrics.fleschReadingEase;
            const readabilityLevel = contentMetrics.readabilityLevel;
            const textToHtmlRatio = contentMetrics.textToHtmlRatio;

            // Record the page data using extracted metrics
            console.log(`[DEBUG] PageMetrics for ${url}:`, {
                relNext: pageMetrics.relNext,
                relPrev: pageMetrics.relPrev,
                httpRelNext: pageMetrics.httpRelNext,
                httpRelPrev: pageMetrics.httpRelPrev
            });
            
            // Debug readability metrics
            console.log(`[DEBUG] Readability for ${url}:`, {
                fleschReadingEase,
                readabilityLevel,
                wordCount,
                sentenceCount,
                textToHtmlRatio
            });

            const pageId = await db.insertPage({
                sessionId,
                url,
                title: pageMetrics.title,
                titleLength: pageMetrics.titleLength,
                titlePixelWidth: pageMetrics.titlePixelWidth,
                description: pageMetrics.metaDescription,
                descriptionLength: pageMetrics.metaDescriptionLength,
                descriptionPixelWidth: pageMetrics.metaDescriptionPixelWidth,
                contentType: pageMetrics.contentType,
                lastModified: pageMetrics.lastModified || null,
                statusCode: pageMetrics.statusCode,
                responseTime: pageMetrics.responseTime,
                wordCount,
                sentenceCount,
                averageWordsPerSentence,
                fleschReadingEase,
                readabilityLevel,
                textToHtmlRatio,
                crawlDepth,
                folderDepth,
                sizeBytes: pageMetrics.sizeBytes,
                timestamp: new Date().toISOString(),
                success: true,
                errorMessage: null,
                indexable: pageMetrics.indexable,
                indexabilityStatus: pageMetrics.indexabilityStatus,
                metaKeywords: pageMetrics.metaKeywords,
                metaKeywordsLength: pageMetrics.metaKeywordsLength,
                metaRobots: pageMetrics.metaRobots,
                xRobotsTag: pageMetrics.xRobotsTag,
                metaRefresh: pageMetrics.metaRefresh,
                canonicalUrl: pageMetrics.canonicalUrl,
                relNext: pageMetrics.relNext,
                relPrev: pageMetrics.relPrev,
                httpRelNext: pageMetrics.httpRelNext,
                httpRelPrev: pageMetrics.httpRelPrev,
                headingTags: JSON.stringify({
                    h1: pageMetrics.h1Tags.length,
                    h2: pageMetrics.h2Tags.length,
                    h3: pageMetrics.h3Tags.length,
                    h4: pageMetrics.h4Tags.length,
                    h5: pageMetrics.h5Tags.length,
                    h6: pageMetrics.h6Tags.length
                }),
                spellingErrors: contentMetrics.spellingErrors || 0,
                grammarErrors: contentMetrics.grammarErrors || 0,
                redirectUrl: pageMetrics.redirectUrl,
                redirectType: pageMetrics.redirectType,
                cookies: pageMetrics.cookies,
                language: pageMetrics.language,
                httpVersion: pageMetrics.httpVersion
            });

            // --- Content Fingerprinting for Near-Duplicate Detection ---
            try {
                const fingerprint = createFingerprint($, pageId, sessionId, url, false);
                await db.upsertContentFingerprint(fingerprint);
            } catch (error) {
                logger.error(`Failed to create content fingerprint for ${url}`, error as Error);
            }

            // Mark sitemap URL as crawled if it was discovered from sitemap
            await db.markSitemapUrlAsCrawled(sessionId, url);

            onPage?.(url);

            // Enqueue for SEO extraction if eligible (non-blocking)
            try { await maybeEnqueueSeo(url, resolvedContentType, wordCount); } catch { }

            // Record successful request in metrics
            if (metricsCollector) {
                metricsCollector.recordRequest({
                    url,
                    statusCode: response?.statusCode || 200,
                    responseTime: responseTime,
                    timestamp: new Date().toISOString(),
                    success: true
                });
            }

            logger.debug('Page processed', { url, responseTime });

            // Extract links for crawling using module_A
            const toEnqueue = extractLinksForCrawling($, {
                baseUrl: url,
                allowedHost,
                allowSubdomains,
                denyParamPrefixes
            }, canonicalizeUrl, isSameSite);

            if (toEnqueue.length > 0) {
                await enqueueLinks({
                    urls: toEnqueue,
                    transformRequestFunction: (req) => {
                        // Stay within same site only
                        if (!isSameSite(req.url, allowedHost, allowSubdomains)) return null;
                        
                        // Track crawl depth: increment depth for each link found on this page
                        const currentDepth = getCrawlDepthFromRequest(request);
                        req.userData = { ...req.userData, depth: currentDepth + 1 };
                        
                        return req;
                    },
                });
            }

            // Collect all resources using module_A
            const resources = collectPageResources($, {
                sessionId,
                pageId,
                baseUrl: url,
                allowedHost,
                allowSubdomains,
                emittedCss,
                emittedJs,
                emittedImg,
                emittedExternal
            }, isValidHttpLink, isSameSite);

            // Insert collected resources into database
            for (const resource of resources.css) {
                await db.upsertResource(resource);
            }
            for (const resource of resources.js) {
                await db.upsertResource(resource);
            }
            for (const resource of resources.images) {
                await db.upsertResource(resource);
            }
            for (const resource of resources.external) {
                await db.upsertResource(resource);
            }

            if (captureLinkDetails) {
                const linkAnalysisStart = Date.now();
                
                const linksToInsert = analyzeLinkDetails($, {
                    sessionId,
                    sourcePageId: pageId,
                    sourceUrl: url,
                    allowedHost,
                    allowSubdomains
                }, isValidHttpLink, isSameSite, extractLinkMetadata);

                // Batch insert links
                if (linksToInsert.length > 0) {
                    await db.insertLinks(linksToInsert);
                    
                    // Calculate and update external outlinks counts
                    await db.updatePageExternalOutlinks(pageId, sessionId);
                }

                // Record metrics
                const linkAnalysisTime = Date.now() - linkAnalysisStart;
                if (metricsCollector) {
                    metricsCollector.recordLinkAnalysis(
                        linksToInsert.length,
                        linksToInsert.length,
                        linkAnalysisTime
                    );
                }

                reqLog.debug(`Link analysis: found ${linksToInsert.length} links, inserted ${linksToInsert.length} in ${linkAnalysisTime}ms`);
            }

            // --- Carbon Footprint Calculation ---
            try {
                // 1. Calculate Page Size (Transferred Bytes)
                // We use sizeBytes from pageMetrics (Content-Length or body size)
                const transferredBytes = pageMetrics.sizeBytes || 0;

                // 2. Calculate Total Transferred (Page + Resources)
                // Extract all resource URLs
                const resourceUrls: string[] = [
                    ...resources.css.map(r => r.url),
                    ...resources.js.map(r => r.url),
                    ...resources.images.map(r => r.url)
                    // We define "Transferred" as resources loaded to render the page. 
                    // External links (<a> tags) are NOT loaded, so we exclude them.
                ];

                // Fetch sizes for resources (HTTP HEAD)
                const { totalBytes: resourcesSize } = await fetchResourceSizes(resourceUrls);
                
                const totalTransferredBytes = transferredBytes + resourcesSize;

                // 3. Calculate CO2 and Rating
                const carbonResult = calculateCarbon(totalTransferredBytes);

                // 4. Update Page in DB
                await db.updatePageCarbon(pageId, {
                    transferredBytes,
                    totalTransferredBytes,
                    co2Mg: carbonResult.co2Mg,
                    carbonRating: carbonResult.rating
                });
                
                logger.debug(`Carbon metrics for ${url}: Rating=${carbonResult.rating}, CO2=${carbonResult.co2Mg}mg, Total=${totalTransferredBytes}b`);

            } catch (error) {
                logger.error(`Failed to calculate carbon metrics for ${url}`, error as Error);
            }
        },
        errorHandler: async ({ request, error }) => {
            const warn = `Request failed ${request.url}: ${(error as Error).message}`;
            log.warning(warn);
            onLog?.(warn);

            // Calculate response time for failed request
            const startTime = requestStartTimes.get(request.url) || Date.now();
            const responseTime = Date.now() - startTime;

            // Store failed request data
            await db.insertPage({
                sessionId,
                url: request.url,
                title: 'Request Failed',
                titleLength: 0,
                description: `Error: ${(error as Error).message}`, descriptionLength: 0, contentType: 'Unknown',
                lastModified: null,
                statusCode: 0,
                responseTime: responseTime,
                wordCount: 0,
                sentenceCount: 0,
                averageWordsPerSentence: 0,
                fleschReadingEase: undefined,
                readabilityLevel: undefined,
                textToHtmlRatio: undefined,
                crawlDepth: getCrawlDepthFromRequest(request),
                folderDepth: calculateFolderDepth(request.url),
                timestamp: new Date().toISOString(),
                success: false,
                errorMessage: (error as Error).message
            });

            // Record failed request in metrics
            if (metricsCollector) {
                metricsCollector.recordRequest({
                    url: request.url,
                    statusCode: 0,
                    responseTime: responseTime,
                    timestamp: new Date().toISOString(),
                    success: false,
                    error: (error as Error).message
                });
            }
            onPage?.(request.url);
        },
    });

    // Consume the provided RequestQueue populated above
    await cheerioCrawler.run();

    // Update crawl session with final stats
    const totalPages = await db.getPageCount(sessionId);
    const totalResources = await db.getResourceCount(sessionId);
    const endTime = Date.now();
    const sessionInfo = await db.getCrawlSession(sessionId) as any;
    const startedAtIso: string | null = sessionInfo?.startedAt ?? sessionInfo?.started_at ?? null;
    const startTime = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
    const duration = Math.max(0, Math.floor((endTime - startTime) / 1000));

    // Set status based on whether audits are still running
    const finalStatus = runAudits ? 'auditing' : 'completed';

    await db.updateCrawlSession(sessionId, {
        completedAt: new Date().toISOString(),
        totalPages,
        totalResources,
        duration,
        status: finalStatus
    });

    // Send real-time status update via SSE if status is 'auditing'
    if (finalStatus === 'auditing') {
        // Note: We can't send SSE from here since we don't have access to sendEvent
        // The status will be updated when audits complete
    }

    const totalItems = totalPages + totalResources;
    const doneMsg = `🎉 Crawl complete! Found ${totalItems} items (${totalPages} pages, ${totalResources} resources)`;
    log.info(doneMsg);
    onLog?.(doneMsg);
    onDone?.(totalItems);

    // Post-processing: Resolve target_page_id relationships for link analysis
    if (captureLinkDetails) {
        const postProcessStart = Date.now();
        onLog?.('🔗 Resolving link relationships...');

        try {
            const resolvedCount = await db.resolveTargetPageIds(sessionId);
            const postProcessTime = Date.now() - postProcessStart;

            onLog?.(`✓ Resolved ${resolvedCount} internal link relationships in ${postProcessTime}ms`);

            // Get link statistics
            const linkStats = await db.getLinkStats(sessionId);
            onLog?.(`📊 Link Analysis: ${linkStats.totalLinks} total links (${linkStats.internalLinks} internal, ${linkStats.externalLinks} external)`);

            if (linkStats.linksByPosition && Object.keys(linkStats.linksByPosition).length > 0) {
                const positionStats = Object.entries(linkStats.linksByPosition as Record<string, number>)
                    .map(([pos, count]) => `${pos}: ${count}`)
                    .join(', ');
                onLog?.(`📍 Links by position: ${positionStats}`);
            }

        } catch (error) {
            onLog?.(`⚠️ Link post-processing failed: ${(error as Error).message}`);
            logger.error('Link post-processing failed', error as Error);
        }

        // Calculate Link Scores for all pages
        try {
            const linkScoreMsg = '🔗 Calculating Link Scores...';
            log.info(linkScoreMsg);
            onLog?.(linkScoreMsg);

            await linkScoreService.calculateSessionLinkScores(sessionId);

            const linkScoreStats = await db.getLinkScoreStats(sessionId);
            const linkScoreCompleteMsg = `✅ Link Scores calculated - Avg: ${linkScoreStats.averageLinkScore || 0}, Excellent: ${linkScoreStats.excellentCount || 0}, Weak: ${linkScoreStats.weakCount || 0}`;
            log.info(linkScoreCompleteMsg);
            onLog?.(linkScoreCompleteMsg);
        } catch (err) {
            const linkScoreErrorMsg = `⚠️ Failed to calculate Link Scores: ${(err as Error).message}`;
            logger.error('[linkScore] Failed to calculate link scores', err as Error);
            onLog?.(linkScoreErrorMsg);
        }
    }

    // Post-processing: Near-duplicate content analysis
    try {
        onLog?.('🧠 Calculating near-duplicate content metrics...');
        await analyzeSessionDuplicates(sessionId);
        onLog?.('✅ Near-duplicate content metrics calculated');
    } catch (error) {
        const dupErrorMsg = `⚠️ Failed to calculate near-duplicate metrics: ${(error as Error).message}`;
        logger.error('[duplicates] Failed to calculate near-duplicate metrics', error as Error);
        onLog?.(dupErrorMsg);
    }

    // Clean up the request queue after crawl completion
    try {
        await queue.drop();
        log.info('Request queue cleaned up after crawl completion');
    } catch (error) {
        log.warning('Failed to clean up request queue', error as Error);
    }

    // Run audits if enabled
    if (runAudits) {
        try {
            const auditIntegration = new CrawlAuditIntegration(sessionId);

            // Get crawled URLs for auditing
            const crawledPages = await db.getPages(sessionId);
            const urlsToAudit = crawledPages
                .filter((page: any) => page.success)
                .map((page: any) => page.url);

            const auditMsg = `🔍 Starting performance audits for all ${urlsToAudit.length} crawled URLs (${auditDevice})...`;
            log.info(auditMsg);
            onLog?.(auditMsg);

            if (urlsToAudit.length === 0) {
                const noAuditMsg = 'No valid URLs found for auditing';
                log.info(noAuditMsg);
                onLog?.(noAuditMsg);
            } else {
                onLog?.(`Running audits for ${urlsToAudit.length} URLs...`);

                // Process audits in parallel batches to speed up execution
                // Dynamic batch size based on total URLs for optimal performance
                const totalUrls = urlsToAudit.length;
                let batchSize = 8; // Default for small sites (increased from 3)

                if (totalUrls > 50) {
                    batchSize = 12; // Larger batches for big sites (increased from 5)
                } else if (totalUrls > 20) {
                    batchSize = 10; // Medium batches for medium sites (increased from 4)
                }

                const batches = [];

                for (let i = 0; i < urlsToAudit.length; i += batchSize) {
                    const batch = urlsToAudit.slice(i, i + batchSize);
                    batches.push(batch);
                }

                const setupMsg = `🚀 Processing ${totalUrls} audits in ${batches.length} batches of ${batchSize} (parallel execution)`;
                log.info(setupMsg);
                onLog?.(setupMsg);

                const startTime = Date.now();
                let completedAudits = 0;

                for (const batch of batches) {
                    // Check if audits have been cancelled
                    if (auditCancelled) {
                        const cancelMsg = '🛑 Audit process cancelled by user';
                        log.info(cancelMsg);
                        onLog?.(cancelMsg);
                        break;
                    }

                    // Process batch in parallel
                    const batchPromises = batch.map(async (url: string) => {
                        try {
                            onAuditStart?.(url);
                            const auditResult = await auditIntegration.runAuditForUrl(url, auditDevice);

                            onAuditComplete?.(
                                url,
                                auditResult.success,
                                auditResult.lcp,
                                auditResult.tbt,
                                auditResult.cls,
                                auditResult.performanceScore
                            );

                            if (auditResult.success) {
                                onLog?.(`✓ Audit completed for ${url} - LCP: ${auditResult.lcp ? Math.round(auditResult.lcp) + 'ms' : 'N/A'}, TBT: ${auditResult.tbt ? Math.round(auditResult.tbt) + 'ms' : 'N/A'}, CLS: ${auditResult.cls ? auditResult.cls.toFixed(3) : 'N/A'}`);
                            } else {
                                onLog?.(`✗ Audit failed for ${url}: ${auditResult.error}`);
                            }

                            return { url, success: auditResult.success };
                        } catch (error) {
                            onLog?.(`✗ Audit error for ${url}: ${(error as Error).message}`);
                            onAuditComplete?.(url, false);
                            return { url, success: false };
                        }
                    });

                    // Wait for batch to complete
                    await Promise.all(batchPromises);

                    // Check for cancellation after batch completion
                    if (auditCancelled) {
                        const cancelMsg = '🛑 Audit process cancelled by user';
                        log.info(cancelMsg);
                        onLog?.(cancelMsg);
                        break;
                    }

                    // Update progress tracking
                    completedAudits += batch.length;
                    const batchIndex = batches.indexOf(batch);
                    const progress = Math.round((completedAudits / totalUrls) * 100);
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    const estimatedTotal = Math.round((elapsed / completedAudits) * totalUrls);
                    const remaining = Math.max(0, estimatedTotal - elapsed);

                    const progressMsg = `📊 Progress: ${completedAudits}/${totalUrls} (${progress}%) | Elapsed: ${elapsed}s | ETA: ${remaining}s`;
                    log.info(progressMsg);
                    onLog?.(progressMsg);

                    // Smart delay between batches - shorter delays for better performance
                    if (batchIndex < batches.length - 1) {
                        // Reduce delay based on batch size and progress
                        const baseDelay = batchSize > 10 ? 100 : 200; // Minimal delays (increased from 500/750)
                        const progressDelay = Math.max(50, baseDelay - (batchIndex * 10)); // Minimal decreasing delays (increased from 200)
                        await new Promise(resolve => setTimeout(resolve, progressDelay));
                    }
                }

                // Get and report final audit results
                const totalTime = Math.round((Date.now() - startTime) / 1000);
                const auditsPerMinute = Math.round((totalUrls / totalTime) * 60);

                const auditStats = auditIntegration.getAuditStats();
                const auditResultsMsg = `📊 Audit Results: ${auditStats.successful}/${auditStats.total} successful (${auditStats.successRate.toFixed(1)}% success rate)`;
                log.info(auditResultsMsg);
                onLog?.(auditResultsMsg);

                // Performance summary
                const performanceMsg = `⚡ Performance: ${totalTime}s total | ${auditsPerMinute} audits/min | ${batchSize} parallel`;
                log.info(performanceMsg);
                onLog?.(performanceMsg);

                // Debug: Log batch completion
                log.info(`Batch processing completed: ${batches.length} batches processed`);

                if (auditStats.averageLcp > 0) {
                    onLog?.(`📈 Average LCP: ${Math.round(auditStats.averageLcp)}ms`);
                }
                if (auditStats.averageTbt > 0) {
                    onLog?.(`📈 Average TBT: ${Math.round(auditStats.averageTbt)}ms`);
                }
                if (auditStats.averageCls > 0) {
                    onLog?.(`📈 Average CLS: ${auditStats.averageCls.toFixed(3)}`);
                }

                // Send detailed results to callback
                onAuditResults?.(auditIntegration.getAllAuditResults());

                // Notify that all audits are complete
                onAuditsComplete?.();
            }
        } catch (error) {
            const auditErrorMsg = `❌ Audit execution failed: ${(error as Error).message}`;
            log.error(auditErrorMsg);
            onLog?.(auditErrorMsg);
        }
    }
}

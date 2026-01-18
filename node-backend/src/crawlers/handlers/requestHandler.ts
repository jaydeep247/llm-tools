/**
 * Request Handler Module
 * Handles per-page processing during crawl
 */

import { Request, CheerioCrawlerOptions } from 'crawlee';
import { CheerioAPI, load } from 'cheerio';
import { createHash } from 'crypto';
import { Logger } from '../../helpers/logging/Logger.js';
import { getDatabase } from '../../services/DatabaseService.js';
import { MetricsCollector } from '../../controllers/module_D/monitoring/MetricsCollector.js';

import { extractPageMetrics } from '../../helpers/module_A/pageMetrics/index.js';
import { extractContentMetrics } from '../../helpers/module_A/contentAnalysis/index.js';
import { extractLinksForCrawling, isValidHttpLink } from '../../helpers/module_A/linkExtractor/index.js';
import { collectPageResources } from '../../helpers/module_A/resourceCollector/index.js';
import { analyzeLinkDetails } from '../../helpers/module_A/linkAnalysis/index.js';
import { calculateFolderDepth, getCrawlDepthFromRequest } from '../../helpers/module_A/contentAnalysis/urlDepth.js';
import { createFingerprint } from '../../helpers/module_A/duplicateDetection/index.js';
import { extractLinkMetadata } from '../../utils/linkAnalyzer.js';
import { canonicalizeUrl, isSameSite } from '../../utils/url.js';

import { markSitemapUrlAsCrawled, calculatePageCarbonFootprint } from '../modules/module_D/index.js';
import { enqueueSeoIfEligible } from '../modules/module_B/index.js';

import type { CrawlEvents } from '../types/index.js';

const logger = Logger.getInstance();

interface RequestHandlerContext {
    sessionId: number;
    allowedHost: string;
    allowSubdomains: boolean;
    denyParamPrefixes?: string[];
    captureLinkDetails: boolean;
    events: CrawlEvents;
    metricsCollector?: MetricsCollector;
    requestStartTimes: Map<string, number>;
    emittedCss: Set<string>;
    emittedJs: Set<string>;
    emittedImg: Set<string>;
    emittedExternal: Set<string>;
    crawledPagesWithHtml?: Array<{ id: number; url: string; htmlContent: string }>;
}

/**
 * Generate SHA-256 hash of normalized page content
 * Hashes the visible text content for change detection and duplicate identification
 */
function generateContentHash(text: string): string {
    const normalized = text
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    return createHash('sha256').update(normalized).digest('hex');
}

export function createRequestHandler(context: RequestHandlerContext): CheerioCrawlerOptions['requestHandler'] {
    return async ({ request, $, enqueueLinks, log: reqLog, response }) => {
        const { 
            sessionId, allowedHost, allowSubdomains, denyParamPrefixes,
            captureLinkDetails, events, metricsCollector, requestStartTimes,
            emittedCss, emittedJs, emittedImg, emittedExternal, crawledPagesWithHtml
        } = context;
        const { url } = request;
        const db = getDatabase();

        // Handle HTTP errors
        if (response?.statusCode && response.statusCode >= 400) {
            const errorMsg = `Skipping ${url} due to status ${response.statusCode}`;
            reqLog.debug(errorMsg);
            events.onLog?.(errorMsg);
            await db.insertPage({
                sessionId, url,
                title: 'Request Failed',
                titleLength: 0,
                description: `HTTP ${response.statusCode} Error`,
                descriptionLength: 0,
                contentType: response?.headers?.['content-type'] || 'Unknown',
                lastModified: null,
                statusCode: response.statusCode,
                responseTime: 0,
                wordCount: 0, sentenceCount: 0, averageWordsPerSentence: 0,
                crawlDepth: getCrawlDepthFromRequest(request),
                folderDepth: calculateFolderDepth(url),
                timestamp: new Date().toISOString(),
                success: false,
                errorMessage: `HTTP ${response.statusCode} Error`
            });
            events.onPage?.(url);
            return;
        }

        // Extract metrics
        const startTime = requestStartTimes.get(url) || Date.now();
        const responseTime = Date.now() - startTime;
        const enhancedResponse = { ...response, url: response?.url || request.loadedUrl || url };
        const pageMetrics = await extractPageMetrics(request.url, $, enhancedResponse, responseTime);
        const contentMetrics = extractContentMetrics($);
        
        // Extract visible text for content hashing
        const $clone = load($.html());
        $clone('script, style, noscript, meta, link, head').remove();
        const visibleText = $clone('body').text().trim();
        
        const crawlDepth = getCrawlDepthFromRequest(request);
        const folderDepth = calculateFolderDepth(url);

        // Insert page
        const pageId = await db.insertPage({
            sessionId, url,
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
            wordCount: contentMetrics.visibleWordCount,
            sentenceCount: contentMetrics.sentenceCount,
            averageWordsPerSentence: contentMetrics.averageSentenceLength,
            fleschReadingEase: contentMetrics.fleschReadingEase,
            readabilityLevel: contentMetrics.readabilityLevel,
            textToHtmlRatio: contentMetrics.textToHtmlRatio,
            crawlDepth, folderDepth,
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
            httpVersion: pageMetrics.httpVersion,
            // URL Encoded Address: percent-encoded version of the URL
            urlEncodedAddress: encodeURI(url),
            // Content Hash: SHA-256 hash of normalized page content for change detection and duplicate identification
            contentHash: generateContentHash(visibleText)
        });

        // Store page HTML in cache for semantic analysis
        if (crawledPagesWithHtml) {
            crawledPagesWithHtml.push({
                id: pageId,
                url,
                htmlContent: $.html()
            });
        }

        // Create fingerprint
        try {
            const fingerprint = createFingerprint($, pageId, sessionId, url, false);
            await db.upsertContentFingerprint(fingerprint);
        } catch (error) {
            logger.error(`Failed to create content fingerprint for ${url}`, error as Error);
        }

        // Mark sitemap and enqueue SEO
        await markSitemapUrlAsCrawled(sessionId, url);
        events.onPage?.(url);
        await enqueueSeoIfEligible(url, sessionId, allowedHost, pageMetrics.contentType, contentMetrics.visibleWordCount);

        // Record metrics
        if (metricsCollector) {
            metricsCollector.recordRequest({
                url,
                statusCode: response?.statusCode || 200,
                responseTime,
                timestamp: new Date().toISOString(),
                success: true
            });
        }

        logger.debug('Page processed', { url, responseTime });

        // Extract and enqueue links
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
                    if (!isSameSite(req.url, allowedHost, allowSubdomains)) return null;
                    const currentDepth = getCrawlDepthFromRequest(request);
                    req.userData = { ...req.userData, depth: currentDepth + 1 };
                    return req;
                }
            });
        }

        // Collect resources
        const resources = collectPageResources($, {
            sessionId, pageId,
            baseUrl: url,
            allowedHost,
            allowSubdomains,
            emittedCss, emittedJs, emittedImg, emittedExternal
        }, isValidHttpLink, isSameSite);

        for (const resource of [...resources.css, ...resources.js, ...resources.images, ...resources.external]) {
            await db.upsertResource(resource);
        }

        // Optional: detailed link analysis
        if (captureLinkDetails) {
            const linkAnalysisStart = Date.now();
            const linksToInsert = analyzeLinkDetails($, {
                sessionId, sourcePageId: pageId, sourceUrl: url,
                allowedHost, allowSubdomains
            }, isValidHttpLink, isSameSite, extractLinkMetadata);

            if (linksToInsert.length > 0) {
                await db.insertLinks(linksToInsert);
                await db.updatePageExternalOutlinks(pageId, sessionId);
            }

            if (metricsCollector) {
                metricsCollector.recordLinkAnalysis(linksToInsert.length, linksToInsert.length, Date.now() - linkAnalysisStart);
            }

            reqLog.debug(`Link analysis: found ${linksToInsert.length} links`);
        }

        // Calculate carbon
        await calculatePageCarbonFootprint(pageId, url, pageMetrics.sizeBytes || 0, resources);
    };
}

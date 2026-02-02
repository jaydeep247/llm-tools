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
import { CRAWL_COMPLETION_TIMEOUT_MS, CRAWL_COMPLETION_TIMEOUT_HOURS } from '../../config/appConfig.js';

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

        // Check for cancellation at the start of each request
        const { getCancellationManager } = await import('../../services/crawlCancellationManager.js');
        const cancellationManager = getCancellationManager();
        if (cancellationManager.isCancelled(sessionId)) {
            reqLog.info(`[requestHandler] Request ${url} skipped - session ${sessionId} cancelled`);
            return; // Skip processing this request
        }

        // Check crawl completion timeout (session running longer than CRAWL_COMPLETION_TIMEOUT_HOURS)
        const session = await db.getCrawlSession(sessionId);
        if (session?.startedAt) {
            const startedAt = typeof session.startedAt === 'string' ? new Date(session.startedAt).getTime() : (session.startedAt as Date).getTime();
            const elapsed = Date.now() - startedAt;
            if (elapsed >= CRAWL_COMPLETION_TIMEOUT_MS) {
                reqLog.info(`[requestHandler] Session ${sessionId} timed out after ${(elapsed / 3600000).toFixed(1)}h`);
                events.onLog?.(`⏱ Crawl timed out (exceeded ${CRAWL_COMPLETION_TIMEOUT_HOURS} hour limit)`);
                await cancellationManager.timeoutCrawl(sessionId, CRAWL_COMPLETION_TIMEOUT_HOURS);
                return;
            }
        }

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

        // Update title and meta description detection (missing and duplicate detection)
        // Note: Duplicate detection will be more accurate after all pages are crawled,
        // but we update incrementally for immediate feedback
        try {
            await db.pages.updateTitleDetection(pageId, sessionId, pageMetrics.title);
            await db.pages.updateMetaDescriptionDetection(pageId, sessionId, pageMetrics.metaDescription);
        } catch (error) {
            // Log but don't fail the crawl if detection fails
            logger.warn(`Failed to update title/meta description detection for page ${pageId}: ${error}`);
        }

        // Extract and validate canonical URL
        // This is done asynchronously to avoid blocking the crawl
        try {
            const { extractAndValidateCanonical } = await import('../../helpers/module_A/canonicalValidation/canonicalValidationService.js');
            const canonicalResult = await extractAndValidateCanonical($, url);
            
            await db.pages.updateCanonicalValidation(
                pageId,
                sessionId,
                canonicalResult.canonicalUrl,
                canonicalResult.validationStatus,
                canonicalResult.validationMessage
            );
        } catch (error) {
            // Log but don't fail the crawl if canonical validation fails
            logger.warn(`Failed to validate canonical for page ${pageId}: ${error}`);
        }

        // Save table extraction data
        try {
            const tableData = pageMetrics.tables;
            if (tableData) {
                await db.pages.updateTableExtraction(
                    pageId,
                    sessionId,
                    tableData.tableCount,
                    JSON.stringify(tableData),
                    tableData.hasTables
                );
            }
        } catch (error) {
            // Log but don't fail the crawl if table extraction save fails
            logger.warn(`Failed to save table extraction data for page ${pageId}: ${error}`);
        }

        // Save FAQ extraction data
        try {
            const faqData = pageMetrics.faqs;
            if (faqData) {
                await db.pages.updateFaqExtraction(
                    pageId,
                    sessionId,
                    faqData.faqCount,
                    JSON.stringify(faqData),
                    faqData.hasFaqs,
                    faqData.faqScore,
                    faqData.detectionMethod || null,
                    faqData.faqSchemaPresent
                );
            }
        } catch (error) {
            // Log but don't fail the crawl if FAQ extraction save fails
            logger.warn(`Failed to save FAQ extraction data for page ${pageId}: ${error}`);
        }

        // Save mixed content detection data
        try {
            const mixedContentData = pageMetrics.mixedContent;
            if (mixedContentData) {
                await db.pages.updateMixedContentDetection(
                    pageId,
                    sessionId,
                    mixedContentData.hasMixedContent,
                    mixedContentData.severity || null,
                    JSON.stringify(mixedContentData),
                    mixedContentData.activeMixedContentCount,
                    mixedContentData.passiveMixedContentCount,
                    mixedContentData.totalInsecureResources
                );
            }
        } catch (error) {
            // Log but don't fail the crawl if mixed content detection save fails
            logger.warn(`Failed to save mixed content detection data for page ${pageId}: ${error}`);
        }

        // Save header structure, viewport, and structured data
        try {
            const headerStructure = pageMetrics.headerStructureMapping;
            const viewportMeta = pageMetrics.viewportMeta;
            const structuredDataDetection = pageMetrics.structuredDataDetection;
            const structuredDataTypeId = pageMetrics.structuredDataTypeIdentification;

            await db.pages.updateSeoStructureData(
                pageId,
                sessionId,
                headerStructure ? JSON.stringify(headerStructure) : null,
                headerStructure && headerStructure.issues.length > 0 ? JSON.stringify(headerStructure.issues) : null,
                viewportMeta ? viewportMeta.present : null,
                viewportMeta ? viewportMeta.content : null,
                viewportMeta ? viewportMeta.status : null,
                structuredDataDetection ? structuredDataDetection.present : null,
                structuredDataDetection ? structuredDataDetection.format : null,
                structuredDataTypeId && structuredDataTypeId.types.length > 0 ? JSON.stringify(structuredDataTypeId.types) : null,
                structuredDataTypeId ? structuredDataTypeId.priorityType : null
            );
        } catch (error) {
            // Log but don't fail the crawl if SEO structure data save fails
            logger.warn(`Failed to save SEO structure data for page ${pageId}: ${error}`);
        }

        // Save word count analysis
        try {
            const wordCount = pageMetrics.wordCount;
            if (wordCount) {
                // Check for duplicate content by comparing content hash with other pages in session
                // Use proper content normalization from wordCountExtractor
                let duplicateContent = false;
                let duplicateWithUrls: string[] = [];
                
                try {
                    // Check for duplicate content by comparing content hash
                    // Use the content hash that was stored in the pages table for consistency
                    const pageResult = await db.pages.getPageById(pageId);
                    if (pageResult?.contentHash) {
                        // Find other pages in the same session with the same content hash
                        // The content_hash in pages table is generated using visible text extraction
                        // (removing script, style, noscript, meta, link, head, then getting body text)
                        // and then normalized (lowercase, whitespace normalization) before hashing
                        const duplicatePages = await db.pages.getPagesByContentHash(
                            pageResult.contentHash,
                            sessionId,
                            pageId // Exclude current page
                        );
                        
                        if (duplicatePages.length > 0) {
                            duplicateContent = true;
                            duplicateWithUrls = duplicatePages.map(p => p.url);
                        }
                    }
                } catch (dupError) {
                    // Log but don't fail - duplicate detection is optional
                    logger.debug(`Could not check for duplicate content for page ${pageId}: ${dupError}`);
                }
                
                await db.pages.updateWordCountAnalysis(
                    pageId,
                    sessionId,
                    {
                        totalWordCount: wordCount.totalWordCount,
                        visibleWordCount: wordCount.visibleWordCount,
                        uniqueWordCount: wordCount.uniqueWordCount,
                        textToHtmlRatio: wordCount.textToHtmlRatio,
                        sentenceCount: wordCount.sentenceCount,
                        paragraphCount: wordCount.paragraphCount,
                        averageSentenceLength: wordCount.averageSentenceLength,
                        averageParagraphLength: wordCount.averageParagraphLength,
                        keywordDensity: wordCount.keywordDensity,
                        thinContent: wordCount.thinContent,
                        thinContentReason: wordCount.thinContentReason,
                        duplicateContent: duplicateContent,
                        duplicateWithUrls: duplicateWithUrls,
                        sectionWordCountMapping: wordCount.sectionWordCountMapping,
                        sectionWordCountBreakdown: wordCount.sectionWordCountBreakdown,
                        headingWordCountMapping: wordCount.headingWordCountMapping
                    }
                );
            }
        } catch (error) {
            // Log but don't fail the crawl if word count save fails
            logger.warn(`Failed to save word count analysis for page ${pageId}: ${error}`);
        }

        // Save page size measurements
        try {
            const pageSizeMeasurement = pageMetrics.pageSizeMeasurement;
            if (pageSizeMeasurement) {
                await db.pages.updatePageSizeMeasurements(
                    pageId,
                    sessionId,
                    pageSizeMeasurement.pageSizeBytes,
                    pageSizeMeasurement.pageSizeStatus,
                    pageSizeMeasurement.htmlSizeBytes,
                    pageSizeMeasurement.htmlSizeStatus,
                    pageSizeMeasurement.totalResourceSizeBytes,
                    pageSizeMeasurement.resourceSizeBreakdown ? JSON.stringify(pageSizeMeasurement.resourceSizeBreakdown) : null
                );
            }
        } catch (error) {
            // Log but don't fail the crawl if page size measurement save fails
            logger.warn(`Failed to save page size measurements for page ${pageId}: ${error}`);
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
            // Check for cancellation before enqueueing new links
            if (cancellationManager.isCancelled(sessionId)) {
                reqLog.info(`[requestHandler] Skipping link enqueueing - session ${sessionId} cancelled`);
                return;
            }

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

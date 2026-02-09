/**
 * Post-Processing Pipeline Module
 * Executes link analysis, scoring, and audit processing
 */

import { log } from 'crawlee';
import { Logger } from '../../helpers/logging/Logger.js';
import { getDatabase } from '../../services/DatabaseService.js';
import { runLinkAnalysis, calculateLinkScores, calculateDuplicateMetrics, runAuditProcessing } from '../modules/module_A/index.js';
import { orchestrateSemanticAnalysis } from '../../helpers/module_A/semanticAnalysis/orchestrator.js';
import type { CrawlEvents } from '../types/index.js';

const logger = Logger.getInstance();

export async function executePostProcessing(
    sessionId: number,
    captureLinkDetails: boolean,
    runAudits: boolean,
    auditDevice: string | 'desktop' | 'mobile',
    events: CrawlEvents,
    crawledPagesWithHtml?: Array<{ id: number; url: string; htmlContent: string }>
): Promise<void> {
    const db = getDatabase();

    // Run link analysis and scoring
    await runLinkAnalysis(sessionId, captureLinkDetails, events);
    await calculateLinkScores(sessionId, events);
    await calculateDuplicateMetrics(sessionId, events);

    // Batch update title and meta description detection for all pages in the session
    // This ensures accurate duplicate detection after all pages are crawled
    try {
        logger.info(`[Detection] Starting batch title and meta description detection for session ${sessionId}`);
        events.onLog?.('[📝 Detection] Analyzing page titles and meta descriptions for missing and duplicates...');
        
        // Use the combined batch update method for efficiency
        await db.pages.batchUpdateAllDetections(sessionId);
        
        events.onLog?.('[📝 Detection] ✓ Title and meta description detection complete');
    } catch (error) {
        logger.warn(`[Detection] Title and meta description detection failed for session ${sessionId}:`, error as Error);
        events.onLog?.('[⚠️ Detection] Warning: Detection could not be completed');
        // Don't throw - detection is optional and shouldn't break the pipeline
    }

    // Run semantic analysis (Module A - Semantic Similarity)
    try {
        logger.info(`[SemanticAnalysis] Starting semantic analysis for session ${sessionId}`);
        events.onLog?.('[🧠 Semantic Analysis] Analyzing page content similarity and relevance...');
        
        await orchestrateSemanticAnalysis(db.pages, sessionId, crawledPagesWithHtml);
        
        events.onLog?.('[🧠 Semantic Analysis] ✓ Semantic analysis complete');
    } catch (error) {
        logger.warn(`[SemanticAnalysis] Semantic analysis failed for session ${sessionId}:`, error as Error);
        events.onLog?.(`[⚠️ Semantic Analysis] Warning: Semantic analysis could not be completed`);
        // Don't throw - semantic analysis is optional and shouldn't break the pipeline
    }

    // Run audits if requested
    await runAuditProcessing(sessionId, runAudits, auditDevice as 'desktop' | 'mobile', events);
}

export async function finalizeSession(
    sessionId: number,
    runAudits: boolean,
    events: CrawlEvents,
    duration?: number
): Promise<void> {
    const db = getDatabase();
    // Use provided duration (calculated at exact crawl completion) or fallback to 0
    const finalDuration = duration ?? 0;

    const totalPages = await db.getPageCount(sessionId);
    const totalResources = await db.getResourceCount(sessionId);

    // Get current status from database - runAuditProcessing already set it correctly
    // If audits ran, it set status to 'auditing' if URLs exist, or 'completed' if no URLs
    // If audits didn't run, status is still 'running'
    const currentSession = await db.getCrawlSession(sessionId) as any;
    
    // Never change cancelled status - cancelled sessions should always remain cancelled
    if (currentSession?.status === 'cancelled') {
        log.info(`[finalizeSession] Session ${sessionId} is cancelled - preserving cancelled status`);
        events.onLog?.('🛑 Session was cancelled - status preserved');
        return; // Don't update status or other fields for cancelled sessions
    }
    
    let finalStatus: 'auditing' | 'completed' = 'completed';
    
    if (runAudits) {
        // runAuditProcessing already checked URLs and set status correctly
        // Use the current status from database (should be 'auditing' if URLs exist, 'completed' if no URLs)
        finalStatus = (currentSession?.status === 'auditing') ? 'auditing' : 'completed';
    } else {
        finalStatus = 'completed';
    }

    await db.updateCrawlSession(sessionId, {
        completedAt: new Date().toISOString(),
        totalPages,
        totalResources,
        duration: finalDuration,
        status: finalStatus
    });

    const totalItems = totalPages + totalResources;
    const doneMsg = `🎉 Crawl complete! Found ${totalItems} items (${totalPages} pages, ${totalResources} resources)`;
    log.info(doneMsg);
    events.onLog?.(doneMsg);
    events.onDone?.(totalItems);
}

/**
 * Process existing session data (for reused sessions)
 * Runs all post-processing operations on existing pages from database
 */
export async function processExistingSessionData(
    sessionId: number,
    startUrl: string,
    captureLinkDetails: boolean,
    runAudits: boolean,
    auditDevice: 'desktop' | 'mobile',
    events: CrawlEvents
): Promise<void> {
    const db = getDatabase();
    const logger = Logger.getInstance();

    try {
        logger.info(`[PostProcessing] Processing existing session data for session ${sessionId}`);
        events.onLog?.('📊 Processing existing crawl data...');

        // Get all pages from existing session
        const existingPages = await db.getPages(sessionId, 100000, 0);
        
        if (!existingPages || existingPages.length === 0) {
            logger.warn(`[PostProcessing] No pages found for session ${sessionId}`);
            events.onLog?.('⚠️ No pages found in existing session');
            return;
        }

        logger.info(`[PostProcessing] Found ${existingPages.length} pages to process`);
        events.onLog?.(`📄 Processing ${existingPages.length} existing pages...`);

        // Extract host from startUrl for SEO queue initialization
        const host = new URL(startUrl).hostname;

        // Initialize SEO queue for this session (reuse existing sessionId)
        try {
            const { initializeSeoQueue } = await import('../modules/module_B/index.js');
            await initializeSeoQueue(startUrl, sessionId, events);
        } catch (error) {
            logger.warn(`[PostProcessing] Failed to initialize SEO queue:`, error as Error);
        }

        // Enqueue existing pages to SEO queue for processing
        const { enqueueSeoIfEligible } = await import('../modules/module_B/index.js');
        let enqueuedCount = 0;
        for (const page of existingPages) {
            if (page.success && page.contentType && page.wordCount) {
                try {
                    await enqueueSeoIfEligible(
                        page.url,
                        sessionId,
                        host,
                        page.contentType,
                        page.wordCount
                    );
                    enqueuedCount++;
                } catch (error) {
                    logger.debug(`[PostProcessing] Failed to enqueue ${page.url}:`, error as Error);
                }
            }
        }

        if (enqueuedCount > 0) {
            logger.info(`[PostProcessing] Enqueued ${enqueuedCount} pages to SEO queue`);
            events.onLog?.(`✓ Enqueued ${enqueuedCount} pages for SEO extraction`);
        }

        // Run full post-processing pipeline on existing data
        // This will process link analysis, semantic analysis, etc.
        await executePostProcessing(
            sessionId,
            captureLinkDetails,
            runAudits,
            auditDevice,
            events,
            undefined // No HTML content available for reused sessions
        );

        logger.info(`[PostProcessing] Completed processing existing session data for session ${sessionId}`);
        events.onLog?.('✓ Finished processing existing crawl data');
    } catch (error) {
        logger.error(`[PostProcessing] Failed to process existing session data:`, error as Error);
        events.onLog?.(`⚠️ Error processing existing data: ${(error as Error).message}`);
        // Don't throw - allow reuse to continue even if post-processing fails
    }
}

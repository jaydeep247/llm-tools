/**
 * Post-Processing Pipeline Module
 * Executes link analysis, scoring, and audit processing
 */

import { log } from 'crawlee';
import { Logger } from '../../helpers/logging/Logger.js';
import { getDatabase } from '../../services/DatabaseService.js';
import { runLinkAnalysis, calculateLinkScores, calculateDuplicateMetrics, runAuditProcessing } from '../modules/module_A/index.js';
import type { CrawlEvents } from '../types/index.js';

const logger = Logger.getInstance();

export async function executePostProcessing(
    sessionId: number,
    captureLinkDetails: boolean,
    runAudits: boolean,
    auditDevice: string | 'desktop' | 'mobile',
    events: CrawlEvents
): Promise<void> {
    const db = getDatabase();

    // Run link analysis and scoring
    await runLinkAnalysis(sessionId, captureLinkDetails, events);
    await calculateLinkScores(sessionId, events);
    await calculateDuplicateMetrics(sessionId, events);

    // Run audits if requested
    await runAuditProcessing(sessionId, runAudits, auditDevice as 'desktop' | 'mobile', events);
}

export async function finalizeSession(
    sessionId: number,
    runAudits: boolean,
    events: CrawlEvents
): Promise<void> {
    const db = getDatabase();
    const endTime = Date.now();

    const totalPages = await db.getPageCount(sessionId);
    const totalResources = await db.getResourceCount(sessionId);
    
    const sessionInfo = await db.getCrawlSession(sessionId) as any;
    const startedAtIso: string | null = sessionInfo?.startedAt ?? sessionInfo?.started_at ?? null;
    const startTime = startedAtIso ? new Date(startedAtIso).getTime() : Date.now();
    const duration = Math.max(0, Math.floor((endTime - startTime) / 1000));

    const finalStatus = runAudits ? 'auditing' : 'completed';

    await db.updateCrawlSession(sessionId, {
        completedAt: new Date().toISOString(),
        totalPages,
        totalResources,
        duration,
        status: finalStatus
    });

    const totalItems = totalPages + totalResources;
    const doneMsg = `🎉 Crawl complete! Found ${totalItems} items (${totalPages} pages, ${totalResources} resources)`;
    log.info(doneMsg);
    events.onLog?.(doneMsg);
    events.onDone?.(totalItems);
}

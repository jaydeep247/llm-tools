/**
 * Module A - Audit Management
 * Handles audit control, execution, and reporting
 */

import { log } from 'crawlee';
import { Logger } from '../../../helpers/logging/Logger.js';
import { getDatabase } from '../../../services/DatabaseService.js';
import { CrawlAuditIntegration } from '../../../services/module_A/audits/CrawlAuditIntegration.js';
import type { CrawlEvents } from '../../types/index.js';

const logger = Logger.getInstance();
let auditCancelled = false;

export function cancelAudits(): void {
    auditCancelled = true;
}

export function resetAuditCancellation(): void {
    auditCancelled = false;
}

export async function runAuditProcessing(
    sessionId: number,
    runAudits: boolean,
    auditDevice: 'mobile' | 'desktop',
    events: CrawlEvents
): Promise<void> {
    const { onLog, onAuditStart, onAuditComplete, onAuditResults, onAuditsComplete } = events;
    const db = getDatabase();

    if (!runAudits) {
        return;
    }

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
            return;
        }

        onLog?.(`Running audits for ${urlsToAudit.length} URLs...`);

        // Dynamic batch size based on total URLs
        const totalUrls = urlsToAudit.length;
        let batchSize = 8;

        if (totalUrls > 50) {
            batchSize = 12;
        } else if (totalUrls > 20) {
            batchSize = 10;
        }

        const batches = [];
        for (let i = 0; i < urlsToAudit.length; i += batchSize) {
            const batch = urlsToAudit.slice(i, i + batchSize);
            batches.push(batch);
        }

        const setupMsg = `🚀 Processing ${totalUrls} audits in ${batches.length} batches of ${batchSize} (parallel execution)`;
        await db.updateCrawlSession(sessionId, { status: 'auditing' });

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

            await Promise.all(batchPromises);

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

            // Minimal delay between batches
            if (batchIndex < batches.length - 1) {
                const baseDelay = batchSize > 10 ? 100 : 200;
                const progressDelay = Math.max(50, baseDelay - (batchIndex * 10));
                await new Promise(resolve => setTimeout(resolve, progressDelay));
            }
        }

        // Report final results
        const totalTime = Math.round((Date.now() - startTime) / 1000);
        const auditsPerMinute = Math.round((totalUrls / totalTime) * 60);

        const auditStats = auditIntegration.getAuditStats();
        const auditResultsMsg = `📊 Audit Results: ${auditStats.successful}/${auditStats.total} successful (${auditStats.successRate.toFixed(1)}% success rate)`;
        log.info(auditResultsMsg);
        onLog?.(auditResultsMsg);

        const performanceMsg = `⚡ Performance: ${totalTime}s total | ${auditsPerMinute} audits/min | ${batchSize} parallel`;
        log.info(performanceMsg);
        onLog?.(performanceMsg);

        if (auditStats.averageLcp > 0) {
            onLog?.(`📈 Average LCP: ${Math.round(auditStats.averageLcp)}ms`);
        }
        if (auditStats.averageTbt > 0) {
            onLog?.(`📈 Average TBT: ${Math.round(auditStats.averageTbt)}ms`);
        }
        if (auditStats.averageCls > 0) {
            onLog?.(`📈 Average CLS: ${auditStats.averageCls.toFixed(3)}`);
        }

        onAuditResults?.(auditIntegration.getAllAuditResults());
        onAuditsComplete?.();
    } catch (error) {
        const auditErrorMsg = `❌ Audit execution failed: ${(error as Error).message}`;
        log.error(auditErrorMsg);
        onLog?.(auditErrorMsg);
    }
}

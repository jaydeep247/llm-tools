/**
 * Module A - Audit Management
 * Handles audit control, execution, and reporting using Redis queue for parallel processing
 */

import { log } from 'crawlee';
import { Logger } from '../../../helpers/logging/Logger.js';
import { getDatabase } from '../../../services/DatabaseService.js';
import { CrawlAuditIntegration } from '../../../services/module_A/audits/CrawlAuditIntegration.js';
import {
    initAuditQueue,
    enqueueAudits,
    getAuditQueueStats,
    areAuditsComplete,
    type AuditJob
} from '../../../services/module_A/audits/audit-redis-queue.js';
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
        // Initialize Redis queue for this session
        await initAuditQueue(sessionId);

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
            
            // Update status back to completed since no audits will run
            await db.updateCrawlSession(sessionId, { status: 'completed' });
            
            // Call onAuditsComplete to signal that audit processing is done (even though no audits ran)
            onAuditsComplete?.();
            
            return;
        }

        onLog?.(`Running audits for ${urlsToAudit.length} URLs using Redis queue for parallel processing...`);

        // Create audit jobs
        const auditJobs: AuditJob[] = urlsToAudit.map(url => ({
            url,
            sessionId,
            device: auditDevice,
            addedAt: new Date().toISOString()
        }));

        // Enqueue all jobs to Redis
        const enqueued = await enqueueAudits(auditJobs);

        const setupMsg = `🚀 Queued ${enqueued}/${urlsToAudit.length} audits to Redis queue (parallel workers will process them)`;
        await db.updateCrawlSession(sessionId, { status: 'auditing' });

        log.info(setupMsg);
        onLog?.(setupMsg);

        // Poll for completion (audit workers are processing in background)
        const startTime = Date.now();
        let lastStats = { totalQueued: enqueued, processing: 0, completed: 0, failed: 0 };
        let lastProgressLog = Date.now();

        // Monitor queue progress until complete
        while (!auditCancelled) {
            const stats = await getAuditQueueStats(sessionId);

            // Log progress periodically (every 5 seconds)
            if (Date.now() - lastProgressLog > 5000) {
                const progress = stats.totalQueued === 0 ? 100 : Math.round((stats.completed / (stats.totalQueued + stats.completed + stats.failed)) * 100);
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                
                const progressMsg = `📊 Queue Progress: ${stats.completed} completed, ${stats.processing} processing, ${stats.totalQueued} queued (${progress}%) | Elapsed: ${elapsed}s`;
                log.info(progressMsg);
                onLog?.(progressMsg);
                lastProgressLog = Date.now();
            }

            // Check if all audits are complete
            if (await areAuditsComplete(sessionId)) {
                const totalTime = Math.round((Date.now() - startTime) / 1000);
                const auditsPerMinute = stats.completed > 0 ? Math.round((stats.completed / totalTime) * 60) : 0;

                const auditIntegration = new CrawlAuditIntegration(sessionId);
                const auditStats = auditIntegration.getAuditStats();
                const successRate = stats.completed > 0 ? ((stats.completed / (stats.completed + stats.failed)) * 100).toFixed(1) : '0.0';

                const auditResultsMsg = `📊 Audit Results: ${stats.completed}/${stats.completed + stats.failed} successful (${successRate}% success rate)`;
                log.info(auditResultsMsg);
                onLog?.(auditResultsMsg);

                const performanceMsg = `⚡ Performance: ${totalTime}s total | ${auditsPerMinute} audits/min | Redis queue parallel processing`;
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
                break;
            }

            // Wait before next check
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (auditCancelled) {
            const cancelMsg = '🛑 Audit process cancelled by user';
            log.info(cancelMsg);
            onLog?.(cancelMsg);
        }
    } catch (error) {
        const auditErrorMsg = `❌ Audit execution failed: ${(error as Error).message}`;
        log.error(auditErrorMsg);
        onLog?.(auditErrorMsg);
    }
}

/**
 * Module A - Link Analysis and Post-Processing
 */

import { log } from 'crawlee';
import { Logger } from '../../../helpers/logging/Logger.js';
import { getDatabase } from '../../../services/DatabaseService.js';
import { linkScoreService } from '../../../services/module_A/LinkScoreService.js';
import { analyzeSessionDuplicates } from '../../../helpers/module_A/duplicateDetection/sessionAnalyzer.js';
import type { CrawlEvents } from '../../types/index.js';

const logger = Logger.getInstance();

export async function runLinkAnalysis(
    sessionId: number,
    captureLinkDetails: boolean,
    events: CrawlEvents
): Promise<void> {
    const { onLog } = events;
    const db = getDatabase();

    if (!captureLinkDetails) {
        return;
    }

    const postProcessStart = Date.now();
    onLog?.('🔗 Resolving link relationships...');

    try {
        // Resolve target page IDs
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
}

export async function calculateLinkScores(
    sessionId: number,
    events: CrawlEvents
): Promise<void> {
    const { onLog } = events;

    try {
        const linkScoreMsg = '🔗 Calculating Link Scores...';
        log.info(linkScoreMsg);
        onLog?.(linkScoreMsg);

        await linkScoreService.calculateSessionLinkScores(sessionId);

        const linkScoreStats = await getDatabase().getLinkScoreStats(sessionId);
        const linkScoreCompleteMsg = `✅ Link Scores calculated - Avg: ${linkScoreStats.averageLinkScore || 0}, Excellent: ${linkScoreStats.excellentCount || 0}, Weak: ${linkScoreStats.weakCount || 0}`;
        log.info(linkScoreCompleteMsg);
        onLog?.(linkScoreCompleteMsg);
    } catch (err) {
        const linkScoreErrorMsg = `⚠️ Failed to calculate Link Scores: ${(err as Error).message}`;
        logger.error('[linkScore] Failed to calculate link scores', err as Error);
        onLog?.(linkScoreErrorMsg);
    }
}

export async function calculateDuplicateMetrics(
    sessionId: number,
    events: CrawlEvents
): Promise<void> {
    const { onLog } = events;

    try {
        onLog?.('🧠 Calculating near-duplicate content metrics...');
        await analyzeSessionDuplicates(sessionId);
        onLog?.('✅ Near-duplicate content metrics calculated');
    } catch (error) {
        const dupErrorMsg = `⚠️ Failed to calculate near-duplicate metrics: ${(error as Error).message}`;
        logger.error('[duplicates] Failed to calculate near-duplicate metrics', error as Error);
        onLog?.(dupErrorMsg);
    }
}

import { Logger } from '../../../logging/Logger.js';
import { getDatabase } from '../../../../services/DatabaseService.js';
import { calculateNearDuplicateMetrics } from './index.js';
import { findSimilarPages } from './similarityCalculator.js';
import { SIMILARITY_THRESHOLDS, type ContentFingerprint, type NearDuplicateMetrics, type SimilarityResult } from './types.js';

const logger = Logger.getInstance();

/**
 * Analyze all pages in a crawl session for near-duplicate content.
 *
 * For each page:
 *  - Finds the closest near-duplicate match (if any)
 *  - Counts how many near-duplicates exist above threshold
 *  - Stores metrics on the `pages` table
 *  - Populates `similarity_index` table for detailed analysis
 */
export async function analyzeSessionDuplicates(sessionId: number): Promise<void> {
    const db = getDatabase();

    logger.info(`[duplicates] Starting near-duplicate analysis for session ${sessionId}`);

    // 1. Load all fingerprints for this session
    const fingerprints: ContentFingerprint[] = await db.getContentFingerprintsBySession(sessionId);

    if (!fingerprints || fingerprints.length < 2) {
        logger.info(`[duplicates] Skipping near-duplicate analysis for session ${sessionId}: not enough pages (${fingerprints.length})`);
        return;
    }

    const threshold = SIMILARITY_THRESHOLDS.NEAR_DUPLICATE;

    // 2. Clear previous similarity index entries for this session
    await db.clearSimilarityIndexForSession(sessionId);

    // 3. Compute metrics and similarity index entries in-memory
    const pageMetrics = new Map<number, NearDuplicateMetrics>();
    const similarityResults: SimilarityResult[] = [];

    for (const current of fingerprints) {
        const metrics = calculateNearDuplicateMetrics(current, fingerprints, threshold);
        pageMetrics.set(current.pageId, metrics);

        // Record detailed similarity pairs for this page
        const similar = findSimilarPages(current, fingerprints, threshold);
        similarityResults.push(...similar);
    }

    // 4. Persist metrics and similarity index in bulk
    await db.updatePagesNearDuplicateMetrics(pageMetrics);
    await db.insertSimilarityResults(similarityResults);

    logger.info(
        `[duplicates] Completed near-duplicate analysis for session ${sessionId} (pages=${fingerprints.length}, pairs=${similarityResults.length})`
    );
}



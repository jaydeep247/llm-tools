import { getDatabase } from '../DatabaseService.js';
import { Logger } from '../../helpers/logging/Logger.js';
import { calculateLinkScoresForSession, PageLinkInfo } from '../../utils/linkScoreCalculator.js';

/**
 * Link Score Service
 * Handles calculation and updating of link scores for crawl sessions
 */
export class LinkScoreService {
    private static instance: LinkScoreService;
    private logger: Logger;

    private constructor() {
        this.logger = Logger.getInstance();
    }

    public static getInstance(): LinkScoreService {
        if (!LinkScoreService.instance) {
            LinkScoreService.instance = new LinkScoreService();
        }
        return LinkScoreService.instance;
    }

    /**
     * Calculate and update link scores for all pages in a session
     * Should be called after crawl completion and link resolution
     */
    async calculateSessionLinkScores(sessionId: number): Promise<void> {
        this.logger.info(`Starting Link Score calculation for session ${sessionId}`);
        const db = getDatabase();

        try {
            // Step 1: Ensure target page IDs are resolved
            const resolvedCount = await db.resolveTargetPageIds(sessionId);
            this.logger.info(`Resolved ${resolvedCount} target page IDs for session ${sessionId}`);

            // Step 2: Fetch all page link data
            const pageLinkData = await db.getPageLinkData(sessionId);
            
            if (pageLinkData.length === 0) {
                this.logger.warn(`No pages found for session ${sessionId}, skipping Link Score calculation`);
                return;
            }

            this.logger.info(`Fetched link data for ${pageLinkData.length} pages`);

            // Step 3: Calculate link scores
            const scores = calculateLinkScoresForSession(pageLinkData as PageLinkInfo[], 2);
            
            this.logger.info(`Calculated ${scores.size} link scores`);

            // Step 4: Update database with calculated scores
            await db.updatePageLinkScores(scores);
            
            this.logger.info(`Successfully updated link scores for session ${sessionId}`);

            // Step 5: Log statistics
            const stats = await db.getLinkScoreStats(sessionId);
            this.logger.info(`Link Score Stats for session ${sessionId}:`, stats);

        } catch (error) {
            this.logger.error(`Failed to calculate link scores for session ${sessionId}`, error as Error);
            throw error;
        }
    }

    /**
     * Recalculate link scores for a specific page
     * Useful when links are updated
     */
    async recalculatePageLinkScore(pageId: number, sessionId: number): Promise<number> {
        const db = getDatabase();

        try {
            // Fetch link data for all pages (needed for authority calculation)
            const pageLinkData = await db.getPageLinkData(sessionId);
            
            // Calculate scores for entire session
            const scores = calculateLinkScoresForSession(pageLinkData as PageLinkInfo[], 2);
            
            // Get score for requested page
            const score = scores.get(pageId);
            
            if (score !== undefined) {
                await db.updatePageLinkScore(pageId, score);
                this.logger.info(`Recalculated link score for page ${pageId}: ${score}`);
                return score;
            }

            throw new Error(`Could not calculate score for page ${pageId}`);
        } catch (error) {
            this.logger.error(`Failed to recalculate link score for page ${pageId}`, error as Error);
            throw error;
        }
    }

    /**
     * Get link score statistics for a session
     */
    async getSessionLinkScoreStats(sessionId: number): Promise<any> {
        const db = getDatabase();
        return await db.getLinkScoreStats(sessionId);
    }
}

export const linkScoreService = LinkScoreService.getInstance();

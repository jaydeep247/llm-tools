import { Router } from 'express';
import { getDatabase } from '../database/DatabaseService.js';
import { linkScoreService } from '../services/LinkScoreService.js';
import { getLinkScoreRating, getLinkScoreInsights } from '../utils/linkScoreCalculator.js';

const router = Router();

/**
 * GET /api/link-scores/:sessionId
 * Get link scores for all pages in a session
 */
router.get('/api/link-scores/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { limit = 100, offset = 0, sortBy = 'linkScore', sortOrder = 'desc' } = req.query;

        const db = getDatabase();
        
        // Map frontend field names to database field names
        const fieldMap: Record<string, string> = {
            'linkScore': 'link_score',
            'crawlDepth': 'crawl_depth'
        };
        const dbSortField = fieldMap[sortBy as string] || sortBy as string;
        
        const pages = await db.getPagesWithLinkScores(
            Number(sessionId),
            Number(limit),
            Number(offset),
            dbSortField,
            sortOrder as string
        );
        
        const pagesWithRating = pages.map(row => ({
            ...row,
            linkScore: row.linkScore ? parseFloat(row.linkScore) : null,
            rating: row.linkScore ? getLinkScoreRating(parseFloat(row.linkScore)) : 'N/A'
        }));

        const total = await db.countPagesWithLinkScores(Number(sessionId));

        res.json({
            sessionId: Number(sessionId),
            pages: pagesWithRating,
            total,
            limit: Number(limit),
            offset: Number(offset)
        });
    } catch (error) {
        console.error('Error fetching link scores:', error);
        res.status(500).json({ error: 'Failed to fetch link scores' });
    }
});

/**
 * GET /api/link-scores/:sessionId/stats
 * Get link score statistics for a session
 */
router.get('/api/link-scores/:sessionId/stats', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDatabase();

        const stats = await db.getLinkScoreStats(Number(sessionId));
        const distribution = await db.getLinkScoreDistribution(Number(sessionId));

        res.json({
            sessionId: Number(sessionId),
            stats: {
                ...stats,
                excellentCount: parseInt(stats.excellentCount) || 0,
                goodCount: parseInt(stats.goodCount) || 0,
                fairCount: parseInt(stats.fairCount) || 0,
                weakCount: parseInt(stats.weakCount) || 0,
                veryWeakCount: parseInt(stats.veryWeakCount) || 0,
                notCalculatedCount: parseInt(stats.notCalculatedCount) || 0,
                averageLinkScore: stats.averageLinkScore ? parseFloat(stats.averageLinkScore) : null,
                maxLinkScore: stats.maxLinkScore ? parseFloat(stats.maxLinkScore) : null,
                minLinkScore: stats.minLinkScore ? parseFloat(stats.minLinkScore) : null
            },
            distribution: distribution.map(row => ({
                category: row.category,
                count: parseInt(row.count)
            }))
        });
    } catch (error) {
        console.error('Error fetching link score stats:', error);
        res.status(500).json({ error: 'Failed to fetch link score statistics' });
    }
});

/**
 * GET /api/link-scores/page/:pageId
 * Get detailed link score information for a specific page
 */
router.get('/api/link-scores/page/:pageId', async (req, res) => {
    try {
        const { pageId } = req.params;
        const db = getDatabase();

        const page = await db.getPageWithLinkScore(Number(pageId));

        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        const linkScore = page.linkScore ? parseFloat(page.linkScore) : null;

        // Get inlinks with details
        const inlinks = await db.getLinksByPage(Number(pageId), 'in', 1000);

        // Get outlinks count
        const outlinks = await db.getLinksByPage(Number(pageId), 'out', 1000);

        // Prepare page info for insights
        const pageInfo = {
            pageId: page.pageId,
            url: page.url,
            crawlDepth: page.crawlDepth || 0,
            inlinks: inlinks.map((link: any) => ({
                sourcePageId: link.sourcePageId,
                targetPageId: link.targetPageId,
                position: link.position
            }))
        };

        const insights = linkScore ? getLinkScoreInsights(pageInfo, linkScore) : [];

        res.json({
            page: {
                ...page,
                linkScore,
                rating: linkScore ? getLinkScoreRating(linkScore) : 'N/A'
            },
            inlinks: inlinks.map((link: any) => ({
                ...link,
                anchorText: link.anchorText || '(no anchor text)'
            })),
            outlinks: outlinks.map((link: any) => ({
                ...link,
                anchorText: link.anchorText || '(no anchor text)'
            })),
            counts: {
                inlinks: inlinks.length,
                outlinks: outlinks.length
            },
            insights
        });
    } catch (error) {
        console.error('Error fetching page link score:', error);
        res.status(500).json({ error: 'Failed to fetch page link score details' });
    }
});

/**
 * POST /api/link-scores/:sessionId/calculate
 * Trigger link score calculation for a session
 */
router.post('/api/link-scores/:sessionId/calculate', async (req, res) => {
    try {
        const { sessionId } = req.params;

        await linkScoreService.calculateSessionLinkScores(Number(sessionId));

        const stats = await linkScoreService.getSessionLinkScoreStats(Number(sessionId));

        res.json({
            success: true,
            message: 'Link scores calculated successfully',
            sessionId: Number(sessionId),
            stats
        });
    } catch (error) {
        console.error('Error calculating link scores:', error);
        res.status(500).json({ error: 'Failed to calculate link scores' });
    }
});

/**
 * GET /api/link-scores/:sessionId/top
 * Get top pages by link score
 */
router.get('/api/link-scores/:sessionId/top', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { limit = 10 } = req.query;
        const db = getDatabase();

        const pages = await db.getTopPagesByLinkScore(Number(sessionId), Number(limit));

        const pagesWithRating = pages.map(row => ({
            ...row,
            linkScore: parseFloat(row.linkScore),
            rating: getLinkScoreRating(parseFloat(row.linkScore))
        }));

        res.json({
            sessionId: Number(sessionId),
            pages: pagesWithRating
        });
    } catch (error) {
        console.error('Error fetching top link scores:', error);
        res.status(500).json({ error: 'Failed to fetch top pages by link score' });
    }
});

/**
 * GET /api/link-scores/:sessionId/bottom
 * Get bottom pages by link score (pages that need attention)
 */
router.get('/api/link-scores/:sessionId/bottom', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { limit = 10 } = req.query;
        const db = getDatabase();

        const pages = await db.getBottomPagesByLinkScore(Number(sessionId), Number(limit));

        const pagesWithRating = pages.map(row => ({
            ...row,
            linkScore: parseFloat(row.linkScore),
            rating: getLinkScoreRating(parseFloat(row.linkScore))
        }));

        res.json({
            sessionId: Number(sessionId),
            pages: pagesWithRating
        });
    } catch (error) {
        console.error('Error fetching bottom link scores:', error);
        res.status(500).json({ error: 'Failed to fetch bottom pages by link score' });
    }
});

export default router;

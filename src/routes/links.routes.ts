import { Router } from 'express';
import { getDatabase } from '../database/DatabaseService.js';

const router = Router();

// Get links for a specific page
router.get('/api/links', async (req, res) => {
    try {
        const { sessionId, pageId, type = 'out', limit = 100 } = req.query;

        if (!sessionId || !pageId || isNaN(Number(pageId))) {
            return res.status(400).json({ error: 'sessionId and a valid pageId are required' });
        }

        const db = getDatabase();
        const links = await db.getLinksByPage(
            Number(pageId),
            type as 'in' | 'out',
            Number(limit)
        );

        res.json({
            links,
            count: links.length,
            type,
            pageId: Number(pageId),
            sessionId: Number(sessionId)
        });
    } catch (error) {
        console.error('Error fetching links:', error);
        res.status(500).json({ error: 'Failed to fetch links' });
    }
});

// Get link statistics for a session
router.get('/api/links/stats/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDatabase();

        const stats = await db.getLinkStats(Number(sessionId));
        const pageStats = await db.getPageLinkStats(Number(sessionId));
        const relationships = await db.getLinkRelationships(Number(sessionId), 50);

        // If no data found for this session, try the latest session
        if (stats.totalLinks === 0 && pageStats.length === 0 && relationships.length === 0) {
            const latestSession = await db.getLatestCrawlSession();
            if (latestSession && latestSession.id !== Number(sessionId)) {
                console.log(`No data found for session ${sessionId}, falling back to latest session ${latestSession.id}`);
                const latestStats = await db.getLinkStats(latestSession.id);
                const latestPageStats = await db.getPageLinkStats(latestSession.id);
                const latestRelationships = await db.getLinkRelationships(latestSession.id, 50);

                return res.json({
                    sessionId: latestSession.id,
                    stats: latestStats,
                    pageStats: latestPageStats,
                    relationships: latestRelationships
                });
            }
        }

        res.json({
            sessionId: Number(sessionId),
            stats,
            pageStats,
            relationships
        });
    } catch (error) {
        console.error('Error fetching link stats:', error);
        res.status(500).json({ error: 'Failed to fetch link statistics' });
    }
});

// Get link statistics for the latest session
router.get('/api/links/stats/latest', async (req, res) => {
    try {
        const db = getDatabase();
        const latestSession = await db.getLatestCrawlSession();

        if (!latestSession) {
            return res.status(404).json({ error: 'No crawl sessions found' });
        }

        const stats = await db.getLinkStats(latestSession.id);
        const pageStats = await db.getPageLinkStats(latestSession.id);
        const relationships = await db.getLinkRelationships(latestSession.id, 50);

        res.json({
            sessionId: latestSession.id,
            stats,
            pageStats,
            relationships
        });
    } catch (error) {
        console.error('Error fetching latest link stats:', error);
        res.status(500).json({ error: 'Failed to fetch latest link statistics' });
    }
});

// Get inlinks for a specific page
router.get('/api/pages/:pageId/inlinks', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { limit = 100 } = req.query;

        const db = getDatabase();
        const inlinks = await db.getLinksByPage(Number(pageId), 'in', Number(limit));

        res.json({
            inlinks,
            count: inlinks.length,
            pageId: Number(pageId)
        });
    } catch (error) {
        console.error('Error fetching inlinks:', error);
        res.status(500).json({ error: 'Failed to fetch inlinks' });
    }
});

// Get outlinks for a specific page
router.get('/api/pages/:pageId/outlinks', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { limit = 100 } = req.query;

        const db = getDatabase();
        const outlinks = await db.getLinksByPage(Number(pageId), 'out', Number(limit));

        res.json({
            outlinks,
            count: outlinks.length,
            pageId: Number(pageId)
        });
    } catch (error) {
        console.error('Error fetching outlinks:', error);
        res.status(500).json({ error: 'Failed to fetch outlinks' });
    }
});

// Export links as CSV
router.get('/api/links/export.csv', async (req, res) => {
    try {
        const { sessionId, pageId, type = 'all' } = req.query;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const db = getDatabase();
        let links: any[] = [];

        if (pageId) {
            // Export links for specific page
            links = await db.getLinksByPage(Number(pageId), type as 'in' | 'out', 10000);
        } else {
            // Export all links for session
            links = await db.getAllLinksForSession(Number(sessionId));
        }

        // Convert to CSV
        const headers = [
            'ID', 'Source URL', 'Target URL', 'Anchor Text', 'Position',
            'Internal', 'Rel', 'Nofollow', 'XPath', 'Created At'
        ];

        const csvRows = [
            headers.join(','),
            ...links.map(link => [
                link.id,
                `"${(link.source_url || link.sourceUrl || '').replace(/"/g, '""')}"`,
                `"${(link.target_url || link.targetUrl || '').replace(/"/g, '""')}"`,
                `"${(link.anchor_text || link.anchorText || '').replace(/"/g, '""')}"`,
                `"${(link.position || '').replace(/"/g, '""')}"`,
                link.is_internal || link.isInternal ? 'Yes' : 'No',
                `"${(link.rel || '').replace(/"/g, '""')}"`,
                link.nofollow ? 'Yes' : 'No',
                `"${(link.xpath || '').replace(/"/g, '""')}"`,
                link.created_at || link.createdAt || ''
            ].join(','))
        ];

        const csv = csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="links-${sessionId}${pageId ? `-page-${pageId}` : ''}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting links:', error);
        res.status(500).json({ error: 'Failed to export links' });
    }
});

// Export link relationships as CSV
router.get('/api/links/relationships/export.csv', async (req, res) => {
    try {
        const { sessionId, limit = 1000 } = req.query;

        if (!sessionId) {
            return res.status(400).json({ error: 'sessionId is required' });
        }

        const db = getDatabase();
        const relationships = await db.getLinkRelationships(Number(sessionId), Number(limit));

        // Convert to CSV
        const headers = [
            'Source Page ID', 'Source URL', 'Source Title', 'Target Page ID',
            'Target URL', 'Target Title', 'Link Count', 'Anchor Texts'
        ];

        const csvRows = [
            headers.join(','),
            ...relationships.map(rel => [
                rel.sourcePageId,
                `"${rel.sourceUrl.replace(/"/g, '""')}"`,
                `"${rel.sourceTitle.replace(/"/g, '""')}"`,
                rel.targetPageId,
                `"${rel.targetUrl.replace(/"/g, '""')}"`,
                `"${rel.targetTitle.replace(/"/g, '""')}"`,
                rel.linkCount,
                `"${rel.anchorTexts.join('; ').replace(/"/g, '""')}"`
            ].join(','))
        ];

        const csv = csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="link-relationships-${sessionId}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('Error exporting link relationships:', error);
        res.status(500).json({ error: 'Failed to export link relationships' });
    }
});

export default router;

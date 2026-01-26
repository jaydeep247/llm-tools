import { Router } from 'express';
import { getDatabase } from '../../services/DatabaseService.js';
import { auditRedirect, auditRedirects } from '../../helpers/module_A/redirectsAudit/redirectAuditService.js';
import { authenticateUser } from '../../middleware/authMiddleware.js';

const router = Router();

/**
 * POST /api/audit-checker/check/:sessionId
 * Check redirects for all pages in a session
 */
router.post('/api/audit-checker/check/:sessionId', authenticateUser, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDatabase();
        
        // Get session info
        const session = await db.getCrawlSession(Number(sessionId));
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        // Get all pages for the session
        const pages = await db.getPages(Number(sessionId), 10000, 0);
        
        if (!pages || pages.length === 0) {
            return res.status(404).json({ error: 'No pages found for this session' });
        }

        // Extract URLs
        const urls = pages
            .map(page => page.url)
            .filter((url): url is string => !!url);

        if (urls.length === 0) {
            return res.status(400).json({ error: 'No valid URLs found' });
        }

        // Perform redirect audits
        const auditResults = await auditRedirects(urls);

        // Calculate summary statistics
        const summary = {
            totalChecked: auditResults.length,
            total301Redirects: auditResults.filter(r => r.has301Redirect).length,
            total302Redirects: auditResults.filter(r => r.has302Redirect).length,
            total307Redirects: auditResults.filter(r => r.has307Redirect).length,
            totalRedirectChains: auditResults.filter(r => r.hasRedirectChain).length,
            totalRedirectLoops: auditResults.filter(r => r.hasRedirectLoop).length,
            totalBrokenRedirects: auditResults.filter(r => r.isBrokenRedirect).length,
            totalCanonicalMismatches: auditResults.filter(r => r.canonicalAlignment === 'mismatch').length,
            totalOk: auditResults.filter(r => r.overallStatus === 'ok').length,
            totalWarnings: auditResults.filter(r => r.overallStatus === 'warning').length,
            totalErrors: auditResults.filter(r => r.overallStatus === 'error').length
        };

        res.json({
            success: true,
            sessionId: Number(sessionId),
            summary,
            results: auditResults
        });
    } catch (error: any) {
        console.error('Error checking redirects:', error);
        res.status(500).json({ 
            error: 'Failed to check redirects',
            message: error.message 
        });
    }
});

/**
 * POST /api/audit-checker/check-url
 * Check redirects for a single URL
 */
router.post('/api/audit-checker/check-url', authenticateUser, async (req, res) => {
    try {
        const { url } = req.body;

        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL is required' });
        }

        // Validate URL format
        try {
            new URL(url);
        } catch {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Perform redirect audit
        const result = await auditRedirect(url);

        res.json({
            success: true,
            result
        });
    } catch (error: any) {
        console.error('Error checking redirect:', error);
        res.status(500).json({ 
            error: 'Failed to check redirect',
            message: error.message 
        });
    }
});

export default router;

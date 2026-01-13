import express from 'express';
import { getDatabase } from '../database/DatabaseService.js';
import { authenticateUser } from '../auth/authMiddleware.js';

const router = express.Router();

function getPythonApiBase(): string {
    const base = process.env.PY_API_BASE || 'http://localhost:8000';
    return base.replace(/\/$/, '');
}

router.get('/seo/health', async (_req, res) => {
    try {
        const base = getPythonApiBase();
        const r = await fetch(`${base}/health`);
        const body = await r.text().catch(() => '');
        res.status(r.status).send(body);
    } catch (err) {
        res.status(500).json({ error: 'Python API health check failed', details: (err as Error).message });
    }
});

router.post('/seo/extract', authenticateUser, async (req, res) => {
    try {
        const { url, final_url } = req.body ?? {};

        const finalUrl = url || final_url;
        if (!finalUrl) {
            return res.status(400).json({ error: 'URL is required' });
        }

        // First, try to return cached data
        const db = getDatabase();
        let cachedData = await db.getSeoData(finalUrl);

        // If not found, try toggle trailing slash
        if (!cachedData) {
            const altUrl = finalUrl.endsWith('/') ? finalUrl.slice(0, -1) : finalUrl + '/';
            cachedData = await db.getSeoData(altUrl);
        }

        if (cachedData && !cachedData.isExpired) {
            // Return cached data
            return res.json({
                url: finalUrl,
                language: cachedData.language,
                parent: cachedData.parentText ? { text: cachedData.parentText } : null,
                keywords: cachedData.keywords,
                cached: true
            });
        }

        // No cached data available - perform on-demand extraction
        console.log(`[seo.routes] Cache miss for ${finalUrl}, performing on-demand extraction`);
        
        try {
            // Import the on-demand extractor
            const { extractSeoKeywordsWithRetry } = await import('../seo/on-demand-extractor.js');
            
            // Extract SEO keywords
            const result = await extractSeoKeywordsWithRetry(finalUrl);
            
            // Cache the result
            await db.cacheSeoData(finalUrl, {
                parentText: result.parent?.text,
                keywords: result.keywords,
                language: result.language
            });
            
            console.log(`[seo.routes] Successfully extracted and cached SEO data for ${finalUrl}`);
            
            // Return the fresh data
            return res.json({
                url: finalUrl,
                language: result.language,
                parent: result.parent || null,
                keywords: result.keywords,
                cached: false
            });
        } catch (extractError) {
            console.error(`[seo.routes] On-demand extraction failed for ${finalUrl}:`, (extractError as Error).message);
            return res.status(500).json({ 
                error: 'SEO extraction failed', 
                details: (extractError as Error).message,
                url: finalUrl
            });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Server error', details: (err as Error).message });
    }
});

export default router;



import express from 'express';
import { getDatabase } from '../../services/DatabaseService.js';
import { authenticateUser } from '../../middleware/authMiddleware.js';
import { Logger } from '../../helpers/logging/Logger.js';
import { load, CheerioAPI, Element } from 'cheerio';

const logger = Logger.getInstance();
const router = express.Router();

// Get actual page content for text analysis
router.get('/pages/:pageId/content', authenticateUser, async (req: express.Request, res: express.Response) => {
    try {
        const userId = req.user!.userId;
        const pageId = parseInt(req.params.pageId);

        if (isNaN(pageId)) {
            return res.status(400).json({ error: 'Invalid page ID' });
        }

        const db = getDatabase();
        
        // Get the page details
        const page = await db.getPageById(pageId);
        
        if (!page) {
            return res.status(404).json({ error: 'Page not found' });
        }

        // Verify the session belongs to the user or user is admin
        const session = await db.getCrawlSession(page.sessionId);
        if (session && session.userId && session.userId !== userId && req.user!.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Fetch the page content
        // Note: We would need to have HTML stored in database or re-fetch it
        // For now, we'll try to re-fetch the URL
        let htmlContent = '';
        try {
            const https = await import('https');
            const http = await import('http');
            
            const url = new URL(page.url);
            const protocol = url.protocol === 'https:' ? https : http;
            
            htmlContent = await new Promise<string>((resolve, reject) => {
                const options = {
                    hostname: url.hostname,
                    port: url.port || (url.protocol === 'https:' ? 443 : 80),
                    path: url.pathname + url.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; TextQualityAnalyzer/1.0)'
                    },
                    timeout: 10000
                };
                
                const req = protocol.request(options, (res: any) => {
                    let data = '';
                    res.on('data', (chunk: any) => { data += chunk; });
                    res.on('end', () => { resolve(data); });
                });
                
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
                req.end();
            });
        } catch (err) {
            logger.error(`Failed to fetch page content from ${page.url}`, err as Error);
            return res.status(500).json({ error: 'Failed to fetch page content' });
        }

        // Parse HTML and extract content
        const $: CheerioAPI = load(htmlContent);
        
        // Remove non-content elements
        $('script, style, noscript, meta, link, iframe, svg').remove();

        // Extract paragraphs with their text
        const paragraphs: Array<{ text: string; wordCount: number; element: string }> = [];
        $('p').each((_: number, elem: Element) => {
            const text = $(elem).text().trim();
            if (text.length > 0) {
                const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;
                paragraphs.push({
                    text,
                    wordCount,
                    element: 'p'
                });
            }
        });

        // Extract headings with their content
        const headings: Array<{ level: number; text: string; content: string; wordCount: number }> = [];
        $('h1, h2, h3, h4, h5, h6').each((_: number, elem: Element) => {
            const level = parseInt(elem.tagName.substring(1));
            const text = $(elem).text().trim();
            
            // Get text content after this heading until next heading
            let content = '';
            let nextElem = $(elem).next();
            while (nextElem.length && !nextElem.is('h1, h2, h3, h4, h5, h6')) {
                if (nextElem.is('p, div, li')) {
                    content += nextElem.text().trim() + ' ';
                }
                nextElem = nextElem.next();
            }
            
            const wordCount = content.split(/\s+/).filter((w: string) => w.length > 0).length;
            
            headings.push({
                level,
                text,
                content: content.trim(),
                wordCount
            });
        });

        // Extract all visible text
        const visibleText = $('body').text()?.trim() || '';
        
        // Split into sentences
        const sentences = visibleText
            .split(/[.!?]+/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0)
            .map((s: string) => ({
                text: s,
                wordCount: s.split(/\s+/).filter((w: string) => w.length > 0).length
            }));

        // Extract list items
        const listItems: Array<{ text: string; wordCount: number; listType: 'ul' | 'ol' }> = [];
        $('li').each((_: number, elem: Element) => {
            const text = $(elem).text().trim();
            if (text.length > 5) {
                const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;
                const listType = $(elem).parent().is('ul') ? 'ul' : 'ol';
                listItems.push({
                    text,
                    wordCount,
                    listType
                });
            }
        });

        // Calculate word frequency
        const words = visibleText
            .toLowerCase()
            .split(/\s+/)
            .filter((w: string) => w.length > 2) // Only words longer than 2 chars
            .map((w: string) => w.replace(/[^a-z0-9]/g, ''))
            .filter((w: string) => w.length > 0);

        // Count word frequency
        const wordFrequency: Record<string, number> = {};
        words.forEach((word: string) => {
            wordFrequency[word] = (wordFrequency[word] || 0) + 1;
        });

        // Get top 20 words
        const topWords = Object.entries(wordFrequency)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word, count]) => ({
                word,
                count,
                percentage: ((count / words.length) * 100).toFixed(2)
            }));

        res.json({
            success: true,
            data: {
                url: page.url,
                title: page.title,
                paragraphs,
                headings,
                sentences: sentences.slice(0, 50), // Limit to first 50 sentences
                listItems,
                topWords,
                totalWords: words.length,
                uniqueWords: Object.keys(wordFrequency).length,
                visibleTextPreview: visibleText.substring(0, 1000) // First 1000 chars
            }
        });

    } catch (error) {
        logger.error('Failed to get page content', error as Error);
        res.status(500).json({
            error: 'Failed to fetch page content',
            details: (error as Error).message
        });
    }
});

export default router;

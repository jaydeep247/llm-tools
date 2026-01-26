import { Router } from 'express';
import { getDatabase } from '../../services/DatabaseService.js';

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

// Get unique inlinks for a specific page
router.get('/api/pages/:pageId/unique-inlinks', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { limit = 100 } = req.query;

        const db = getDatabase();
        const uniqueInlinks = await db.getUniqueInlinks(Number(pageId), Number(limit));

        res.json({
            uniqueInlinks,
            count: uniqueInlinks.length,
            pageId: Number(pageId)
        });
    } catch (error) {
        console.error('Error fetching unique inlinks:', error);
        res.status(500).json({ error: 'Failed to fetch unique inlinks' });
    }
});

// Get unique JS inlinks for a specific page
router.get('/api/pages/:pageId/unique-js-inlinks', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { limit = 100 } = req.query;

        const db = getDatabase();
        const uniqueJsInlinks = await db.getUniqueJsInlinks(Number(pageId), Number(limit));

        res.json({
            uniqueJsInlinks,
            count: uniqueJsInlinks.length,
            pageId: Number(pageId)
        });
    } catch (error) {
        console.error('Error fetching unique JS inlinks:', error);
        res.status(500).json({ error: 'Failed to fetch unique JS inlinks' });
    }
});

// Check all links for a session
router.post('/api/links/check/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const db = getDatabase();
        
        // Get session info to determine base domain
        const session = await db.getCrawlSession(Number(sessionId));
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const baseUrl = session.startUrl;
        let baseDomain = '';
        try {
            const baseUrlObj = new URL(baseUrl);
            baseDomain = baseUrlObj.hostname;
        } catch {
            return res.status(400).json({ error: 'Invalid base URL in session' });
        }

        // Get all links for the session
        const allLinks = await db.getAllLinksForSession(Number(sessionId));
        
        // Helper function to check if URL is an asset (image, CSS, JS, etc.)
        const isAssetUrl = (url: string): boolean => {
            if (!url) return true;
            const urlLower = url.toLowerCase();
            const assetExtensions = [
                '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.bmp', // Images
                '.css', '.js', '.json', '.xml', // Code files
                '.woff', '.woff2', '.ttf', '.otf', '.eot', // Fonts
                '.mp4', '.mp3', '.avi', '.mov', '.wmv', '.flv', // Media
                '.pdf', '.zip', '.rar', '.tar', '.gz', // Documents
                '.exe', '.dmg', '.deb', '.rpm' // Executables
            ];
            return assetExtensions.some(ext => urlLower.includes(ext));
        };

        // Helper function to determine if link is internal
        const isInternalLink = (url: string, baseDomain: string): boolean => {
            try {
                const urlObj = new URL(url);
                const linkHostname = urlObj.hostname;
                // Exact match
                if (linkHostname === baseDomain) return true;
                // Subdomain check (e.g., blog.example.com is internal if base is example.com)
                if (linkHostname.endsWith(`.${baseDomain}`)) return true;
                return false;
            } catch {
                return false;
            }
        };

        // Helper function to normalize URL
        const normalizeUrl = (url: string): string => {
            try {
                const urlObj = new URL(url);
                // Remove fragments
                urlObj.hash = '';
                // Normalize trailing slash (keep as is for now)
                return urlObj.toString();
            } catch {
                return url;
            }
        };

        // Filter to only page URLs (not assets or resources)
        const pageLinks = allLinks.filter(link => {
            const linkType = link.type || link.link_type;
            const targetUrl = link.target_url || link.targetUrl;
            
            // Exclude resource type links
            if (linkType === 'resource') return false;
            
            // Exclude asset URLs
            if (isAssetUrl(targetUrl)) return false;
            
            return true;
        });
        
        // Remove duplicate links - keep only one entry per unique normalized URL
        const uniqueLinksMap = new Map<string, any>();
        pageLinks.forEach(link => {
            const targetUrl = link.target_url || link.targetUrl;
            if (targetUrl) {
                const normalizedUrl = normalizeUrl(targetUrl);
                // Keep the first occurrence of each unique URL
                if (!uniqueLinksMap.has(normalizedUrl)) {
                    uniqueLinksMap.set(normalizedUrl, link);
                }
            }
        });
        const uniquePageLinks = Array.from(uniqueLinksMap.values());
        
        // Helper function to check a single link with HEAD first, GET fallback, and retry logic
        const checkLink = async (link: any, baseDomain: string, retryCount: number = 0): Promise<{
            url: string;
            sourceUrl: string;
            statusCode: number;
            isInternal: boolean;
            errorType?: 'timeout' | 'unreachable' | 'dns' | 'connection';
            error?: string;
        }> => {
            const targetUrl = link.target_url || link.targetUrl;
            const sourceUrl = link.source_url || link.sourceUrl || '';
            
            if (!targetUrl) {
                return {
                    url: '',
                    sourceUrl,
                    statusCode: 0,
                    isInternal: false,
                    errorType: 'unreachable',
                    error: 'No target URL'
                };
            }

            const normalizedUrl = normalizeUrl(targetUrl);
            const isInternal = isInternalLink(normalizedUrl, baseDomain);
            const maxRetries = 1; // Retry once before giving up

            const attemptFetch = async (method: 'HEAD' | 'GET'): Promise<Response> => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout (increased)

                try {
                    const response = await fetch(normalizedUrl, {
                        method,
                        redirect: 'follow',
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Connection': 'keep-alive'
                        }
                    });
                    clearTimeout(timeoutId);
                    // fetch() only throws for network errors, not HTTP errors
                    // So if we get here, we have a valid response (even if it's 404/500)
                    return response;
                } catch (fetchError: any) {
                    clearTimeout(timeoutId);
                    // Only throw if it's a real network error
                    // fetch() throws for: network failures, DNS errors, timeouts, etc.
                    throw fetchError;
                }
            };

            try {
                // Try HEAD first
                let response: Response;
                try {
                    response = await attemptFetch('HEAD');
                } catch (headError: any) {
                    // HEAD failed - this could be because:
                    // 1. Site doesn't support HEAD (405 Method Not Allowed) - try GET
                    // 2. Network error - try GET, then retry if needed
                    // 3. Timeout - retry once
                    
                    // Try GET as fallback (unless it's clearly a timeout that needs retry)
                    if (headError.name === 'AbortError' || headError.message?.includes('timeout')) {
                        // Timeout - retry once if we haven't already
                        if (retryCount < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
                            return checkLink(link, baseDomain, retryCount + 1);
                        }
                        throw headError;
                    } else {
                        // Other error - try GET method
                        try {
                            response = await attemptFetch('GET');
                        } catch (getError: any) {
                            // GET also failed - retry once if we haven't already
                            if (retryCount < maxRetries) {
                                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                                return checkLink(link, baseDomain, retryCount + 1);
                            }
                            throw getError;
                        }
                    }
                }
                
                // Success - return the response
                return {
                    url: normalizedUrl,
                    sourceUrl,
                    statusCode: response.status,
                    isInternal
                };
            } catch (error: any) {
                // Only mark as unreachable if we've exhausted retries and it's a real network error
                // Don't mark HTTP errors (4xx, 5xx) as unreachable - those are valid responses
                
                let errorType: 'timeout' | 'unreachable' | 'dns' | 'connection' = 'unreachable';
                let errorMessage = 'Unreachable';

                // Check if it's a timeout
                if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('aborted')) {
                    errorType = 'timeout';
                    errorMessage = 'Request timeout';
                } 
                // Check for DNS errors
                else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN' || 
                         error.message?.includes('DNS') || error.message?.includes('getaddrinfo')) {
                    errorType = 'dns';
                    errorMessage = 'DNS lookup failed';
                } 
                // Check for connection errors
                else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' ||
                         error.message?.includes('ECONNREFUSED') || error.message?.includes('Connection refused')) {
                    errorType = 'connection';
                    errorMessage = 'Connection refused';
                } 
                // Check for TLS/SSL errors
                else if (error.code === 'CERT_HAS_EXPIRED' || error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
                         error.message?.includes('TLS') || error.message?.includes('SSL') || 
                         error.message?.includes('certificate')) {
                    // For SSL errors, still try to get the page (some sites have invalid certs but are accessible)
                    // Don't mark as unreachable, try GET one more time
                    if (retryCount < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return checkLink(link, baseDomain, retryCount + 1);
                    }
                    errorType = 'connection';
                    errorMessage = 'SSL/TLS certificate error';
                } 
                // Other network errors
                else if (error.message?.includes('network') || error.message?.includes('fetch') ||
                         error.message?.includes('Failed to fetch')) {
                    // Retry once for network errors
                    if (retryCount < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        return checkLink(link, baseDomain, retryCount + 1);
                    }
                    errorMessage = 'Network error: ' + (error.message || 'Unknown');
                } else {
                    // Unknown error - log it but don't mark as unreachable unless we're sure
                    console.warn(`[LinkChecker] Unknown error for ${normalizedUrl}:`, error.message || error);
                    errorMessage = error.message || 'Unknown error';
                }

                return {
                    url: normalizedUrl,
                    sourceUrl,
                    statusCode: 0, // Timeout/Unreachable
                    isInternal,
                    errorType,
                    error: errorMessage
                };
            }
        };

        // Check page links only (limit to 1000 for performance, with throttling for external)
        const linksToCheck = uniquePageLinks.slice(0, 1000);
        
        // Separate internal and external links for different throttling
        const internalLinks: any[] = [];
        const externalLinks: any[] = [];
        
        linksToCheck.forEach(link => {
            const targetUrl = link.target_url || link.targetUrl;
            if (targetUrl && isInternalLink(normalizeUrl(targetUrl), baseDomain)) {
                internalLinks.push(link);
            } else {
                externalLinks.push(link);
            }
        });

        // Check internal links (can be faster)
        const checkedInternal = await Promise.all(
            internalLinks.map(link => checkLink(link, baseDomain))
        );

        // Check external links with throttling (max 5 concurrent)
        const checkedExternal: typeof checkedInternal = [];
        const concurrency = 5;
        for (let i = 0; i < externalLinks.length; i += concurrency) {
            const batch = externalLinks.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map(link => checkLink(link, baseDomain))
            );
            checkedExternal.push(...batchResults);
            // Small delay between batches to be respectful
            if (i + concurrency < externalLinks.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        const checkedLinks = [...checkedInternal, ...checkedExternal];

        // Step 4: Classify broken links according to the algorithm
        
        // 1️⃣ Broken Internal Links: Internal links with status 404, 410, 5xx, or 0
        const brokenInternalLinks = checkedLinks.filter(l => {
            if (!l.isInternal) return false;
            return l.statusCode === 404 || l.statusCode === 410 || 
                   (l.statusCode >= 500 && l.statusCode < 600) || 
                   l.statusCode === 0;
        });

        // 2️⃣ Broken External Links: External links with status 404 or 410
        const brokenExternalLinks = checkedLinks.filter(l => {
            if (l.isInternal) return false;
            return l.statusCode === 404 || l.statusCode === 410;
        });

        // 3️⃣ Missing Pages: Any link with status 404 or 410
        const missingPages = checkedLinks.filter(l => 
            l.statusCode === 404 || l.statusCode === 410
        );
        
        // 4️⃣ Server Errors: Any link with status 5xx
        const serverErrors = checkedLinks.filter(l => 
            l.statusCode >= 500 && l.statusCode < 600
        );
        
        // 5️⃣ Timeout/Unreachable: Links with status 0
        const timeoutUnreachable = checkedLinks.filter(l => l.statusCode === 0);

        res.json({
            sessionId: Number(sessionId),
            results: {
                brokenInternalLinks: {
                    count: brokenInternalLinks.length,
                    links: brokenInternalLinks.map(l => ({ 
                        url: l.url, 
                        sourceUrl: l.sourceUrl,
                        statusCode: l.statusCode,
                        errorType: l.errorType,
                        error: l.error
                    }))
                },
                brokenExternalLinks: {
                    count: brokenExternalLinks.length,
                    links: brokenExternalLinks.map(l => ({ 
                        url: l.url, 
                        sourceUrl: l.sourceUrl,
                        statusCode: l.statusCode,
                        errorType: l.errorType,
                        error: l.error
                    }))
                },
                missingPages: {
                    count: missingPages.length,
                    links: missingPages.map(l => ({ 
                        url: l.url, 
                        sourceUrl: l.sourceUrl,
                        statusCode: l.statusCode,
                        missingType: l.statusCode === 404 ? '404' : '410'
                    }))
                },
                serverErrors: {
                    count: serverErrors.length,
                    links: serverErrors.map(l => ({ 
                        url: l.url, 
                        sourceUrl: l.sourceUrl,
                        statusCode: l.statusCode
                    }))
                },
                timeoutUnreachable: {
                    count: timeoutUnreachable.length,
                    links: timeoutUnreachable.map(l => ({ 
                        url: l.url, 
                        sourceUrl: l.sourceUrl,
                        statusCode: l.statusCode,
                        errorType: l.errorType,
                        error: l.error
                    }))
                }
            },
            totalChecked: checkedLinks.length,
            totalLinks: allLinks.length,
            totalPageLinks: uniquePageLinks.length
        });
    } catch (error) {
        console.error('Error checking links:', error);
        res.status(500).json({ error: 'Failed to check links' });
    }
});

export default router;

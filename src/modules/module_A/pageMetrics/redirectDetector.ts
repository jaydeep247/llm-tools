import type { CheerioAPI } from 'cheerio';
import type { CrawlResponse } from './types.js';

export interface RedirectData {
    redirectUrl?: string;
    redirectType?: string;
}

/**
 * Detects redirect URL and type from HTTP headers, meta tags, and JavaScript
 * 
 * Redirect Types:
 * - 301: Permanent Redirect (SEO value passes)
 * - 302: Temporary Redirect (SEO value may not fully pass)
 * - 307: Temporary Redirect with strict method handling (HTTP/1.1)
 * - 308: Permanent Redirect with strict method handling
 * - meta-refresh: HTML-based redirect (not recommended for SEO)
 * - javascript: JS-based redirect (least SEO-friendly)
 */
export function extractRedirectData(
    $: CheerioAPI,
    response: CrawlResponse | undefined,
    originalUrl: string
): RedirectData {
    // 1. Check if the URL changed (Crawlee follows redirects automatically)
    // Compare the original requested URL with the final URL
    if (response?.url && response.url !== originalUrl) {
        // The page was redirected
        // Try to determine the redirect type from status code if available
        const statusCode = response.statusCode;
        
        // If status code indicates a redirect, classify it
        if (statusCode && statusCode >= 300 && statusCode < 400) {
            let redirectType = 'redirect';
            
            switch (statusCode) {
                case 301:
                    redirectType = '301-permanent';
                    break;
                case 302:
                    redirectType = '302-temporary';
                    break;
                case 307:
                    redirectType = '307-temporary';
                    break;
                case 308:
                    redirectType = '308-permanent';
                    break;
                case 303:
                    redirectType = '303-see-other';
                    break;
                default:
                    redirectType = `${statusCode}-redirect`;
            }
            
            return {
                redirectUrl: response.url,
                redirectType
            };
        }
        
        // Status code might be 200 after following redirect
        // Check if it's an HTTPS upgrade (most common)
        if (originalUrl.startsWith('http://') && response.url.startsWith('https://')) {
            const pathMatch = originalUrl.substring(7) === response.url.substring(8);
            if (pathMatch) {
                return {
                    redirectUrl: response.url,
                    redirectType: '301-permanent' // HTTPS upgrades are typically 301
                };
            }
        }
        
        // URL changed but we can't determine the exact type
        // This could be 301 or 302, defaulting to 301 as it's more common
        return {
            redirectUrl: response.url,
            redirectType: '301-permanent'
        };
    }
    
    // 2. Check HTTP status code redirects (301, 302, 307, 308)
    // This catches redirects that weren't followed
    if (response?.statusCode) {
        const statusCode = response.statusCode;
        
        // Check for redirect status codes
        if (statusCode >= 300 && statusCode < 400) {
            const headers = response.headers || response.responseHeaders || {};
            const location = headers['location'] || headers['Location'];
            
            if (location) {
                // Handle location header - it can be string or string[]
                const locationUrl = Array.isArray(location) ? location[0] : location;
                
                let redirectType = 'redirect';
                
                switch (statusCode) {
                    case 301:
                        redirectType = '301-permanent';
                        break;
                    case 302:
                        redirectType = '302-temporary';
                        break;
                    case 307:
                        redirectType = '307-temporary';
                        break;
                    case 308:
                        redirectType = '308-permanent';
                        break;
                    case 303:
                        redirectType = '303-see-other';
                        break;
                    default:
                        redirectType = `${statusCode}-redirect`;
                }
                
                return {
                    redirectUrl: resolveRedirectUrl(locationUrl, originalUrl),
                    redirectType
                };
            }
        }
    }
    
    // 3. Check for meta refresh redirects
    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh) {
        // Parse meta refresh: "0; url=https://example.com/new-page"
        const urlMatch = metaRefresh.match(/url\s*=\s*['"]?([^'">\s]+)/i);
        if (urlMatch && urlMatch[1]) {
            return {
                redirectUrl: resolveRedirectUrl(urlMatch[1], originalUrl),
                redirectType: 'meta-refresh'
            };
        }
    }
    
    // 4. Check for JavaScript redirects (only immediate, not conditional or event-based)
    const scriptTags = $('script').toArray();
    for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';
        
        // Skip if the script contains common indicators of conditional/event-based redirects
        const conditionalIndicators = [
            /addEventListener\s*\(/i,
            /onclick\s*=/i,
            /function\s+\w+\s*\(/i,
            /\.click\s*\(/i,
            /if\s*\(/i,
            /\belse\b/i,
            /\bswitch\b/i,
            /\bcase\b/i,
            /setTimeout\s*\(/i,
            /setInterval\s*\(/i,
        ];
        
        const hasConditionalCode = conditionalIndicators.some(pattern => pattern.test(scriptContent));
        
        // If script has conditional/event code, skip it (too many false positives)
        if (hasConditionalCode) {
            continue;
        }
        
        // Only detect immediate redirects (executed on page load)
        const jsRedirectPatterns = [
            /^[\s\n]*window\.location\s*=\s*['"]([^'"]+)['"]/im,
            /^[\s\n]*window\.location\.href\s*=\s*['"]([^'"]+)['"]/im,
            /^[\s\n]*window\.location\.replace\(['"]([^'"]+)['"]\)/im,
            /^[\s\n]*location\.href\s*=\s*['"]([^'"]+)['"]/im,
            /^[\s\n]*location\.replace\(['"]([^'"]+)['"]\)/im,
        ];
        
        for (const pattern of jsRedirectPatterns) {
            const match = scriptContent.match(pattern);
            if (match && match[1]) {
                return {
                    redirectUrl: resolveRedirectUrl(match[1], originalUrl),
                    redirectType: 'javascript'
                };
            }
        }
    }
    
    // No redirect detected
    return {
        redirectUrl: undefined,
        redirectType: undefined
    };
}

/**
 * Resolves relative redirect URLs to absolute URLs
 */
function resolveRedirectUrl(redirectUrl: string, baseUrl: string): string {
    try {
        // If it's already an absolute URL, return it
        if (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')) {
            return redirectUrl;
        }
        
        // Resolve relative URL against base
        const base = new URL(baseUrl);
        
        // Handle protocol-relative URLs (//example.com)
        if (redirectUrl.startsWith('//')) {
            return `${base.protocol}${redirectUrl}`;
        }
        
        // Handle absolute path (/path)
        if (redirectUrl.startsWith('/')) {
            return `${base.protocol}//${base.host}${redirectUrl}`;
        }
        
        // Handle relative path (path or ./path or ../path)
        const resolved = new URL(redirectUrl, baseUrl);
        return resolved.href;
    } catch (error) {
        // If URL parsing fails, return the original redirect URL
        return redirectUrl;
    }
}

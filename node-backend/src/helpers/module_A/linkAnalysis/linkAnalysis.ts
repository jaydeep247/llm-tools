import type { CheerioAPI } from 'cheerio';
import type { LinkData, LinkAnalysisOptions } from './types.js';

/**
 * Check if a link is JavaScript-rendered (not a standard href link)
 * This detects links that are created or triggered via JavaScript
 */
function isJsRenderedLink($: CheerioAPI, el: any): boolean {
    const $el = $(el);
    
    // Check for onClick handlers that might navigate
    const onClick = $el.attr('onclick');
    if (onClick && (onClick.includes('location') || onClick.includes('href') || onClick.includes('window.open'))) {
        return true;
    }
    
    // Check for data attributes commonly used for JS navigation
    if ($el.attr('data-href') || $el.attr('data-url') || $el.attr('data-link')) {
        return true;
    }
    
    // Check if href uses javascript: protocol
    const href = $el.attr('href');
    if (href && href.toLowerCase().startsWith('javascript:')) {
        return true;
    }
    
    // Check for common JS routing patterns
    if ($el.hasClass('js-link') || $el.hasClass('js-navigate') || $el.attr('data-action') === 'navigate') {
        return true;
    }
    
    return false;
}

/**
 * Analyze links on a page for detailed metadata
 * This extracts comprehensive link information including anchor text, position, etc.
 */
export function analyzeLinkDetails(
    $: CheerioAPI,
    options: LinkAnalysisOptions,
    isValidHttpLink: (href: string) => boolean,
    isSameSite: (url: string, host: string, allowSubdomains: boolean) => boolean,
    extractLinkMetadata: (el: any, baseUrl: string, $: CheerioAPI) => any
): LinkData[] {
    const { sessionId, sourcePageId, sourceUrl, allowedHost, allowSubdomains } = options;
    const linksToInsert: LinkData[] = [];
    const processedLinks = new Set<string>(); // For deduplication
    
    $('a[href]').each((_i: number, el: any) => {
        try {
            const href = $(el).attr('href');
            if (!href) return;
            
            let absolute: string;
            try {
                absolute = new URL(href, sourceUrl).toString();
            } catch {
                return;
            }
            
            // Only process HTTP/HTTPS links
            if (!isValidHttpLink(absolute)) return;
            
            // Deduplicate by target URL and XPath
            const metadata = extractLinkMetadata(el, sourceUrl, $);
            const dedupeKey = `${metadata.targetUrl}|${metadata.xpath}`;
            if (processedLinks.has(dedupeKey)) return;
            processedLinks.add(dedupeKey);
            
            const isInternal = isSameSite(absolute, allowedHost, allowSubdomains);
            const isJsLink = isJsRenderedLink($, el);
            
            linksToInsert.push({
                sessionId,
                sourcePageId,
                sourceUrl,
                targetUrl: metadata.targetUrl,
                isInternal,
                anchorText: metadata.anchorText,
                xpath: metadata.xpath,
                position: metadata.position,
                rel: metadata.rel,
                nofollow: metadata.nofollow,
                isJsRendered: isJsLink
            });
        } catch (error) {
            // Skip problematic links
        }
    });
    
    // Also check for JavaScript-based navigation (elements with onClick, data-href, etc.)
    $('[onclick], [data-href], [data-url], [data-link]').each((_i: number, el: any) => {
        try {
            const $el = $(el);
            
            // Skip if already processed as an anchor tag
            if ($el.is('a[href]')) return;
            
            // Try to extract URL from various attributes
            let url: string | undefined;
            
            // Check data attributes
            url = $el.attr('data-href') || $el.attr('data-url') || $el.attr('data-link');
            
            // Check onClick for URLs
            if (!url) {
                const onClick = $el.attr('onclick') || '';
                // Try to extract URL from common patterns
                const urlMatch = onClick.match(/(?:location|href|window\.open)\s*[=\(]\s*['"]([^'"]+)['"]/);
                if (urlMatch) {
                    url = urlMatch[1];
                }
            }
            
            if (!url) return;
            
            // Try to make it absolute
            let absolute: string;
            try {
                absolute = new URL(url, sourceUrl).toString();
            } catch {
                return;
            }
            
            // Only process HTTP/HTTPS links
            if (!isValidHttpLink(absolute)) return;
            
            // Check for duplicates
            const xpath = getXPath($el, $);
            const dedupeKey = `${absolute}|${xpath}`;
            if (processedLinks.has(dedupeKey)) return;
            processedLinks.add(dedupeKey);
            
            const isInternal = isSameSite(absolute, allowedHost, allowSubdomains);
            const anchorText = $el.text().trim().substring(0, 200);
            
            linksToInsert.push({
                sessionId,
                sourcePageId,
                sourceUrl,
                targetUrl: absolute,
                isInternal,
                anchorText: anchorText || undefined,
                xpath,
                position: undefined,
                rel: $el.attr('rel') || undefined,
                nofollow: false,
                isJsRendered: true  // These are always JS-rendered
            });
        } catch (error) {
            // Skip problematic links
        }
    });
    
    return linksToInsert;
}

/**
 * Helper function to get XPath for an element
 */
function getXPath($el: any, $: CheerioAPI): string {
    const parts: string[] = [];
    let current = $el;
    
    while (current && current.length > 0 && current[0].type === 'tag') {
        const tagName = current[0].name;
        const parent = current.parent();
        
        if (!parent || parent.length === 0) break;
        
        const siblings = parent.children(tagName);
        if (siblings.length > 1) {
            const index = siblings.index(current) + 1;
            parts.unshift(`${tagName}[${index}]`);
        } else {
            parts.unshift(tagName);
        }
        
        current = parent;
        
        // Stop at body or html
        if (tagName === 'body' || tagName === 'html') break;
    }
    
    return '/' + parts.join('/');
}

/**
 * Get link analysis statistics
 */
export function getLinkAnalysisStats(links: LinkData[]): {
    totalLinks: number;
    internalLinks: number;
    externalLinks: number;
    nofollowLinks: number;
    uniqueTargets: number;
} {
    const uniqueTargets = new Set(links.map(l => l.targetUrl));
    
    return {
        totalLinks: links.length,
        internalLinks: links.filter(l => l.isInternal).length,
        externalLinks: links.filter(l => !l.isInternal).length,
        nofollowLinks: links.filter(l => l.nofollow).length,
        uniqueTargets: uniqueTargets.size
    };
}

import type { CheerioAPI } from 'cheerio';
import type { LinkData, LinkAnalysisOptions } from './types.js';

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
    
    $('a[href]').each((_i, el) => {
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
                nofollow: metadata.nofollow
            });
        } catch (error) {
            // Skip problematic links
        }
    });
    
    return linksToInsert;
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

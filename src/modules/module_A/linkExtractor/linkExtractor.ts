import type { CheerioAPI } from 'cheerio';
import type { ExtractedLink, LinkExtractionOptions, LinksForCrawling } from './types.js';

/**
 * Check if a URL is a valid HTTP/HTTPS link that should be processed
 */
export function isValidHttpLink(href: string): boolean {
    if (!href) return false;

    // Skip non-HTTP protocols
    const lowerHref = href.toLowerCase();
    if (lowerHref.startsWith('javascript:') ||
        lowerHref.startsWith('mailto:') ||
        lowerHref.startsWith('tel:') ||
        lowerHref.startsWith('sms:') ||
        lowerHref.startsWith('ftp:') ||
        lowerHref.startsWith('file:') ||
        lowerHref.startsWith('data:') ||
        lowerHref.startsWith('blob:') ||
        lowerHref.startsWith('chrome:') ||
        lowerHref.startsWith('about:') ||
        lowerHref.startsWith('#')) {
        return false;
    }

    // Must be HTTP or HTTPS
    return lowerHref.startsWith('http://') || lowerHref.startsWith('https://');
}

/**
 * Extract all links from a page
 */
export function extractLinks($: CheerioAPI, baseUrl: string): ExtractedLink[] {
    const links: ExtractedLink[] = [];
    
    $('a[href]').each((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        
        let absoluteUrl: string;
        try {
            absoluteUrl = new URL(href, baseUrl).toString();
        } catch {
            return; // Invalid URL
        }
        
        const isValid = isValidHttpLink(absoluteUrl);
        const baseHostname = new URL(baseUrl).hostname;
        const linkHostname = new URL(absoluteUrl).hostname;
        const isInternal = linkHostname === baseHostname || 
                          linkHostname.endsWith(`.${baseHostname}`);
        
        links.push({
            href,
            absoluteUrl,
            isInternal,
            isValid
        });
    });
    
    return links;
}

/**
 * Extract links for crawling (internal links only, canonicalized)
 * This is the main function used by the crawler to find new pages to crawl
 */
export function extractLinksForCrawling(
    $: CheerioAPI,
    options: LinkExtractionOptions,
    canonicalizeUrl: (url: string, opts: any) => string | null,
    isSameSite: (url: string, host: string, allowSubdomains: boolean) => boolean
): string[] {
    const { baseUrl, allowedHost, allowSubdomains, denyParamPrefixes = [] } = options;
    const toEnqueue: string[] = [];
    
    $('a[href]')
        .map((_i, el) => $(el).attr('href'))
        .get()
        .forEach((href: string) => {
            if (!href) return;
            
            let absolute: string;
            try {
                absolute = new URL(href, baseUrl).toString();
            } catch {
                return;
            }
            
            if (!isValidHttpLink(absolute)) return;
            
            const canon = canonicalizeUrl(absolute, {
                allowedHost,
                allowSubdomains,
                denyParamPrefixes,
            });
            
            if (canon) toEnqueue.push(canon);
        });
    
    return toEnqueue;
}

/**
 * Categorize links into internal and external
 */
export function categorizeLinks(
    $: CheerioAPI,
    baseUrl: string,
    allowedHost: string,
    allowSubdomains: boolean,
    isSameSite: (url: string, host: string, allowSubdomains: boolean) => boolean
): LinksForCrawling {
    const internalLinks: string[] = [];
    const externalLinks: string[] = [];
    
    $('a[href]').each((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        
        let absolute: string;
        try {
            absolute = new URL(href, baseUrl).toString();
        } catch {
            return;
        }
        
        if (!isValidHttpLink(absolute)) return;
        
        if (isSameSite(absolute, allowedHost, allowSubdomains)) {
            internalLinks.push(absolute);
        } else {
            externalLinks.push(absolute);
        }
    });
    
    return {
        internalLinks,
        externalLinks,
        totalLinks: internalLinks.length + externalLinks.length
    };
}

/**
 * Count inlinks and outlinks
 */
export function countLinks($: CheerioAPI, baseUrl: string): {
    totalLinks: number;
    internalLinks: number;
    externalLinks: number;
} {
    let totalLinks = 0;
    let internalLinks = 0;
    let externalLinks = 0;
    
    const baseHostname = new URL(baseUrl).hostname;
    
    $('a[href]').each((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        
        let absolute: string;
        try {
            absolute = new URL(href, baseUrl).toString();
        } catch {
            return;
        }
        
        if (!isValidHttpLink(absolute)) return;
        
        totalLinks++;
        
        const linkHostname = new URL(absolute).hostname;
        if (linkHostname === baseHostname || linkHostname.endsWith(`.${baseHostname}`)) {
            internalLinks++;
        } else {
            externalLinks++;
        }
    });
    
    return {
        totalLinks,
        internalLinks,
        externalLinks
    };
}

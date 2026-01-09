import type { CheerioAPI } from 'cheerio';
import type { CrawlResponse } from './types.js';

/**
 * Pagination data extracted from HTML and HTTP headers
 */
export interface PaginationData {
    relNext?: string;
    relPrev?: string;
    httpRelNext?: string;
    httpRelPrev?: string;
}

/**
 * Extract pagination links from HTML <link> tags
 */
export function extractHtmlPaginationLinks($: CheerioAPI, baseUrl: string): {
    relNext?: string;
    relPrev?: string;
} {
    const result: { relNext?: string; relPrev?: string } = {};
    
    // Extract rel="next" link
    const nextLink = $('link[rel="next"]').attr('href');
    if (nextLink) {
        try {
            result.relNext = nextLink.startsWith('http') 
                ? nextLink 
                : new URL(nextLink, baseUrl).toString();
        } catch {
            result.relNext = nextLink;
        }
    }
    
    // Extract rel="prev" link
    const prevLink = $('link[rel="prev"]').attr('href');
    if (prevLink) {
        try {
            result.relPrev = prevLink.startsWith('http') 
                ? prevLink 
                : new URL(prevLink, baseUrl).toString();
        } catch {
            result.relPrev = prevLink;
        }
    }
    
    return result;
}

/**
 * Parse Link HTTP header for pagination
 * Format: <url>; rel="next", <url>; rel="prev"
 */
export function parseLinkHeader(linkHeader: string, baseUrl: string): {
    httpRelNext?: string;
    httpRelPrev?: string;
} {
    const result: { httpRelNext?: string; httpRelPrev?: string } = {};
    
    // Split by comma to get individual links
    const links = linkHeader.split(',');
    
    for (const link of links) {
        const parts = link.trim().match(/<([^>]+)>;\s*rel="([^"]+)"/);
        if (parts && parts.length === 3) {
            const url = parts[1];
            const rel = parts[2];
            
            try {
                const fullUrl = url.startsWith('http') 
                    ? url 
                    : new URL(url, baseUrl).toString();
                
                if (rel === 'next') {
                    result.httpRelNext = fullUrl;
                } else if (rel === 'prev' || rel === 'previous') {
                    result.httpRelPrev = fullUrl;
                }
            } catch {
                // Keep original URL if resolution fails
                if (rel === 'next') {
                    result.httpRelNext = url;
                } else if (rel === 'prev' || rel === 'previous') {
                    result.httpRelPrev = url;
                }
            }
        }
    }
    
    return result;
}

/**
 * Extract pagination links from HTTP Link header
 */
export function extractHttpPaginationLinks(response?: CrawlResponse, baseUrl?: string): {
    httpRelNext?: string;
    httpRelPrev?: string;
} {
    if (!response?.headers && !response?.responseHeaders) {
        return {};
    }
    
    // Check for Link header (case-insensitive)
    const linkHeader = response.headers?.['link'] || 
                       response.headers?.['Link'] ||
                       response.responseHeaders?.['link'] ||
                       response.responseHeaders?.['Link'];
    
    if (!linkHeader || !baseUrl) {
        return {};
    }
    
    const headerValue = Array.isArray(linkHeader) ? linkHeader.join(',') : linkHeader;
    return parseLinkHeader(headerValue, baseUrl);
}

/**
 * Extract all pagination information from page
 */
export function extractPagination(
    $: CheerioAPI,
    response: CrawlResponse | undefined,
    baseUrl: string
): PaginationData {
    // Extract HTML pagination links
    const htmlLinks = extractHtmlPaginationLinks($, baseUrl);
    
    // Extract HTTP header pagination links
    const httpLinks = extractHttpPaginationLinks(response, baseUrl);
    
    return {
        relNext: htmlLinks.relNext,
        relPrev: htmlLinks.relPrev,
        httpRelNext: httpLinks.httpRelNext,
        httpRelPrev: httpLinks.httpRelPrev
    };
}

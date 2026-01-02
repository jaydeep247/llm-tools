import type { CheerioAPI } from 'cheerio';
import type { PageMetrics, CrawlResponse } from './types.js';
import { extractTitle } from './titleExtractor.js';
import { extractMetaDescription, extractMetaTags } from './metaExtractor.js';
import { extractHeaders } from './headerExtractor.js';
import { extractStatusData } from './statusChecker.js';

/**
 * Extract all page metrics from a crawled page
 */
export function extractPageMetrics(
    url: string,
    $: CheerioAPI,
    response: CrawlResponse | undefined,
    responseTime: number
): PageMetrics {
    // Extract title
    const titleData = extractTitle($);
    
    // Extract meta description
    const metaDescData = extractMetaDescription($);
    
    // Extract other meta tags
    const metaTagsData = extractMetaTags($, url);
    
    // Extract headers
    const headersData = extractHeaders($);
    
    // Extract status data
    const statusData = extractStatusData(url, response, $, responseTime);
    
    return {
        // Title
        ...titleData,
        
        // Meta description
        ...metaDescData,
        
        // Meta tags
        ...metaTagsData,
        
        // Headers
        ...headersData,
        
        // Status
        ...statusData
    };
}

// Re-export all types and functions
export * from './types.js';
export * from './titleExtractor.js';
export * from './metaExtractor.js';
export * from './headerExtractor.js';
export * from './statusChecker.js';

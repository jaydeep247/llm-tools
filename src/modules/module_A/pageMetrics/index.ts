import type { CheerioAPI } from 'cheerio';
import type { PageMetrics, CrawlResponse } from './types.js';
import { extractTitle } from './titleExtractor.js';
import { extractMetaDescription, extractMetaTags } from './metaExtractor.js';
import { extractHeaders } from './headerExtractor.js';
import { extractStatusData } from './statusChecker.js';
import { extractIndexability } from './indexabilityExtractor.js';
import { extractPagination } from './paginationExtractor.js';
import { extractAmpHtml } from './ampExtractor.js';

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
    
    // Extract indexability
    const indexabilityData = extractIndexability($, response);
    
    // Extract pagination links
    const paginationData = extractPagination($, response, url);

    // Extract AMP HTML
    const amphtmlUrl = extractAmpHtml($);
    
    return {
        // URL
        url,
        
        // Title
        ...titleData,
        
        // Meta description
        ...metaDescData,
        
        // Meta tags
        ...metaTagsData,
        
        // Headers
        ...headersData,
        
        // Status
        ...statusData,
        
        // Indexability
        indexable: indexabilityData.indexable,
        indexabilityStatus: indexabilityData.indexabilityStatus,
        indexabilitySource: indexabilityData.source,
        indexabilityDirectives: indexabilityData.directives,
        xRobotsTag: indexabilityData.xRobotsTag,
        indexabilityDetails: indexabilityData.details,
        
        // Pagination
        ...paginationData,
        
        // AMP
        amphtmlUrl
    };
}

// Re-export all types
export * from './types.js';

// Import and re-export all extractors
export * from './titleExtractor.js';
export * from './metaExtractor.js';
export * from './headerExtractor.js';
export * from './statusChecker.js';
export * from './indexabilityExtractor.js';
export * from './paginationExtractor.js';
export * from './ampExtractor.js';


import type { CheerioAPI } from 'cheerio';
import type { PageMetrics, CrawlResponse } from './types.js';
import { extractTitle } from './titleExtractor.js';
import { extractMetaDescription, extractMetaTags } from './metaExtractor.js';
import { extractHeaders } from './headerExtractor.js';
import { extractStatusData } from './statusChecker.js';
import { extractIndexability } from './indexabilityExtractor.js';
import { extractPagination } from './paginationExtractor.js';
import { extractAmpHtml } from './ampExtractor.js';
import { extractMobileAlternate } from './mobileAlternateExtractor.js';
import { extractRedirectData } from './redirectDetector.js';
import { extractTables } from './tableExtractor.js';
import { extractFaqs } from './faqExtractor.js';
import { extractMixedContent } from './mixedContentExtractor.js';
import { mapHeaderStructure } from './headerStructureMapper.js';
import { extractViewport } from './viewportExtractor.js';
import { extractPageSizeMeasurement } from './pageSizeExtractor.js';
import { detectStructuredData } from './structuredDataDetector.js';
import { identifyStructuredDataTypes } from './structuredDataTypeIdentifier.js';
import { extractWordCount } from './wordCountExtractor.js';

/**
 * Extract all page metrics from a crawled page
 * Now async to support HTTP HEAD request for Last-Modified header
 */
export async function extractPageMetrics(
    url: string,
    $: CheerioAPI,
    response: CrawlResponse | undefined,
    responseTime: number
): Promise<PageMetrics> {
    // Extract title
    const titleData = extractTitle($);
    
    // Extract meta description
    const metaDescData = extractMetaDescription($);
    
    // Extract other meta tags
    const metaTagsData = extractMetaTags($, url);
    
    // Extract headers
    const headersData = extractHeaders($);
    
    // Extract status data (now async for Last-Modified)
    const statusData = await extractStatusData(url, response, $, responseTime);
    
    // Extract indexability
    const indexabilityData = extractIndexability($, response);
    
    // Extract pagination links
    const paginationData = extractPagination($, response, url);

    // Extract AMP HTML
    const amphtmlUrl = extractAmpHtml($);
    
    // Extract mobile alternate link
    const mobileAlternateUrl = extractMobileAlternate($);
    
    // Extract redirect data
    const redirectData = extractRedirectData($, response, url);
    
    // Extract tables
    const tablesData = extractTables($);
    
    // Extract FAQs
    const faqsData = extractFaqs($);
    
    // Extract Mixed Content (needs finalUrl for HTTPS check)
    const mixedContentData = extractMixedContent($, statusData.finalUrl);
    
    // Extract Header Structure Mapping
    const headerStructureMapping = mapHeaderStructure($);
    
    // Extract Viewport Meta
    const viewportData = extractViewport($);
    
    // Detect Structured Data (JSON-LD + Microdata)
    const structuredDataDetection = detectStructuredData($);
    
    // Identify Structured Data Types
    const structuredDataTypeIdentification = identifyStructuredDataTypes(structuredDataDetection);
    
    // Extract Page Size Measurements
    const pageSizeMeasurement = await extractPageSizeMeasurement(url, $, response);
    
    // Determine target keyword for keyword density calculation
    // Priority: H1 tag > Page title > null
    let targetKeyword: string | undefined = undefined;
    if (headersData.h1Tags && headersData.h1Tags.length > 0) {
        // Use first H1 tag as target keyword
        targetKeyword = headersData.h1Tags[0].trim();
    } else if (titleData.title && titleData.title !== 'No title') {
        // Fallback to page title
        targetKeyword = titleData.title.trim();
    }
    
    // Extract Word Count (with keyword density calculation if target keyword available)
    const wordCount = extractWordCount($, targetKeyword);
    
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
        amphtmlUrl,
        
        // Mobile Alternate
        mobileAlternateUrl,
        
        // Redirect
        ...redirectData,
        
        // Tables
        tables: tablesData,
        
        // FAQs
        faqs: faqsData,
        
        // Mixed Content
        mixedContent: mixedContentData,
        
        // Header Structure Mapping
        headerStructureMapping,
        
        // Viewport Meta (enhanced)
        viewportMeta: viewportData,
        
        // Structured Data Detection (enhanced)
        structuredDataDetection,
        
        // Structured Data Type Identification
        structuredDataTypeIdentification,
        
        // Page Size Measurements
        pageSizeMeasurement,
        
        // Word Count Analysis
        wordCount
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
export * from './mobileAlternateExtractor.js';
export * from './lastModifiedFetcher.js';
export * from './redirectDetector.js';
export * from './tableExtractor.js';
export * from './faqExtractor.js';
export * from './mixedContentExtractor.js';
export * from './headerStructureMapper.js';
export * from './viewportExtractor.js';
export * from './structuredDataDetector.js';
export * from './structuredDataTypeIdentifier.js';
export * from './pageSizeExtractor.js';
// Re-export wordCountExtractor but exclude generateContentHash to avoid conflict with duplicateDetection
export { extractWordCount, type PageWordCountData } from './wordCountExtractor.js';


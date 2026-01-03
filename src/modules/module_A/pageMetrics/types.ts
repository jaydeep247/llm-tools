import type { CheerioAPI } from 'cheerio';
import type { IncomingHttpHeaders } from 'http';

/**
 * Complete page metrics data
 */
export interface PageMetrics {
    // Basic info
    url: string;
    statusCode: number;
    contentType: string;
    responseTime: number;
    sizeBytes?: number;
    lastModified?: string;
    
    // Title
    title: string;
    titleLength: number;
    titlePixelWidth?: number;
    hasMissingTitle: boolean;
    
    // Meta description
    metaDescription: string;
    metaDescriptionLength: number;
    metaDescriptionPixelWidth?: number;
    hasMissingMetaDescription: boolean;
    
    // Indexability
    indexable: boolean;
    indexabilityStatus: string;
    indexabilitySource?: 'meta' | 'header' | 'both' | 'none';
    indexabilityDirectives?: string[];
    indexabilityDetails?: string;
    
    // Meta tags
    metaKeywords?: string;
    metaKeywordsLength?: number;
    metaRobots?: string;
    xRobotsTag?: string;
    metaRefresh?: string;
    canonicalUrl?: string;
    viewport?: string;
    
    // Pagination links
    relNext?: string;
    relPrev?: string;
    httpRelNext?: string;
    httpRelPrev?: string;
    
    // Headers
    h1Tags: string[];
    hasMultipleH1: boolean;
    h2Tags: string[];
    h3Tags: string[];
    h4Tags: string[];
    h5Tags: string[];
    h6Tags: string[];
    headerStructure: HeaderStructure[];
    
    // HTTP status (finalUrl is the only unique field here)
    finalUrl: string;
    language?: string;
    
    // Structured data
    structuredData: StructuredDataItem[];
}

/**
 * Header structure for hierarchy validation
 */
export interface HeaderStructure {
    level: number;
    text: string;
    xpath?: string;
}

/**
 * Structured data item
 */
export interface StructuredDataItem {
    type: string; // 'json-ld' | 'microdata' | 'rdfa'
    schemaType?: string; // e.g., 'Article', 'Product', 'Organization'
    data: any;
}

/**
 * Title extraction result
 */
export interface TitleData {
    title: string;
    titleLength: number;
    titlePixelWidth?: number;
    hasMissingTitle: boolean;
}

/**
 * Meta description extraction result
 */
export interface MetaDescriptionData {
    metaDescription: string;
    metaDescriptionLength: number;
    metaDescriptionPixelWidth?: number;
    hasMissingMetaDescription: boolean;
}

/**
 * Meta tags extraction result
 */
export interface MetaTagsData {
    metaKeywords?: string;
    metaKeywordsLength?: number;
    metaRobots?: string;
    metaRefresh?: string;
    canonicalUrl?: string;
    viewport?: string;
    structuredData: StructuredDataItem[];
}

/**
 * Headers extraction result
 */
export interface HeadersData {
    h1Tags: string[];
    hasMultipleH1: boolean;
    h2Tags: string[];
    h3Tags: string[];
    h4Tags: string[];
    h5Tags: string[];
    h6Tags: string[];
    headerStructure: HeaderStructure[];
}

/**
 * HTTP status data
 */
export interface StatusData {
    statusCode: number;
    finalUrl: string;
    contentType: string;
    language?: string;
    responseTime: number;
    sizeBytes?: number;
    lastModified?: string;
}

/**
 * Response object interface
 */
export interface CrawlResponse {
    statusCode?: number;
    headers?: IncomingHttpHeaders;
    responseHeaders?: IncomingHttpHeaders;
    body?: unknown; // Changed to unknown to support various response types from crawlee
}

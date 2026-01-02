import type { CheerioAPI } from 'cheerio';
import type { IncomingHttpHeaders } from 'http';

/**
 * Page metrics data structure
 */
export interface PageMetrics {
    // Title metrics
    title: string;
    titleLength: number;
    titlePixelWidth?: number;
    hasMissingTitle: boolean;
    
    // Meta description metrics
    metaDescription: string;
    metaDescriptionLength: number;
    metaDescriptionPixelWidth?: number;
    hasMissingMetaDescription: boolean;
    
    // Meta tags
    metaKeywords?: string;
    metaKeywordsLength?: number;
    metaRobots?: string;
    canonicalUrl?: string;
    viewport?: string;
    
    // Headers
    h1Tags: string[];
    hasMultipleH1: boolean;
    h2Tags: string[];
    h3Tags: string[];
    h4Tags: string[];
    h5Tags: string[];
    h6Tags: string[];
    headerStructure: HeaderStructure[];
    
    // HTTP status
    statusCode: number;
    finalUrl: string;
    contentType: string;
    language?: string;
    responseTime: number;
    lastModified?: string;
    
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
    lastModified?: string;
}

/**
 * Response object interface
 */
export interface CrawlResponse {
    statusCode?: number;
    headers?: IncomingHttpHeaders;
    responseHeaders?: IncomingHttpHeaders;
}

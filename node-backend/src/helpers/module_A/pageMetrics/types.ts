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
    amphtmlUrl?: string;
    mobileAlternateUrl?: string;
    
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
    cookies?: string; // JSON string of cookies
    httpVersion?: string; // HTTP protocol version
    
    // Redirect data
    redirectUrl?: string;
    redirectType?: string;
    
    // Structured data
    structuredData: StructuredDataItem[];
    
    // Table extraction
    tables: TableData;
    
    // FAQ extraction
    faqs: FaqData;
    
    // Mixed Content detection
    mixedContent: MixedContentData;
    
    // Header Structure Mapping
    headerStructureMapping: HeaderStructureMapping;
    
    // Viewport Meta Extraction (enhanced)
    viewportMeta: ViewportData;
    
    // Structured Data Detection (enhanced)
    structuredDataDetection: StructuredDataDetection;
    
    // Structured Data Type Identification
    structuredDataTypeIdentification: StructuredDataTypeIdentification;
    
    // Page Size Measurements
    pageSizeMeasurement: PageSizeMeasurement;
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
    cookies?: string; // JSON string of cookies
    httpVersion?: string; // HTTP protocol version
}

/**
 * Table extraction result
 */
export interface TableData {
    tables: TableInfo[];
    tableCount: number;
    hasTables: boolean;
}

/**
 * Information about a single table
 */
export interface TableInfo {
    index: number; // 0-based index of table on page
    rowCount: number;
    columnCount: number;
    hasHeaders: boolean;
    hasData: boolean;
    isStructured: boolean; // Has headers and data with multiple columns
    headers?: string[]; // Header row values
    data?: string[][]; // Data rows (array of arrays)
    caption?: string; // Table caption if present
    id?: string; // Table ID attribute if present
    className?: string; // Table class attribute if present
    json: string; // JSON representation of the table
}

/**
 * FAQ extraction result
 */
export interface FaqData {
    hasFaqs: boolean;
    faqCount: number;
    faqScore: number; // Confidence score (0-10)
    detectionMethod: string; // 'schema', 'html', 'heuristic', 'accordion', 'none', or combinations
    faqSchemaPresent: boolean; // Whether FAQ schema markup is present
    faqPairs: FaqInfo[];
}

/**
 * Information about a single FAQ pair
 */
export interface FaqInfo {
    index: number;
    question: string;
    answer: string;
    source: 'schema' | 'html' | 'heuristic' | 'accordion';
    hasSchema: boolean;
}

/**
 * Mixed Content detection result
 */
export interface MixedContentData {
    hasMixedContent: boolean;
    severity: 'none' | 'warning' | 'critical';
    activeMixedContentCount: number; // Critical (script, CSS, iframe, object)
    passiveMixedContentCount: number; // Warning (images, video, audio)
    totalInsecureResources: number;
    resources: MixedContentResource[];
}

/**
 * Information about a single mixed content resource
 */
export interface MixedContentResource {
    url: string;
    type: string; // 'script', 'stylesheet', 'image', 'iframe', 'video', 'audio', 'object', 'css-background', 'css-import'
    severity: 'critical' | 'warning';
    tag: string; // HTML tag name
    attribute: string; // Attribute name (src, href, etc.)
}

/**
 * Header Structure Mapping
 */
export interface HeaderStructureMapping {
    headings: HeaderHierarchyNode[];
    hierarchy: HeaderHierarchyNode[];
    h1Count: number;
    totalHeadings: number;
    hasIssues: boolean;
    issues: HeaderIssue[];
}

/**
 * Header hierarchy node with children
 */
export interface HeaderHierarchyNode {
    index: number;
    level: number;
    tag: string;
    text: string;
    xpath?: string;
    children?: HeaderHierarchyNode[];
}

/**
 * Header structure issue
 */
export interface HeaderIssue {
    type: 'missing_headings' | 'missing_h1' | 'multiple_h1' | 'skipped_level' | 'empty_heading' | 'first_not_h1';
    severity: 'info' | 'warning' | 'error';
    message: string;
}

/**
 * Viewport Meta Extraction
 */
export interface ViewportData {
    present: boolean;
    content: string | null;
    status: 'ok' | 'warning' | 'error' | 'missing';
    isValid: boolean;
    hasWidthDeviceWidth: boolean;
    hasInitialScale: boolean;
    isUserScalable: boolean | null;
    isRestrictive: boolean;
    issues: string[];
}

/**
 * Enhanced Structured Data Detection
 */
export interface StructuredDataDetection {
    present: boolean;
    format: string; // 'json-ld', 'microdata', 'json-ld, microdata', or 'none'
    formats: string[]; // Array of formats found
    itemCount: number;
    items: StructuredDataItem[];
}

/**
 * Enhanced Structured Data Item
 */
export interface StructuredDataItem {
    type: 'json-ld' | 'microdata' | 'rdfa';
    schemaType?: string;
    data: any;
    isValid?: boolean;
}

/**
 * Structured Data Type Identification
 */
export interface StructuredDataTypeIdentification {
    types: string[]; // Array of unique schema types found
    typeCount: number;
    typeCounts: Record<string, number>; // Count of each type
    priorityType: string | null; // Most important/primary type
    hasCommonTypes: boolean; // Whether common types are present
}

/**
 * Response object interface
 */
export interface CrawlResponse {
    statusCode?: number;
    headers?: IncomingHttpHeaders;
    responseHeaders?: IncomingHttpHeaders;
    body?: unknown; // Changed to unknown to support various response types from crawlee
    url?: string; // The final URL after following redirects
}

/**
 * Page Size Measurement Data
 */
export interface PageSizeMeasurement {
    // Page Size - Total data needed to load the page (HTML + all resources)
    pageSizeBytes: number;
    pageSizeStatus: 'Small' | 'Medium' | 'Large';
    
    // HTML Size - Size of the HTML document only
    htmlSizeBytes: number;
    htmlSizeStatus: 'Good' | 'Warning' | 'Large';
    
    // Total Resource Size - Size of all external assets
    totalResourceSizeBytes: number;
    resourceSizeBreakdown?: {
        css: number;
        js: number;
        images: number;
        fonts: number;
        media: number;
        other: number;
    };
}

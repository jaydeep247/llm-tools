import type { CheerioAPI } from 'cheerio';

/**
 * Extracted link data
 */
export interface ExtractedLink {
    href: string;
    absoluteUrl: string;
    isInternal: boolean;
    isValid: boolean;
}

/**
 * Link extraction options
 */
export interface LinkExtractionOptions {
    baseUrl: string;
    allowedHost: string;
    allowSubdomains: boolean;
    denyParamPrefixes?: string[];
}

/**
 * Links for crawling result
 */
export interface LinksForCrawling {
    internalLinks: string[];
    externalLinks: string[];
    totalLinks: number;
}

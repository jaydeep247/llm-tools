/**
 * Link data for detailed analysis
 */
export interface LinkData {
    sessionId: number;
    sourcePageId: number;
    sourceUrl: string;
    targetUrl: string;
    targetPageId?: number;
    isInternal: boolean;
    anchorText?: string;
    xpath?: string;
    position?: string;
    rel?: string;
    nofollow?: boolean;
    isJsRendered?: boolean;
}

/**
 * Link analysis options
 */
export interface LinkAnalysisOptions {
    sessionId: number;
    sourcePageId: number;
    sourceUrl: string;
    allowedHost: string;
    allowSubdomains: boolean;
}

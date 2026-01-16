/**
 * Redirect information
 */
export interface RedirectInfo {
    url: string;
    statusCode: number;
    redirectType: '301' | '302' | '307' | '308' | 'meta' | 'js';
    targetUrl?: string;
    isChain: boolean;
    chainLength?: number;
    isLoop: boolean;
}

/**
 * Redirect chain
 */
export interface RedirectChain {
    startUrl: string;
    endUrl: string;
    chain: RedirectInfo[];
    chainLength: number;
    hasLoop: boolean;
}

/**
 * Redirects summary
 */
export interface RedirectsSummary {
    totalRedirects: number;
    redirect301Count: number;
    redirect302Count: number;
    redirect307Count: number;
    redirect308Count: number;
    redirectChains: number;
    redirectLoops: number;
    brokenRedirects: number;
}

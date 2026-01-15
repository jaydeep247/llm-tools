/**
 * Link status information
 */
export interface LinkStatus {
    url: string;
    statusCode: number;
    isBroken: boolean;
    errorType?: 'not_found' | 'gone' | 'server_error' | 'timeout' | 'unreachable';
    errorMessage?: string;
    isInternal: boolean;
}

/**
 * Broken links summary
 */
export interface BrokenLinksSummary {
    totalBrokenLinks: number;
    brokenInternalLinks: number;
    brokenExternalLinks: number;
    notFoundErrors: number; // 404
    goneErrors: number; // 410
    serverErrors: number; // 5xx
    timeoutErrors: number;
    unreachableErrors: number;
    brokenLinks: LinkStatus[];
}

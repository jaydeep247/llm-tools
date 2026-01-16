import type { LinkStatus } from './types.js';

/**
 * Check if a status code indicates a broken link
 */
export function isBrokenLink(statusCode: number): boolean {
    return statusCode === 404 || 
           statusCode === 410 || 
           statusCode >= 500 || 
           statusCode === 0; // 0 indicates timeout/unreachable
}

/**
 * Determine the error type based on status code
 */
export function getErrorType(statusCode: number): 
    'not_found' | 'gone' | 'server_error' | 'timeout' | 'unreachable' | undefined {
    if (statusCode === 404) return 'not_found';
    if (statusCode === 410) return 'gone';
    if (statusCode >= 500 && statusCode < 600) return 'server_error';
    if (statusCode === 0) return 'timeout';
    return undefined;
}

/**
 * Get error message for a status code
 */
export function getErrorMessage(statusCode: number): string {
    const messages: Record<number, string> = {
        0: 'Timeout or unreachable',
        404: 'Page not found',
        410: 'Page gone (permanently removed)',
        500: 'Internal server error',
        502: 'Bad gateway',
        503: 'Service unavailable',
        504: 'Gateway timeout'
    };
    
    if (messages[statusCode]) {
        return messages[statusCode];
    }
    
    if (statusCode >= 500 && statusCode < 600) {
        return `Server error (${statusCode})`;
    }
    
    return `HTTP error ${statusCode}`;
}

/**
 * Create a link status object
 */
export function createLinkStatus(
    url: string,
    statusCode: number,
    isInternal: boolean
): LinkStatus {
    const broken = isBrokenLink(statusCode);
    const errorType = broken ? getErrorType(statusCode) : undefined;
    const errorMessage = broken ? getErrorMessage(statusCode) : undefined;
    
    return {
        url,
        statusCode,
        isBroken: broken,
        errorType,
        errorMessage,
        isInternal
    };
}

/**
 * Filter broken links from a list of link statuses
 */
export function filterBrokenLinks(links: LinkStatus[]): LinkStatus[] {
    return links.filter(link => link.isBroken);
}

/**
 * Categorize broken links by error type
 */
export function categorizeBrokenLinks(brokenLinks: LinkStatus[]): {
    notFoundErrors: LinkStatus[];
    goneErrors: LinkStatus[];
    serverErrors: LinkStatus[];
    timeoutErrors: LinkStatus[];
    unreachableErrors: LinkStatus[];
} {
    return {
        notFoundErrors: brokenLinks.filter(l => l.errorType === 'not_found'),
        goneErrors: brokenLinks.filter(l => l.errorType === 'gone'),
        serverErrors: brokenLinks.filter(l => l.errorType === 'server_error'),
        timeoutErrors: brokenLinks.filter(l => l.errorType === 'timeout'),
        unreachableErrors: brokenLinks.filter(l => l.errorType === 'unreachable')
    };
}

/**
 * Get broken links summary statistics
 */
export function getBrokenLinksSummary(links: LinkStatus[]): {
    totalBrokenLinks: number;
    brokenInternalLinks: number;
    brokenExternalLinks: number;
    notFoundErrors: number;
    goneErrors: number;
    serverErrors: number;
    timeoutErrors: number;
    unreachableErrors: number;
} {
    const brokenLinks = filterBrokenLinks(links);
    const categorized = categorizeBrokenLinks(brokenLinks);
    
    return {
        totalBrokenLinks: brokenLinks.length,
        brokenInternalLinks: brokenLinks.filter(l => l.isInternal).length,
        brokenExternalLinks: brokenLinks.filter(l => !l.isInternal).length,
        notFoundErrors: categorized.notFoundErrors.length,
        goneErrors: categorized.goneErrors.length,
        serverErrors: categorized.serverErrors.length,
        timeoutErrors: categorized.timeoutErrors.length,
        unreachableErrors: categorized.unreachableErrors.length
    };
}

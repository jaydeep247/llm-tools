import type { RedirectInfo } from './types.js';

/**
 * Check if status code is a redirect
 */
export function isRedirect(statusCode: number): boolean {
    return statusCode === 301 || 
           statusCode === 302 || 
           statusCode === 307 || 
           statusCode === 308;
}

/**
 * Get redirect type from status code
 */
export function getRedirectType(statusCode: number): '301' | '302' | '307' | '308' | undefined {
    if (statusCode === 301) return '301';
    if (statusCode === 302) return '302';
    if (statusCode === 307) return '307';
    if (statusCode === 308) return '308';
    return undefined;
}

/**
 * Detect redirect chains
 * A redirect chain occurs when one redirect leads to another redirect
 * 
 * Note: This is a placeholder for future implementation
 * Actual implementation would require following redirects during crawl
 */
export function detectRedirectChains(redirects: RedirectInfo[]): RedirectInfo[] {
    // TODO: Implement redirect chain detection
    // This would require tracking the full redirect path during crawling
    return redirects.filter(r => r.isChain);
}

/**
 * Detect redirect loops
 * A redirect loop occurs when redirects form a circular chain
 * 
 * Note: This is a placeholder for future implementation
 */
export function detectRedirectLoops(redirects: RedirectInfo[]): RedirectInfo[] {
    // TODO: Implement redirect loop detection
    return redirects.filter(r => r.isLoop);
}

/**
 * Validate redirect (SEO best practices)
 */
export function validateRedirect(redirect: RedirectInfo): {
    isValid: boolean;
    issues: string[];
} {
    const issues: string[] = [];
    
    // 302 redirects should generally be 301 for permanent moves
    if (redirect.redirectType === '302') {
        issues.push('Using 302 (temporary) redirect - consider 301 (permanent) if this is a permanent move');
    }
    
    // Redirect chains are bad for SEO
    if (redirect.isChain && redirect.chainLength && redirect.chainLength > 1) {
        issues.push(`Redirect chain detected (${redirect.chainLength} hops) - should redirect directly to final URL`);
    }
    
    // Redirect loops are critical errors
    if (redirect.isLoop) {
        issues.push('CRITICAL: Redirect loop detected');
    }
    
    return {
        isValid: issues.length === 0,
        issues
    };
}

/**
 * Get redirect summary statistics
 */
export function getRedirectsSummary(redirects: RedirectInfo[]): {
    totalRedirects: number;
    redirect301Count: number;
    redirect302Count: number;
    redirect307Count: number;
    redirect308Count: number;
    redirectChains: number;
    redirectLoops: number;
} {
    return {
        totalRedirects: redirects.length,
        redirect301Count: redirects.filter(r => r.redirectType === '301').length,
        redirect302Count: redirects.filter(r => r.redirectType === '302').length,
        redirect307Count: redirects.filter(r => r.redirectType === '307').length,
        redirect308Count: redirects.filter(r => r.redirectType === '308').length,
        redirectChains: redirects.filter(r => r.isChain).length,
        redirectLoops: redirects.filter(r => r.isLoop).length
    };
}

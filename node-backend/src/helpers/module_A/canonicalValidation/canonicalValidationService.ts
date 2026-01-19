/**
 * Canonical Validation Service
 * Validates canonical URLs for SEO correctness and safety
 */

export type CanonicalValidationStatus = 'Valid' | 'Invalid' | 'Missing' | 'Redirect' | 'Error' | 'Not Found' | 'Blocked';

export interface CanonicalValidationResult {
    canonicalUrl: string | null; // Extracted canonical URL
    validationStatus: CanonicalValidationStatus;
    validationMessage: string;
    isSelfReferencing: boolean; // Whether canonical points to the same page
    pointsToDifferentDomain: boolean;
    pointsToRedirect: boolean;
    pointsTo404: boolean;
    pointsToBlocked: boolean;
}

/**
 * Extract canonical URL from HTML
 */
export function extractCanonicalUrl($: any, currentUrl: string): string | null {
    const canonicalElement = $('link[rel="canonical"]');
    let canonicalUrl = canonicalElement.attr('href')?.trim();
    
    if (!canonicalUrl) {
        return null;
    }
    
    // Resolve relative canonical URLs
    if (!canonicalUrl.startsWith('http')) {
        try {
            canonicalUrl = new URL(canonicalUrl, currentUrl).toString();
        } catch {
            return null;
        }
    }
    
    return canonicalUrl;
}

/**
 * Validate canonical URL comprehensively
 * Checks: format, status code, redirects, 404s, robots blocking, domain mismatch
 */
export async function validateCanonicalUrl(
    canonicalUrl: string | null,
    currentUrl: string
): Promise<CanonicalValidationResult> {
    // No canonical tag
    if (!canonicalUrl || canonicalUrl.trim().length === 0) {
        return {
            canonicalUrl: null,
            validationStatus: 'Missing',
            validationMessage: 'No canonical tag found',
            isSelfReferencing: false,
            pointsToDifferentDomain: false,
            pointsToRedirect: false,
            pointsTo404: false,
            pointsToBlocked: false
        };
    }
    
    // Check URL format
    let canonical: URL;
    let current: URL;
    try {
        canonical = new URL(canonicalUrl);
        current = new URL(currentUrl);
    } catch {
        return {
            canonicalUrl,
            validationStatus: 'Invalid',
            validationMessage: 'Invalid canonical URL format',
            isSelfReferencing: false,
            pointsToDifferentDomain: false,
            pointsToRedirect: false,
            pointsTo404: false,
            pointsToBlocked: false
        };
    }
    
    // Check if self-referencing
    const isSelfReferencing = canonical.href === current.href || 
                              canonical.href.replace(/\/$/, '') === current.href.replace(/\/$/, '');
    
    // Check if points to different domain
    const pointsToDifferentDomain = canonical.hostname !== current.hostname;
    
    // If different domain, that's usually intentional (cross-domain canonical)
    // But we'll still validate the target URL
    if (pointsToDifferentDomain) {
        // Cross-domain canonical - validate the target
        try {
            const response = await fetch(canonicalUrl, {
                method: 'HEAD',
                redirect: 'follow',
                signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (response.status === 404) {
                return {
                    canonicalUrl,
                    validationStatus: 'Not Found',
                    validationMessage: `Canonical points to 404 on different domain: ${canonical.hostname}`,
                    isSelfReferencing: false,
                    pointsToDifferentDomain: true,
                    pointsToRedirect: false,
                    pointsTo404: true,
                    pointsToBlocked: false
                };
            }
            
            if (response.status >= 300 && response.status < 400) {
                return {
                    canonicalUrl,
                    validationStatus: 'Redirect',
                    validationMessage: `Canonical points to redirect on different domain: ${canonical.hostname}`,
                    isSelfReferencing: false,
                    pointsToDifferentDomain: true,
                    pointsToRedirect: true,
                    pointsTo404: false,
                    pointsToBlocked: false
                };
            }
            
            // Check for noindex/robots blocking
            const xRobotsTag = response.headers.get('x-robots-tag');
            if (xRobotsTag && /noindex/i.test(xRobotsTag)) {
                return {
                    canonicalUrl,
                    validationStatus: 'Blocked',
                    validationMessage: `Canonical points to noindex page on different domain: ${canonical.hostname}`,
                    isSelfReferencing: false,
                    pointsToDifferentDomain: true,
                    pointsToRedirect: false,
                    pointsTo404: false,
                    pointsToBlocked: true
                };
            }
            
            if (response.status === 200) {
                return {
                    canonicalUrl,
                    validationStatus: 'Valid',
                    validationMessage: `Valid cross-domain canonical to ${canonical.hostname}`,
                    isSelfReferencing: false,
                    pointsToDifferentDomain: true,
                    pointsToRedirect: false,
                    pointsTo404: false,
                    pointsToBlocked: false
                };
            }
            
            return {
                canonicalUrl,
                validationStatus: 'Error',
                validationMessage: `Canonical returns status ${response.status} on different domain`,
                isSelfReferencing: false,
                pointsToDifferentDomain: true,
                pointsToRedirect: false,
                pointsTo404: false,
                pointsToBlocked: false
            };
        } catch (error: any) {
            return {
                canonicalUrl,
                validationStatus: 'Error',
                validationMessage: `Failed to validate cross-domain canonical: ${error.message}`,
                isSelfReferencing: false,
                pointsToDifferentDomain: true,
                pointsToRedirect: false,
                pointsTo404: false,
                pointsToBlocked: false
            };
        }
    }
    
    // Same domain - validate more thoroughly
    try {
        const response = await fetch(canonicalUrl, {
            method: 'HEAD',
            redirect: 'follow',
            signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        // Check for 404
        if (response.status === 404) {
            return {
                canonicalUrl,
                validationStatus: 'Not Found',
                validationMessage: 'Canonical points to 404 page',
                isSelfReferencing,
                pointsToDifferentDomain: false,
                pointsToRedirect: false,
                pointsTo404: true,
                pointsToBlocked: false
            };
        }
        
        // Check for redirects
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            return {
                canonicalUrl,
                validationStatus: 'Redirect',
                validationMessage: `Canonical points to redirect (${response.status}): ${location || 'unknown'}`,
                isSelfReferencing,
                pointsToDifferentDomain: false,
                pointsToRedirect: true,
                pointsTo404: false,
                pointsToBlocked: false
            };
        }
        
        // Check for noindex/robots blocking
        const xRobotsTag = response.headers.get('x-robots-tag');
        if (xRobotsTag && /noindex/i.test(xRobotsTag)) {
            return {
                canonicalUrl,
                validationStatus: 'Blocked',
                validationMessage: 'Canonical points to noindex page',
                isSelfReferencing,
                pointsToDifferentDomain: false,
                pointsToRedirect: false,
                pointsTo404: false,
                pointsToBlocked: true
            };
        }
        
        // Check for 200 OK
        if (response.status === 200) {
            return {
                canonicalUrl,
                validationStatus: 'Valid',
                validationMessage: isSelfReferencing 
                    ? 'Valid self-referencing canonical' 
                    : 'Valid canonical URL',
                isSelfReferencing,
                pointsToDifferentDomain: false,
                pointsToRedirect: false,
                pointsTo404: false,
                pointsToBlocked: false
            };
        }
        
        // Other status codes
        return {
            canonicalUrl,
            validationStatus: 'Error',
            validationMessage: `Canonical returns status ${response.status}`,
            isSelfReferencing,
            pointsToDifferentDomain: false,
            pointsToRedirect: false,
            pointsTo404: false,
            pointsToBlocked: false
        };
    } catch (error: any) {
        // Network error or timeout
        return {
            canonicalUrl,
            validationStatus: 'Error',
            validationMessage: `Failed to validate canonical: ${error.message}`,
            isSelfReferencing,
            pointsToDifferentDomain: false,
            pointsToRedirect: false,
            pointsTo404: false,
            pointsToBlocked: false
        };
    }
}

/**
 * Extract and validate canonical in one call
 */
export async function extractAndValidateCanonical(
    $: any,
    currentUrl: string
): Promise<CanonicalValidationResult> {
    const canonicalUrl = extractCanonicalUrl($, currentUrl);
    return await validateCanonicalUrl(canonicalUrl, currentUrl);
}

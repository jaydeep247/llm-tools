/**
 * Meta Description Detection Service
 * Detects missing meta descriptions and duplicate meta descriptions across pages
 */

export type MetaDescriptionStatus = 'OK' | 'Missing' | 'Duplicate';

export interface MetaDescriptionDetectionResult {
    metaDescriptionStatus: MetaDescriptionStatus;
    duplicateMetaDescriptionCount: number;
    duplicateWith: string[]; // Array of URLs with the same meta description
}

/**
 * Placeholder values that indicate a missing/invalid meta description
 */
const PLACEHOLDER_DESCRIPTIONS = new Set([
    '',
    ' ',
    'null',
    'undefined',
    'no description',
    'description'
]);

/**
 * Error meta descriptions that should be skipped from duplicate detection
 * These are typically system-generated error messages
 */
const ERROR_DESCRIPTIONS = new Set([
    'request failed',
    'error',
    'page not found',
    'not found',
    '404',
    '500',
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
    'timeout',
    'unreachable',
    'forbidden',
    'unauthorized',
    'bad request',
    'server error',
    'connection error',
    'network error',
    'failed',
    'error loading page',
    'page error',
    'access denied'
]);

/**
 * Normalize a meta description for comparison
 * - Convert to lowercase
 * - Trim whitespace
 * - Normalize multiple spaces to single space
 * - Remove extra punctuation at the end
 */
export function normalizeMetaDescription(description: string | null | undefined): string {
    if (!description) return '';
    
    let normalized = description.trim().toLowerCase();
    
    // Normalize multiple spaces to single space
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Remove trailing punctuation (but keep meaningful punctuation)
    normalized = normalized.replace(/[.,;:!?]+$/, '').trim();
    
    return normalized;
}

/**
 * Check if a meta description is missing or invalid
 */
export function isMetaDescriptionMissing(description: string | null | undefined): boolean {
    if (!description) return true;
    
    const trimmed = description.trim();
    
    // Empty or whitespace only
    if (trimmed.length === 0) return true;
    
    // Check for placeholder values
    if (PLACEHOLDER_DESCRIPTIONS.has(trimmed.toLowerCase())) return true;
    
    return false;
}

/**
 * Check if a meta description is an error description that should be skipped
 */
export function isErrorMetaDescription(description: string | null | undefined): boolean {
    if (!description) return false;
    
    const normalized = description.trim().toLowerCase();
    
    // Check exact matches
    if (ERROR_DESCRIPTIONS.has(normalized)) return true;
    
    // Check if description starts with common error patterns
    const errorPatterns = [
        /^error\s+/i,
        /^failed\s+/i,
        /^\d{3}\s+/i, // HTTP status codes like "404", "500"
        /^http\s+error/i,
        /^server\s+error/i,
        /^connection\s+error/i,
        /^network\s+error/i
    ];
    
    return errorPatterns.some(pattern => pattern.test(normalized));
}

/**
 * Detect missing meta description status for a single page
 */
export function detectMissingMetaDescription(description: string | null | undefined): MetaDescriptionStatus {
    return isMetaDescriptionMissing(description) ? 'Missing' : 'OK';
}

/**
 * Build a meta description index for duplicate detection
 * Returns a map: normalizedDescription -> array of URLs
 */
export function buildMetaDescriptionIndex(
    pages: Array<{ url: string; metaDescription: string | null | undefined }>
): Map<string, string[]> {
    const index = new Map<string, string[]>();
    
    for (const page of pages) {
        if (isMetaDescriptionMissing(page.metaDescription)) {
            // Skip missing meta descriptions for duplicate detection
            continue;
        }
        
        if (isErrorMetaDescription(page.metaDescription)) {
            // Skip error meta descriptions (like "Request Failed") from duplicate detection
            continue;
        }
        
        const normalized = normalizeMetaDescription(page.metaDescription);
        if (normalized.length === 0) {
            continue;
        }
        
        // Skip very short descriptions (likely placeholders)
        if (normalized.length < 10) {
            continue;
        }
        
        if (!index.has(normalized)) {
            index.set(normalized, []);
        }
        index.get(normalized)!.push(page.url);
    }
    
    return index;
}

/**
 * Detect duplicate meta descriptions for a single page given a description index
 */
export function detectDuplicateMetaDescription(
    url: string,
    metaDescription: string | null | undefined,
    descriptionIndex: Map<string, string[]>
): MetaDescriptionDetectionResult {
    // First check if meta description is missing
    if (isMetaDescriptionMissing(metaDescription)) {
        return {
            metaDescriptionStatus: 'Missing',
            duplicateMetaDescriptionCount: 0,
            duplicateWith: []
        };
    }
    
    // Skip error meta descriptions - don't mark them as duplicates
    if (isErrorMetaDescription(metaDescription)) {
        return {
            metaDescriptionStatus: 'OK',
            duplicateMetaDescriptionCount: 0,
            duplicateWith: []
        };
    }
    
    const normalized = normalizeMetaDescription(metaDescription);
    if (normalized.length === 0 || normalized.length < 10) {
        return {
            metaDescriptionStatus: 'Missing',
            duplicateMetaDescriptionCount: 0,
            duplicateWith: []
        };
    }
    
    // Find all URLs with the same normalized meta description
    const duplicateUrls = descriptionIndex.get(normalized) || [];
    
    // Filter out the current URL
    const otherUrls = duplicateUrls.filter(u => u !== url);
    
    if (otherUrls.length === 0) {
        return {
            metaDescriptionStatus: 'OK',
            duplicateMetaDescriptionCount: 0,
            duplicateWith: []
        };
    }
    
    // Determine status based on count
    const totalCount = duplicateUrls.length;
    const status: MetaDescriptionStatus = totalCount > 5 ? 'Duplicate' : 'Duplicate';
    
    return {
        metaDescriptionStatus: status,
        duplicateMetaDescriptionCount: totalCount,
        duplicateWith: otherUrls
    };
}

/**
 * Batch detect meta description issues for all pages in a session
 * This is more efficient than detecting one by one
 */
export function batchDetectMetaDescriptionIssues(
    pages: Array<{ url: string; metaDescription: string | null | undefined }>
): Map<string, MetaDescriptionDetectionResult> {
    const results = new Map<string, MetaDescriptionDetectionResult>();
    
    // Build meta description index
    const descriptionIndex = buildMetaDescriptionIndex(pages);
    
    // Detect for each page
    for (const page of pages) {
        const result = detectDuplicateMetaDescription(page.url, page.metaDescription, descriptionIndex);
        results.set(page.url, result);
    }
    
    return results;
}

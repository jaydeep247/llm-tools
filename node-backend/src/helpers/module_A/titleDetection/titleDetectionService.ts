/**
 * Title Detection Service
 * Detects missing titles and duplicate titles across pages
 */

export type TitleStatus = 'OK' | 'Missing' | 'Duplicate';

export interface TitleDetectionResult {
    titleStatus: TitleStatus;
    duplicateTitleCount: number;
    duplicateWith: string[]; // Array of URLs with the same title
}

/**
 * Placeholder values that indicate a missing/invalid title
 */
const PLACEHOLDER_TITLES = new Set([
    '',
    ' ',
    'null',
    'undefined',
    'home',
    'index'
]);

/**
 * Error titles that should be skipped from duplicate detection
 * These are typically system-generated error messages
 */
const ERROR_TITLES = new Set([
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
 * Check if a title is an error title that should be skipped
 */
export function isErrorTitle(title: string | null | undefined): boolean {
    if (!title) return false;
    
    const normalized = title.trim().toLowerCase();
    
    // Check exact matches
    if (ERROR_TITLES.has(normalized)) return true;
    
    // Check if title starts with common error patterns
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
 * Normalize a title for comparison
 * - Convert to lowercase
 * - Trim whitespace
 * - Normalize multiple spaces to single space
 * - Optionally remove branding suffix (e.g., "| Company Name")
 */
export function normalizeTitle(title: string | null | undefined, removeBranding: boolean = true): string {
    if (!title) return '';
    
    let normalized = title.trim().toLowerCase();
    
    // Normalize multiple spaces to single space
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Optionally remove branding suffix (e.g., "| Company Name", "- Company Name")
    if (removeBranding) {
        // Remove patterns like "| Company", "- Company", "– Company", "— Company"
        normalized = normalized.replace(/\s*[|\-–—]\s*.*$/, '').trim();
    }
    
    return normalized;
}

/**
 * Check if a title is missing or invalid
 */
export function isTitleMissing(title: string | null | undefined): boolean {
    if (!title) return true;
    
    const trimmed = title.trim();
    
    // Empty or whitespace only
    if (trimmed.length === 0) return true;
    
    // Check for placeholder values
    if (PLACEHOLDER_TITLES.has(trimmed.toLowerCase())) return true;
    
    return false;
}

/**
 * Detect missing title status for a single page
 */
export function detectMissingTitle(title: string | null | undefined): TitleStatus {
    return isTitleMissing(title) ? 'Missing' : 'OK';
}

/**
 * Build a title index for duplicate detection
 * Returns a map: normalizedTitle -> array of URLs
 */
export function buildTitleIndex(
    pages: Array<{ url: string; title: string | null | undefined }>
): Map<string, string[]> {
    const index = new Map<string, string[]>();
    
    for (const page of pages) {
        if (isTitleMissing(page.title)) {
            // Skip missing titles for duplicate detection
            continue;
        }
        
        if (isErrorTitle(page.title)) {
            // Skip error titles (like "Request Failed") from duplicate detection
            continue;
        }
        
        const normalized = normalizeTitle(page.title);
        if (normalized.length === 0) {
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
 * Detect duplicate titles for a single page given a title index
 */
export function detectDuplicateTitle(
    url: string,
    title: string | null | undefined,
    titleIndex: Map<string, string[]>
): TitleDetectionResult {
    // First check if title is missing
    if (isTitleMissing(title)) {
        return {
            titleStatus: 'Missing',
            duplicateTitleCount: 0,
            duplicateWith: []
        };
    }
    
    // Skip error titles - don't mark them as duplicates
    if (isErrorTitle(title)) {
        return {
            titleStatus: 'OK',
            duplicateTitleCount: 0,
            duplicateWith: []
        };
    }
    
    const normalized = normalizeTitle(title);
    if (normalized.length === 0) {
        return {
            titleStatus: 'Missing',
            duplicateTitleCount: 0,
            duplicateWith: []
        };
    }
    
    // Find all URLs with the same normalized title
    const duplicateUrls = titleIndex.get(normalized) || [];
    
    // Filter out the current URL
    const otherUrls = duplicateUrls.filter(u => u !== url);
    
    if (otherUrls.length === 0) {
        return {
            titleStatus: 'OK',
            duplicateTitleCount: 0,
            duplicateWith: []
        };
    }
    
    // Determine status based on count
    // If many duplicates, mark as error; otherwise warning
    const totalCount = duplicateUrls.length;
    const status: TitleStatus = totalCount > 5 ? 'Duplicate' : 'Duplicate';
    
    return {
        titleStatus: status,
        duplicateTitleCount: totalCount,
        duplicateWith: otherUrls
    };
}

/**
 * Batch detect title issues for all pages in a session
 * This is more efficient than detecting one by one
 */
export function batchDetectTitleIssues(
    pages: Array<{ url: string; title: string | null | undefined }>
): Map<string, TitleDetectionResult> {
    const results = new Map<string, TitleDetectionResult>();
    
    // Build title index
    const titleIndex = buildTitleIndex(pages);
    
    // Detect for each page
    for (const page of pages) {
        const result = detectDuplicateTitle(page.url, page.title, titleIndex);
        results.set(page.url, result);
    }
    
    return results;
}

/**
 * Near-Duplicate Detection Module
 * 
 * Detects similar content across pages using:
 * - Content normalization
 * - SimHash fingerprinting
 * - Similarity comparison
 * 
 * Provides:
 * - Closest Near Duplicate Match
 * - No. Near Duplicates
 */

export * from './types.js';
export * from './contentNormalizer.js';
export * from './fingerprinting.js';
export * from './similarityCalculator.js';

import { CheerioAPI } from 'cheerio';
import { normalizeContent } from './contentNormalizer.js';
import { generateContentHash, generateSimHash } from './fingerprinting.js';
import { ContentFingerprint, NearDuplicateMetrics, SIMILARITY_THRESHOLDS } from './types.js';
import { findClosestMatch, countNearDuplicates } from './similarityCalculator.js';

/**
 * Create a content fingerprint from a page
 */
export function createFingerprint(
    $: CheerioAPI,
    pageId: number,
    sessionId: number,
    url: string,
    storeContent: boolean = false
): ContentFingerprint {
    // Extract and normalize content
    const normalizedContent = normalizeContent($);
    
    // Generate hashes
    const contentHash = generateContentHash(normalizedContent);
    const simhash = generateSimHash(normalizedContent);
    
    return {
        url,
        pageId,
        sessionId,
        contentHash,
        simhash,
        wordCount: normalizedContent.split(/\s+/).length,
        normalizedContent: storeContent ? normalizedContent : undefined
    };
}

/**
 * Calculate near-duplicate metrics for a page
 */
export function calculateNearDuplicateMetrics(
    currentPage: ContentFingerprint,
    allPages: ContentFingerprint[],
    threshold: number = SIMILARITY_THRESHOLDS.NEAR_DUPLICATE
): NearDuplicateMetrics {
    // Find closest match
    const closestMatch = findClosestMatch(currentPage, allPages, threshold);
    
    // Count near-duplicates
    const count = countNearDuplicates(currentPage, allPages, threshold);
    
    return {
        closestMatch: closestMatch ? {
            url: closestMatch.targetUrl,
            pageId: closestMatch.targetPageId,
            similarity: closestMatch.similarityScore
        } : undefined,
        nearDuplicateCount: count
    };
}

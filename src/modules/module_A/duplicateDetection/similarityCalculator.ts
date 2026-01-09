import { calculateSimilarity, generateShingles, jaccardSimilarity } from './fingerprinting.js';
import { ContentFingerprint, SimilarityResult, SIMILARITY_THRESHOLDS } from './types.js';

/**
 * Similarity Calculator - Compares content fingerprints
 */

/**
 * Compare two pages and calculate similarity score
 */
export function comparePages(
    page1: ContentFingerprint,
    page2: ContentFingerprint
): number {
    // Method 1: SimHash comparison (fast, works for near-duplicates)
    const simhashSimilarity = calculateSimilarity(page1.simhash, page2.simhash);
    
    // Method 2: Shingle comparison (more accurate, slower)
    // Only use if we have normalized content
    if (page1.normalizedContent && page2.normalizedContent) {
        const shingles1 = generateShingles(page1.normalizedContent);
        const shingles2 = generateShingles(page2.normalizedContent);
        const shingleSimilarity = jaccardSimilarity(shingles1, shingles2);
        
        // Weighted average (60% SimHash, 40% Jaccard)
        return (simhashSimilarity * 0.6) + (shingleSimilarity * 0.4);
    }
    
    return simhashSimilarity;
}

/**
 * Find all similar pages above a threshold
 */
export function findSimilarPages(
    currentPage: ContentFingerprint,
    allPages: ContentFingerprint[],
    threshold: number = SIMILARITY_THRESHOLDS.NEAR_DUPLICATE
): SimilarityResult[] {
    const results: SimilarityResult[] = [];
    
    for (const otherPage of allPages) {
        // Skip comparing page to itself
        if (otherPage.pageId === currentPage.pageId) {
            continue;
        }
        
        // Calculate similarity
        const similarity = comparePages(currentPage, otherPage);
        
        // Only include if above threshold
        if (similarity >= threshold) {
            results.push({
                sourceUrl: currentPage.url,
                sourcePageId: currentPage.pageId,
                targetUrl: otherPage.url,
                targetPageId: otherPage.pageId,
                similarityScore: similarity,
                sessionId: currentPage.sessionId
            });
        }
    }
    
    // Sort by similarity (descending)
    results.sort((a, b) => b.similarityScore - a.similarityScore);
    
    return results;
}

/**
 * Find the closest near-duplicate match
 */
export function findClosestMatch(
    currentPage: ContentFingerprint,
    allPages: ContentFingerprint[],
    threshold: number = SIMILARITY_THRESHOLDS.NEAR_DUPLICATE
): SimilarityResult | null {
    const similar = findSimilarPages(currentPage, allPages, threshold);
    return similar.length > 0 ? similar[0] : null;
}

/**
 * Count near-duplicates
 */
export function countNearDuplicates(
    currentPage: ContentFingerprint,
    allPages: ContentFingerprint[],
    threshold: number = SIMILARITY_THRESHOLDS.NEAR_DUPLICATE
): number {
    return findSimilarPages(currentPage, allPages, threshold).length;
}

/**
 * Batch compare all pages in a session
 * Returns similarity matrix
 */
export function batchComparePages(
    pages: ContentFingerprint[],
    threshold: number = SIMILARITY_THRESHOLDS.NEAR_DUPLICATE
): SimilarityResult[] {
    const results: SimilarityResult[] = [];
    
    // Compare each page with every other page
    for (let i = 0; i < pages.length; i++) {
        for (let j = i + 1; j < pages.length; j++) {
            const similarity = comparePages(pages[i], pages[j]);
            
            if (similarity >= threshold) {
                // Add bidirectional results
                results.push({
                    sourceUrl: pages[i].url,
                    sourcePageId: pages[i].pageId,
                    targetUrl: pages[j].url,
                    targetPageId: pages[j].pageId,
                    similarityScore: similarity,
                    sessionId: pages[i].sessionId
                });
                
                results.push({
                    sourceUrl: pages[j].url,
                    sourcePageId: pages[j].pageId,
                    targetUrl: pages[i].url,
                    targetPageId: pages[i].pageId,
                    similarityScore: similarity,
                    sessionId: pages[j].sessionId
                });
            }
        }
    }
    
    return results;
}

/**
 * Get similarity classification
 */
export function getSimilarityClassification(similarity: number): string {
    if (similarity >= SIMILARITY_THRESHOLDS.DUPLICATE) {
        return 'duplicate';
    } else if (similarity >= SIMILARITY_THRESHOLDS.NEAR_DUPLICATE) {
        return 'near-duplicate';
    } else if (similarity >= SIMILARITY_THRESHOLDS.RELATED) {
        return 'related';
    } else {
        return 'unique';
    }
}

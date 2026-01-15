/**
 * Types for Near-Duplicate Detection System
 */

export interface ContentFingerprint {
    url: string;
    pageId: number;
    sessionId: number;
    contentHash: string;        // MD5/SHA hash of normalized content
    simhash: string;            // SimHash signature for similarity comparison
    wordCount: number;
    normalizedContent?: string; // Optional: store for debugging
}

export interface SimilarityResult {
    sourceUrl: string;
    sourcePageId: number;
    targetUrl: string;
    targetPageId: number;
    similarityScore: number;    // 0.0 to 1.0
    sessionId: number;
}

export interface NearDuplicateMetrics {
    closestMatch?: {
        url: string;
        pageId: number;
        similarity: number;     // 0.0 to 1.0 (as decimal)
    };
    nearDuplicateCount: number; // Count of pages with similarity >= threshold
}

export interface DuplicateDetectionOptions {
    sessionId: number;
    pageId: number;
    url: string;
    content: string;
    threshold?: number;         // Default: 0.75 (75% similarity)
}

/**
 * Similarity thresholds for content classification
 */
export const SIMILARITY_THRESHOLDS = {
    UNIQUE: 0.60,           // < 60% = Unique content
    RELATED: 0.75,          // 60-74% = Related content
    NEAR_DUPLICATE: 0.75,   // 75-89% = Near duplicate (WARNING)
    DUPLICATE: 0.90         // >= 90% = Very close/duplicate (CRITICAL)
} as const;

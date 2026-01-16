/**
 * Semantic Analysis Types
 * Defines interfaces for semantic similarity analysis
 */

export interface SemanticVector {
  url: string;
  vector: number[];
  normalizedContent: string;
}

export interface SemanticSimilarityResult {
  url: string;
  closestSemanticallySimilarAddress: string | null;
  semanticSimilarityScore: number;
  noSemanticallySimilar: number;
  semanticRelevanceScore: number;
}

export interface PageSemanticData {
  id: number;
  url: string;
  content: string; // Cleaned visible content
}

export interface SemanticThresholds {
  SIMILARITY_THRESHOLD: number;
  RELEVANCE_THRESHOLD: number;
  MIN_VECTOR_SIZE: number;
}

export const DEFAULT_SEMANTIC_THRESHOLDS: SemanticThresholds = {
  SIMILARITY_THRESHOLD: 0.30, // Very permissive threshold for finding matches
  RELEVANCE_THRESHOLD: 0.15, // Very permissive relevance threshold  
  MIN_VECTOR_SIZE: 20, // Very low minimum content size
};

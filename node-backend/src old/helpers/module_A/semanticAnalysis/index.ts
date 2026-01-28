/**
 * Semantic Analysis Export Index
 * Central export point for semantic analysis functionality
 */

export { type SemanticVector, type SemanticSimilarityResult, type PageSemanticData, type SemanticThresholds, DEFAULT_SEMANTIC_THRESHOLDS } from './types.js';

export { extractMainContent, normalizeContent, isContentMeaningful, type NormalizedContent } from './contentNormalizer.js';

export { vectorizeDocuments, vectorizeSingleDocument, buildVocabularyData } from './vectorCalculator.js';

export { cosineSimilarity, euclideanDistance, dotProduct, magnitude, normalizeVector, averageVector } from './embeddingService.js';

export { analyzeSessionSemanticSimilarity, analyzeSinglePageSimilarity, type PageContent } from './sessionAnalyzer.js';

export { runSemanticAnalysisForSession, storeSemanticAnalysisResults, orchestrateSemanticAnalysis } from './orchestrator.js';

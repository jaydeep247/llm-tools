/**
 * Session Analyzer
 * Analyzes pages within a crawl session for semantic similarity
 */

import { extractMainContent, normalizeContent, isContentMeaningful } from './contentNormalizer.js';
import { vectorizeDocuments, buildVocabularyData, vectorizeSingleDocument } from './vectorCalculator.js';
import { cosineSimilarity } from './embeddingService.js';
import { SemanticSimilarityResult, DEFAULT_SEMANTIC_THRESHOLDS } from './types.js';

export interface PageContent {
  id: number;
  url: string;
  htmlContent?: string;
  cleanedContent?: string;
  title?: string;
  description?: string;
  fallbackContent?: string;
}

/**
 * Analyze semantic similarity for all pages in a session
 * IMPORTANT: Call this AFTER all pages are crawled but BEFORE storing results
 */
export async function analyzeSessionSemanticSimilarity(
  pages: PageContent[],
  targetTopic?: string
): Promise<Map<number, SemanticSimilarityResult>> {
  const results = new Map<number, SemanticSimilarityResult>();

  if (pages.length < 2) {
    // Not enough pages for comparison
    console.log(`[SemanticAnalysis] Not enough pages for analysis: ${pages.length} < 2`);
    return results;
  }

  try {
    console.log(`[SemanticAnalysis] Starting analysis for ${pages.length} pages`);
    
    // Step 1: Extract and normalize content
    const normalizedPages = pages
      .map(page => {
        // Use HTML content if available, otherwise construct from title + description
        let textContent = '';
        
        if (page.htmlContent && page.htmlContent.length > 0) {
          // HTML is available, extract main content
          const mainContent = extractMainContent(page.htmlContent);
          const normalized = normalizeContent(mainContent);
          textContent = normalized.text;
          console.log(`[SemanticAnalysis] Page ${page.id}: Using HTML content (${textContent.length} chars)`);
        } else {
          // No HTML, use title and description (weighted: title repeated 3x for emphasis)
          const titleContent = `${page.title || ''} ${page.title || ''} ${page.title || ''} `;
          const descContent = page.description || (page as any).fallbackContent || '';
          const combined = `${titleContent}${descContent}`;
          const normalized = normalizeContent(combined);
          textContent = normalized.text;
          console.log(`[SemanticAnalysis] Page ${page.id}: Using title+desc (${textContent.length} chars)`);
        }

        return {
          ...page,
          cleanedContent: textContent,
          isValid: isContentMeaningful(textContent)
        };
      })
      .filter(p => p.isValid); // Only process pages with meaningful content

    console.log(`[SemanticAnalysis] After filtering: ${normalizedPages.length} valid pages`);

    if (normalizedPages.length < 2) {
      // Not enough valid pages
      console.log(`[SemanticAnalysis] Not enough valid pages after filtering`);
      return results;
    }

    // Step 2: Build vectors using TF-IDF
    const urls = normalizedPages.map(p => p.url);
    const contents = normalizedPages.map(p => p.cleanedContent!);

    console.log(`[SemanticAnalysis] Building vectors for ${urls.length} pages`);
    
    const vectors = vectorizeDocuments(urls, contents);

    console.log(`[SemanticAnalysis] Generated ${vectors.length} vectors`);

    if (vectors.length < 2) {
      console.log(`[SemanticAnalysis] Not enough vectors`);
      return results;
    }

    // Step 3: Calculate semantic similarity between pages
    for (let i = 0; i < normalizedPages.length; i++) {
      const currentPage = normalizedPages[i];
      const currentVector = vectors[i];

      // Find similarities with all other pages
      const similarities: Array<{ url: string; score: number }> = [];

      for (let j = 0; j < vectors.length; j++) {
        if (i === j) continue; // Skip self comparison

        const similarity = cosineSimilarity(currentVector.vector, vectors[j].vector);
        similarities.push({
          url: vectors[j].url,
          score: similarity
        });
      }

      // Sort by similarity score descending
      similarities.sort((a, b) => b.score - a.score);

      // ALWAYS get the closest match (even if below threshold for counting purposes)
      const closestMatch = similarities.length > 0 ? similarities[0] : null;

      // Count pages that meet the threshold (for "no_semantically_similar")
      const countAboveThreshold = similarities.filter(
        s => s.score >= DEFAULT_SEMANTIC_THRESHOLDS.SIMILARITY_THRESHOLD
      ).length;

      // Calculate semantic relevance to topic (if provided)
      // If no target topic provided, use average similarity to all pages as relevance metric
      let relevanceScore = 0;
      if (targetTopic) {
        const topicVector = vectorizeDocuments([targetTopic], [targetTopic])[0];
        relevanceScore = cosineSimilarity(currentVector.vector, topicVector.vector);
      } else if (similarities.length > 0) {
        // Calculate average similarity to all other pages as a relevance metric
        const avgSimilarity = similarities.reduce((sum, s) => sum + s.score, 0) / similarities.length;
        relevanceScore = Math.min(avgSimilarity, 1.0); // Cap at 1.0
      } else {
        relevanceScore = 0.5; // Default neutral if only one page
      }

      console.log(`[SemanticAnalysis] Page ${currentPage.id}: closest=${closestMatch?.url || 'none'} (${closestMatch?.score || 0}), count=${countAboveThreshold}, relevance=${relevanceScore}`);

      results.set(currentPage.id, {
        url: currentPage.url,
        closestSemanticallySimilarAddress: closestMatch?.url || null,
        semanticSimilarityScore: closestMatch?.score || 0,
        noSemanticallySimilar: countAboveThreshold,
        semanticRelevanceScore: relevanceScore
      });
    }
  } catch (error) {
    console.error('Error analyzing session semantic similarity:', error);
  }

  return results;
}

/**
 * Analyze a single page against other pages
 * Useful for incremental analysis during crawling
 */
export async function analyzeSinglePageSimilarity(
  targetPage: PageContent,
  allPages: PageContent[]
): Promise<SemanticSimilarityResult> {
  const defaultResult: SemanticSimilarityResult = {
    url: targetPage.url,
    closestSemanticallySimilarAddress: null,
    semanticSimilarityScore: 0,
    noSemanticallySimilar: 0,
    semanticRelevanceScore: 0.5
  };

  try {
    // Normalize content
    const targetHtml = targetPage.htmlContent || '';
    const targetContent = normalizeContent(
      extractMainContent(targetHtml)
    );

    if (!isContentMeaningful(targetContent.text)) {
      return defaultResult;
    }

    // Get other pages' normalized content
    const otherPages = allPages
      .filter(p => p.id !== targetPage.id)
      .map(page => {
        const html = page.htmlContent || '';
        const main = extractMainContent(html);
        const normalized = normalizeContent(main);
        return {
          ...page,
          cleanedContent: normalized.text,
          isValid: isContentMeaningful(normalized.text)
        };
      })
      .filter(p => p.isValid);

    if (otherPages.length === 0) {
      return defaultResult;
    }

    // Build vectors
    const allContents = [targetContent.text, ...otherPages.map(p => p.cleanedContent!)];
    const { vocab, idf } = buildVocabularyData(allContents);

    // Vectorize target page
    const targetVector = vectorizeSingleDocument(
      targetPage.url,
      targetContent.text,
      vocab,
      idf
    );

    // Vectorize other pages
    const otherVectors = otherPages.map((page, idx) =>
      vectorizeSingleDocument(page.url, page.cleanedContent!, vocab, idf)
    );

    // Calculate similarities
    const similarities: Array<{ url: string; score: number }> = otherVectors.map(vec => ({
      url: vec.url,
      score: cosineSimilarity(targetVector.vector, vec.vector)
    }));

    similarities.sort((a, b) => b.score - a.score);

    // ALWAYS get the closest match
    const closestMatch = similarities.length > 0 ? similarities[0] : null;

    const countAboveThreshold = similarities.filter(
      s => s.score >= DEFAULT_SEMANTIC_THRESHOLDS.SIMILARITY_THRESHOLD
    ).length;

    return {
      url: targetPage.url,
      closestSemanticallySimilarAddress: closestMatch?.url || null,
      semanticSimilarityScore: closestMatch?.score || 0,
      noSemanticallySimilar: countAboveThreshold,
      semanticRelevanceScore: 0.5 // Topic relevance would be calculated separately
    };
  } catch (error) {
    console.error('Error analyzing single page similarity:', error);
    return defaultResult;
  }
}

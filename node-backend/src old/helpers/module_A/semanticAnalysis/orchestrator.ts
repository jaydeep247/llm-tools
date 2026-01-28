/**
 * Semantic Analysis Orchestrator for Module A
 * Coordinates semantic similarity analysis after crawling completes
 */

import { Logger } from '../../logging/Logger.js';
import {
  analyzeSessionSemanticSimilarity,
  type PageContent,
  type SemanticSimilarityResult
} from './index.js';

interface PageDataForAnalysis {
  id: number;
  url: string;
  htmlContent?: string;
}

/**
 * Run semantic analysis on pages with provided content
 * Should be called AFTER crawling completes with the crawled page data
 * Falls back to fetching page metadata from database if no HTML provided
 */
export async function runSemanticAnalysisForSession(
  pageDataWithContent: PageDataForAnalysis[] | any[],
  sessionId: number,
  targetTopic?: string
): Promise<Map<number, SemanticSimilarityResult>> {
  const logger = Logger.getInstance();
  const startTime = Date.now();

  try {
    logger.info(`[SemanticAnalysis] Starting semantic analysis for session ${sessionId}`);

    if (!pageDataWithContent || pageDataWithContent.length === 0) {
      logger.warn(`[SemanticAnalysis] No pages found for session ${sessionId}`);
      return new Map();
    }

    logger.info(`[SemanticAnalysis] Analyzing ${pageDataWithContent.length} pages`);

    // Convert to format needed by analyzer - handle both cache pages and database pages
    const pageContents: PageContent[] = pageDataWithContent.map((page: any) => {
      // If it has htmlContent (from cache), use it; otherwise construct from title+description
      const htmlContent = page.htmlContent || '';
      const title = page.title || '';
      const description = (page as any).description || (page as any).meta_description || '';
      
      return {
        id: page.id,
        url: page.url,
        htmlContent: htmlContent,
        title: title,
        cleanedContent: undefined,
        fallbackContent: description // Store description as fallback for content
      };
    });

    // Run semantic analysis
    const results = await analyzeSessionSemanticSimilarity(pageContents, targetTopic);

    logger.info(
      `[SemanticAnalysis] Completed analysis in ${Date.now() - startTime}ms. ` +
      `Processed ${results.size} pages with semantic similarity data.`
    );

    return results;
  } catch (error) {
    logger.error(`[SemanticAnalysis] Error running semantic analysis for session ${sessionId}:`, error as Error);
    return new Map();
  }
}

/**
 * Store semantic analysis results in the database
 */
export async function storeSemanticAnalysisResults(
  pageRepository: any,
  results: Map<number, SemanticSimilarityResult>
): Promise<void> {
  const logger = Logger.getInstance();

  try {
    if (results.size === 0) {
      logger.info('[SemanticAnalysis] No results to store');
      return;
    }

    // Convert Map to format expected by repository
    const semanticDataMap = new Map(
      Array.from(results.entries()).map(([pageId, result]) => [
        pageId,
        {
          closestSemanticallySimilarAddress: result.closestSemanticallySimilarAddress,
          semanticSimilarityScore: result.semanticSimilarityScore,
          noSemanticallySimilar: result.noSemanticallySimilar,
          semanticRelevanceScore: result.semanticRelevanceScore
        }
      ])
    );

    // Store in database
    await pageRepository.updatePagesSemanticAnalysis(semanticDataMap);

    logger.info(`[SemanticAnalysis] Stored semantic analysis results for ${results.size} pages`);
  } catch (error) {
    logger.error('[SemanticAnalysis] Error storing semantic analysis results:', error as Error);
    throw error;
  }
}

/**
 * Full orchestration: analyze and store
 * Fetches pages from database (with title/description) for semantic analysis
 */
export async function orchestrateSemanticAnalysis(
  pageRepository: any,
  sessionId: number,
  pageDataWithContent?: Array<{ id: number; url: string; htmlContent: string }>,
  targetTopic?: string
): Promise<void> {
  const logger = Logger.getInstance();

  try {
    logger.info(`[SemanticAnalysis] Orchestrating semantic analysis for session ${sessionId}`);

    let pages: any[] = [];
    
    // Prefer provided page data with HTML from crawler cache
    if (pageDataWithContent && pageDataWithContent.length > 0) {
      logger.info(`[SemanticAnalysis] Using ${pageDataWithContent.length} crawled pages with HTML content`);
      pages = pageDataWithContent;
    } else {
      // Fetch all pages with metadata from database
      logger.info(`[SemanticAnalysis] Fetching pages from database...`);
      try {
        const dbPages = await pageRepository.getAllPagesForSession(sessionId);
        if (dbPages && dbPages.length > 0) {
          logger.info(`[SemanticAnalysis] Fetched ${dbPages.length} pages from database with title/description`);
          pages = dbPages;
        } else {
          logger.warn(`[SemanticAnalysis] No pages found for session ${sessionId}`);
          return;
        }
      } catch (dbError) {
        logger.error(`[SemanticAnalysis] Failed to fetch pages from database:`, dbError as Error);
        return;
      }
    }

    if (!pages || pages.length === 0) {
      logger.warn(`[SemanticAnalysis] No page data available for semantic analysis`);
      return;
    }

    // Run analysis
    const results = await runSemanticAnalysisForSession(pages, sessionId, targetTopic);

    // Store results
    if (results.size > 0) {
      await storeSemanticAnalysisResults(pageRepository, results);
    }

    logger.info(`[SemanticAnalysis] Semantic analysis orchestration complete for session ${sessionId}`);
  } catch (error) {
    logger.error(`[SemanticAnalysis] Orchestration failed for session ${sessionId}:`, error as Error);
    throw error;
  }
}

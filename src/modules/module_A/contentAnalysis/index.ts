import type { CheerioAPI } from 'cheerio';
import type { ContentMetrics } from './types.js';
import { 
    countWords, 
    analyzeTextStructure, 
    calculateTextToHtmlRatio,
    isThinContent as checkThinContent
} from './wordCounter.js';
import { analyzeReadability } from './readabilityAnalyzer.js';

/**
 * Extract all content analysis metrics from a page
 */
export function extractContentMetrics($: CheerioAPI): ContentMetrics {
    // Word counts
    const wordCountData = countWords($);
    
    // Text structure
    const textStructureData = analyzeTextStructure($);
    
    // Text-to-HTML ratio
    const textToHtmlRatio = calculateTextToHtmlRatio($);
    
    // Thin content check
    const isThinContent = checkThinContent(wordCountData.visibleWordCount);
    
    // Readability analysis
    // Clone the body to avoid mutation and extract visible text
    const $body = $('body').clone();
    $body.find('script, style, noscript, meta, link, head').remove();
    const visibleText = $body.text().trim();
    
    const readabilityData = analyzeReadability(
        visibleText,
        textStructureData.sentenceCount,
        wordCountData.visibleWordCount
    );
    
    return {
        // Word counts
        ...wordCountData,
        
        // Text structure
        ...textStructureData,
        
        // Ratios
        textToHtmlRatio,
        
        // Quality flags
        isThinContent,
        
        // Readability
        ...readabilityData
    };
}

// Re-export all types and functions
export * from './types.js';
export * from './wordCounter.js';
export * from './readabilityAnalyzer.js';

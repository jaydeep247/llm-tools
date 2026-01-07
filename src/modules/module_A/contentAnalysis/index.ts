import type { CheerioAPI } from 'cheerio';
import type { ContentMetrics } from './types.js';
import { 
    countWords, 
    analyzeTextStructure, 
    calculateTextToHtmlRatio,
    isThinContent as checkThinContent
} from './wordCounter.js';
import { analyzeReadability } from './readabilityAnalyzer.js';
import { analyzeSpellingAndGrammar } from './spellGrammarChecker.js';

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
    // Use the same text extraction method as analyzeTextStructure for consistency
    const $clone = $.load($.html());
    $clone('script, style, noscript, meta, link, head').remove();
    const visibleText = $clone('body').text().trim();
    
    // Ensure we have valid text and counts
    if (!visibleText || visibleText.length === 0) {
        // Return empty readability data if no text
        return {
            ...wordCountData,
            ...textStructureData,
            textToHtmlRatio,
            isThinContent,
            fleschReadingEase: undefined,
            fleschKincaidGrade: undefined,
            readabilityLevel: undefined,
            spellingErrors: 0,
            grammarErrors: 0
        };
    }
    
    // Use the sentence count from textStructureData, but ensure it's at least 1 if we have words
    let actualSentenceCount = textStructureData.sentenceCount;
    if (actualSentenceCount === 0 && wordCountData.visibleWordCount > 0) {
        // Recalculate sentences from the same text
        const sentences = visibleText
            .split(/[.!?]+/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        actualSentenceCount = sentences.length > 0 ? sentences.length : 1;
    }
    
    // Ensure we have valid counts
    const actualWordCount = wordCountData.visibleWordCount > 0 ? wordCountData.visibleWordCount : 1;
    if (actualSentenceCount === 0) actualSentenceCount = 1;
    
    const readabilityData = analyzeReadability(
        visibleText,
        actualSentenceCount,
        actualWordCount
    );
    
    // Spelling and Grammar check
    const spellGrammarData = analyzeSpellingAndGrammar(visibleText, false);
    
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
        ...readabilityData,
        
        // Spelling and Grammar
        spellingErrors: spellGrammarData.spellingErrors,
        grammarErrors: spellGrammarData.grammarErrors
    };
}

// Re-export all types and functions
export * from './types.js';
export * from './wordCounter.js';
export * from './readabilityAnalyzer.js';
export * from './spellGrammarChecker.js';

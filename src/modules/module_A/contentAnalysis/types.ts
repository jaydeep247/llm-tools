import type { CheerioAPI } from 'cheerio';

/**
 * Content analysis metrics
 */
export interface ContentMetrics {
    // Word counts
    totalWordCount: number;
    visibleWordCount: number;
    uniqueWordCount?: number;
    
    // Text structure
    sentenceCount: number;
    paragraphCount: number;
    averageSentenceLength: number;
    averageParagraphLength: number;
    
    // Ratios
    textToHtmlRatio: number;
    
    // Content quality flags
    isThinContent: boolean;
    
    // Readability (future)
    fleschReadingEase?: number;
    fleschKincaidGrade?: number;
    readabilityLevel?: string;
    
    // Spelling and Grammar
    spellingErrors?: number;
    grammarErrors?: number;
}

/**
 * Word count data
 */
export interface WordCountData {
    totalWordCount: number;
    visibleWordCount: number;
    uniqueWordCount?: number;
}

/**
 * Text structure data
 */
export interface TextStructureData {
    sentenceCount: number;
    paragraphCount: number;
    averageSentenceLength: number;
    averageParagraphLength: number;
}

/**
 * Readability data
 */
export interface ReadabilityData {
    fleschReadingEase?: number;
    fleschKincaidGrade?: number;
    readabilityLevel?: string;
}

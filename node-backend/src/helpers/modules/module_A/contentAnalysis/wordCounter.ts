import type { CheerioAPI } from 'cheerio';
import type { WordCountData, TextStructureData } from './types.js';

/**
 * Count words in text content
 */
export function countWords($: CheerioAPI): WordCountData {
    // Clone the DOM to avoid affecting the original
    const $clone = $.load($.html());
    
    // Remove non-content elements
    $clone('script, style, noscript, meta, link, head').remove();
    
    // Get visible text content
    const visibleText = $clone('body').text().trim();
    const visibleWordCount = visibleText ? visibleText.split(/\s+/).filter((w: string) => w.length > 0).length : 0;
    
    // Get all text including hidden content
    const allText = $clone.text().trim();
    const totalWordCount = allText ? allText.split(/\s+/).filter((w: string) => w.length > 0).length : 0;
    
    // Calculate unique words (optional, can be expensive)
    const uniqueWordCount = calculateUniqueWords(visibleText);
    
    return {
        totalWordCount,
        visibleWordCount,
        uniqueWordCount
    };
}

/**
 * Calculate unique word count
 */
function calculateUniqueWords(text: string): number {
    if (!text) return 0;
    
    const words = text.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map(w => w.replace(/[^a-z0-9]/g, ''));
    
    const uniqueWords = new Set(words);
    return uniqueWords.size;
}

/**
 * Analyze text structure (sentences, paragraphs)
 */
export function analyzeTextStructure($: CheerioAPI): TextStructureData {
    // Clone the DOM
    const $clone = $.load($.html());
    
    // Remove non-content elements
    $clone('script, style, noscript, meta, link, head').remove();
    
    // Get visible text
    const visibleText = $clone('body').text().trim();
    
    // Count sentences (improved approach: split by sentence-ending punctuation)
    // Handle multiple punctuation marks and ensure we don't count empty strings
    const sentences = visibleText
        .split(/[.!?]+/)
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);
    
    // If no sentences found but we have text, treat entire text as one sentence
    let sentenceCount = sentences.length;
    if (sentenceCount === 0 && visibleText.length > 0) {
        // Check if there are any words - if yes, it's at least one sentence
        const words = visibleText.split(/\s+/).filter((w: string) => w.length > 0);
        if (words.length > 0) {
            sentenceCount = 1;
        }
    }
    
    // Count paragraphs
    const paragraphCount = $clone('p').length || 1; // At least 1 if no <p> tags
    
    // Calculate averages
    const totalWords = visibleText.split(/\s+/).filter((w: string) => w.length > 0).length;
    const averageSentenceLength = sentenceCount > 0 ? totalWords / sentenceCount : 0;
    const averageParagraphLength = paragraphCount > 0 ? totalWords / paragraphCount : 0;
    
    return {
        sentenceCount,
        paragraphCount,
        averageSentenceLength: Math.round(averageSentenceLength * 10) / 10,
        averageParagraphLength: Math.round(averageParagraphLength * 10) / 10
    };
}

/**
 * Calculate text-to-HTML ratio
 */
export function calculateTextToHtmlRatio($: CheerioAPI): number {
    try {
        // Clone the DOM
        const $clone = $.load($.html());
        
        // Remove non-content elements
        $clone('script, style, noscript, meta, link, head').remove();
        
        // Get text content
        const textContent = $clone('body').text().trim();
        const textLength = textContent.length;
        
        // Get HTML content (after removing non-content elements)
        const htmlContent = $clone.html() || '';
        const htmlLength = htmlContent.length;
        
        // If no HTML content, return 0 (no text ratio possible)
        if (htmlLength === 0) return 0;
        
        // Calculate ratio: (text length / HTML length) * 100
        const ratio = (textLength / htmlLength) * 100;
        
        // Round to 2 decimal places
        return Math.round(ratio * 100) / 100;
    } catch (error) {
        // If there's an error calculating, return 0
        console.warn('Error calculating text-to-HTML ratio:', error);
        return 0;
    }
}

/**
 * Check if content is thin (low word count)
 */
export function isThinContent(wordCount: number, threshold: number = 300): boolean {
    return wordCount < threshold;
}

/**
 * Get content quality rating based on word count
 */
export function getContentQualityRating(wordCount: number): {
    rating: 'excellent' | 'good' | 'fair' | 'thin';
    message: string;
} {
    if (wordCount >= 1500) {
        return {
            rating: 'excellent',
            message: 'Excellent content length for SEO'
        };
    }
    
    if (wordCount >= 800) {
        return {
            rating: 'good',
            message: 'Good content length'
        };
    }
    
    if (wordCount >= 300) {
        return {
            rating: 'fair',
            message: 'Fair content length, could be expanded'
        };
    }
    
    return {
        rating: 'thin',
        message: 'Thin content - needs more content for better SEO'
    };
}

/**
 * Extract section word counts (by heading sections)
 */
export function extractSectionWordCounts($: CheerioAPI): Array<{
    heading: string;
    level: number;
    wordCount: number;
}> {
    const sections: Array<{ heading: string; level: number; wordCount: number }> = [];
    
    // Find all headings
    $('h1, h2, h3, h4, h5, h6').each((_i, el) => {
        const $heading = $(el);
        const headingText = $heading.text().trim();
        const level = parseInt(el.tagName.substring(1));
        
        // Get content until next heading of same or higher level
        let content = '';
        let $next = $heading.next();
        
        while ($next.length > 0) {
            const nextTag = $next[0].tagName?.toLowerCase();
            
            // Stop if we hit another heading of same or higher level
            if (nextTag && /^h[1-6]$/.test(nextTag)) {
                const nextLevel = parseInt(nextTag.substring(1));
                if (nextLevel <= level) break;
            }
            
            content += $next.text() + ' ';
            $next = $next.next();
        }
        
        const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;
        
        sections.push({
            heading: headingText,
            level,
            wordCount
        });
    });
    
    return sections;
}

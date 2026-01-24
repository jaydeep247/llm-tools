import type { CheerioAPI } from 'cheerio';
import crypto from 'crypto';

/**
 * Word Count Data for Page Metrics
 */
export interface PageWordCountData {
    totalWordCount: number; // Total word count (all text, excluding script/style/noscript)
    visibleWordCount: number; // Visible word count (main content only)
    uniqueWordCount: number;
    textToHtmlRatio: number;
    sentenceCount: number;
    paragraphCount: number;
    averageSentenceLength: number;
    averageParagraphLength: number;
    keywordDensity: number | null; // Keyword density percentage (0-100) or null if no keyword provided
    thinContent: boolean; // Whether page has thin content
    thinContentReason: string | null; // Reason: 'Low word count' or 'Low uniqueness'
    duplicateContent: boolean; // Whether page content is duplicate (requires session context)
    duplicateWithUrls: string[]; // URLs with duplicate content (requires session context)
    sectionWordCountMapping: Record<string, number>; // Section heading -> word count
    sectionWordCountBreakdown: Record<string, number>; // Section heading -> percentage
    headingWordCountMapping: Record<string, number>; // Heading text -> word count under heading
}

/**
 * Extract visible text from DOM, ignoring hidden elements
 */
function extractVisibleText($: CheerioAPI): string {
    const $clone = $.load($.html());
    
    // Remove script, style, noscript tags
    $clone('script').remove();
    $clone('style').remove();
    $clone('noscript').remove();
    
    // Remove elements with display:none, visibility:hidden, or aria-hidden="true"
    $clone('*').each((_i, el) => {
        const $el = $clone(el);
        const style = $el.attr('style') || '';
        const ariaHidden = $el.attr('aria-hidden');
        
        // Check for display:none or visibility:hidden in inline styles
        if (style.includes('display:none') || style.includes('display: none') || 
            style.includes('visibility:hidden') || style.includes('visibility: hidden') ||
            ariaHidden === 'true') {
            $el.remove();
        }
    });
    
    // Optionally remove footer, nav, sidebar (common boilerplate)
    $clone('footer, nav, aside').remove();
    
    // Get visible text from body
    return $clone('body').text() || '';
}

/**
 * Normalize text for word counting (lowercase, remove punctuation)
 */
function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
}

/**
 * Tokenize text into words
 */
function tokenizeWords(text: string): string[] {
    return text
        .split(/\s+/)
        .filter(word => word.trim().length > 0);
}

/**
 * Extract total word count from HTML page (all text, excluding script/style/noscript)
 * Algorithm:
 * 1. Remove script, style, noscript tags
 * 2. Extract all remaining text
 * 3. Tokenize and count
 */
function extractTotalWordCount($: CheerioAPI): number {
    const $clone = $.load($.html());
    
    // Remove script, style, and noscript tags
    $clone('script').remove();
    $clone('style').remove();
    $clone('noscript').remove();
    
    // Get all text content
    const textContent = $clone('body').text() || '';
    const words = tokenizeWords(textContent);
    return words.length;
}

/**
 * Extract visible word count from HTML page
 * Algorithm:
 * 1. Parse DOM
 * 2. Ignore: display:none, visibility:hidden, aria-hidden="true", Footer, nav, sidebar
 * 3. Extract text from visible nodes
 * 4. Tokenize and count
 */
function extractVisibleWordCount($: CheerioAPI): number {
    const visibleText = extractVisibleText($);
    const words = tokenizeWords(visibleText);
    return words.length;
}

/**
 * Extract unique word count
 * Algorithm:
 * 1. Take visible words
 * 2. Normalize: lowercase, remove punctuation
 * 3. Convert to a set
 * 4. Count unique items
 */
function extractUniqueWordCount($: CheerioAPI): number {
    const visibleText = extractVisibleText($);
    const normalizedText = normalizeText(visibleText);
    const words = tokenizeWords(normalizedText);
    const uniqueWords = new Set(words);
    return uniqueWords.size;
}

/**
 * Calculate text-to-HTML ratio
 * Algorithm:
 * 1. Measure total HTML size (bytes)
 * 2. Measure visible text size (bytes)
 * 3. Calculate ratio
 */
function calculateTextToHtmlRatio($: CheerioAPI): number {
    const html = $.html();
    const htmlSizeBytes = Buffer.byteLength(html, 'utf8');
    
    const visibleText = extractVisibleText($);
    const textSizeBytes = Buffer.byteLength(visibleText, 'utf8');
    
    if (htmlSizeBytes === 0) return 0;
    
    const ratio = (textSizeBytes / htmlSizeBytes) * 100;
    return Math.round(ratio * 100) / 100; // Round to 2 decimal places
}

/**
 * Extract sentence count
 * Algorithm:
 * 1. Take visible text
 * 2. Split on sentence delimiters: ., !, ?
 * 3. Filter empty results
 * 4. Count
 */
function extractSentenceCount($: CheerioAPI): number {
    const visibleText = extractVisibleText($);
    
    if (!visibleText.trim()) return 0;
    
    // Split on sentence delimiters
    const sentences = visibleText
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    // If no sentences found but we have text, treat entire text as one sentence
    if (sentences.length === 0 && visibleText.trim().length > 0) {
        const words = tokenizeWords(visibleText);
        return words.length > 0 ? 1 : 0;
    }
    
    return sentences.length;
}

/**
 * Extract paragraph count
 * Algorithm:
 * 1. Count <p> tags with text
 * 2. Optionally include <div> blocks with large text
 * 3. Ignore empty paragraphs
 */
function extractParagraphCount($: CheerioAPI): number {
    const $clone = $.load($.html());
    
    // Remove hidden elements first
    $clone('script, style, noscript').remove();
    $clone('*').each((_i, el) => {
        const $el = $clone(el);
        const style = $el.attr('style') || '';
        const ariaHidden = $el.attr('aria-hidden');
        
        if (style.includes('display:none') || style.includes('display: none') || 
            style.includes('visibility:hidden') || style.includes('visibility: hidden') ||
            ariaHidden === 'true') {
            $el.remove();
        }
    });
    
    // Count <p> tags with non-empty text
    let paragraphCount = 0;
    $clone('p').each((_i, el) => {
        const text = $clone(el).text().trim();
        if (text.length > 0) {
            paragraphCount++;
        }
    });
    
    // If no <p> tags, count <div> blocks with substantial text (optional)
    if (paragraphCount === 0) {
        $clone('div').each((_i, el) => {
            const text = $clone(el).text().trim();
            const wordCount = tokenizeWords(text).length;
            // Consider divs with at least 20 words as paragraphs
            if (wordCount >= 20) {
                paragraphCount++;
            }
        });
    }
    
    // At least 1 if we have any visible text
    if (paragraphCount === 0) {
        const visibleText = extractVisibleText($);
        if (visibleText.trim().length > 0) {
            paragraphCount = 1;
        }
    }
    
    return paragraphCount;
}

/**
 * Calculate average sentence length
 * Algorithm: visible_word_count / sentence_count
 */
function calculateAverageSentenceLength(visibleWordCount: number, sentenceCount: number): number {
    if (sentenceCount === 0) return 0;
    return Math.round((visibleWordCount / sentenceCount) * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate average paragraph length
 * Algorithm: visible_word_count / paragraph_count
 */
function calculateAverageParagraphLength(visibleWordCount: number, paragraphCount: number): number {
    if (paragraphCount === 0) return 0;
    return Math.round((visibleWordCount / paragraphCount) * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate keyword density with proper algorithm
 * Algorithm:
 * 1. Extract visible text from page
 * 2. Normalize text: lowercase, remove punctuation, normalize whitespace
 * 3. Tokenize into words array
 * 4. Normalize keyword: lowercase, remove punctuation
 * 5. For single-word keywords: count exact word matches
 * 6. For multi-word keywords: count phrase occurrences (consecutive words)
 * 7. Calculate density: (keyword_occurrences / total_visible_words) * 100
 * 
 * @param $ - Cheerio instance with loaded HTML
 * @param targetKeyword - Target keyword or phrase to calculate density for
 * @returns Keyword density percentage (0-100) or null if invalid
 */
function calculateKeywordDensity($: CheerioAPI, targetKeyword?: string): number | null {
    // Validate input
    if (!targetKeyword || typeof targetKeyword !== 'string') {
        return null;
    }
    
    const trimmedKeyword = targetKeyword.trim();
    if (trimmedKeyword.length === 0) {
        return null;
    }
    
    // Extract visible text
    const visibleText = extractVisibleText($);
    if (!visibleText || visibleText.trim().length === 0) {
        return null;
    }
    
    // Normalize text: lowercase, remove punctuation, normalize whitespace
    const normalizedText = normalizeText(visibleText);
    if (normalizedText.length === 0) {
        return null;
    }
    
    // Tokenize into words array
    const words = tokenizeWords(normalizedText);
    const totalWords = words.length;
    
    if (totalWords === 0) {
        return null;
    }
    
    // Normalize keyword: lowercase, remove punctuation, normalize whitespace
    const normalizedKeyword = normalizeText(trimmedKeyword);
    if (normalizedKeyword.length === 0) {
        return null;
    }
    
    // Tokenize keyword into words
    const keywordWords = tokenizeWords(normalizedKeyword);
    if (keywordWords.length === 0) {
        return null;
    }
    
    let occurrences = 0;
    
    if (keywordWords.length === 1) {
        // Single-word keyword: count exact word matches
        const keyword = keywordWords[0];
        occurrences = words.filter(word => word === keyword).length;
    } else {
        // Multi-word keyword phrase: count consecutive phrase occurrences using sliding window
        // This ensures we match the exact phrase sequence, not just individual words
        const keywordLength = keywordWords.length;
        
        // Slide a window through the words array to find matching phrases
        for (let i = 0; i <= words.length - keywordLength; i++) {
            // Check if the next N words match the keyword phrase
            let matches = true;
            for (let j = 0; j < keywordLength; j++) {
                if (words[i + j] !== keywordWords[j]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                occurrences++;
                // Skip ahead to avoid overlapping matches (optional - remove if you want overlapping)
                // i += keywordLength - 1;
            }
        }
    }
    
    if (occurrences === 0) {
        return 0; // Return 0 instead of null if keyword not found
    }
    
    // Calculate density: (occurrences / total_words) * 100
    const density = (occurrences / totalWords) * 100;
    
    // Round to 2 decimal places
    return Math.round(density * 100) / 100;
}

/**
 * Detect thin content based on word count and uniqueness
 * Algorithm:
 * 1. Check if visible_word_count < 250
 * 2. Check if unique_word_count / visible_word_count < 0.3
 * 3. Return thin_content flag and reason
 */
function detectThinContent(visibleWordCount: number, uniqueWordCount: number): { thinContent: boolean; reason: string | null } {
    if (visibleWordCount < 250) {
        return { thinContent: true, reason: 'Low word count' };
    }
    
    if (visibleWordCount > 0) {
        const uniquenessRatio = uniqueWordCount / visibleWordCount;
        if (uniquenessRatio < 0.3) {
            return { thinContent: true, reason: 'Low uniqueness' };
        }
    }
    
    return { thinContent: false, reason: null };
}

/**
 * Normalize content for duplicate detection
 * Algorithm:
 * 1. Lowercase
 * 2. Remove boilerplate (header, footer, nav)
 * 3. Normalize whitespace
 */
function normalizeContentForDuplicate(visibleText: string): string {
    return visibleText
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generate content hash for duplicate detection
 * Uses MD5 hash of normalized content
 */
function generateContentHashForDuplicate(visibleText: string): string {
    const normalized = normalizeContentForDuplicate(visibleText);
    return crypto.createHash('md5').update(normalized).digest('hex');
}

/**
 * Extract section word count mapping
 * Algorithm:
 * 1. Identify sections (each section starts at a heading <h1>-<h6>)
 * 2. Collect text from heading until next heading of same or higher level
 * 3. Count words per section
 */
function extractSectionWordCountMapping($: CheerioAPI): Record<string, number> {
    const $clone = $.load($.html());
    
    // Remove hidden elements
    $clone('script, style, noscript').remove();
    $clone('*').each((_i, el) => {
        const $el = $clone(el);
        const style = $el.attr('style') || '';
        const ariaHidden = $el.attr('aria-hidden');
        if (style.includes('display:none') || style.includes('display: none') || 
            style.includes('visibility:hidden') || style.includes('visibility: hidden') ||
            ariaHidden === 'true') {
            $el.remove();
        }
    });
    
    // Remove footer, nav, aside
    $clone('footer, nav, aside').remove();
    
    const sectionMapping: Record<string, number> = {};
    const headings = $clone('h1, h2, h3, h4, h5, h6').toArray();
    
    if (headings.length === 0) {
        // No headings, treat entire body as one section
        const bodyText = $clone('body').text() || '';
        const wordCount = tokenizeWords(bodyText).length;
        if (wordCount > 0) {
            sectionMapping['Main Content'] = wordCount;
        }
        return sectionMapping;
    }
    
    // Process each heading
    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i];
        const $heading = $clone(heading);
        const headingLevel = parseInt($heading.prop('tagName')?.replace('H', '') || '0');
        const headingText = $heading.text().trim();
        
        if (!headingText) continue;
        
        // Collect text from this heading until next heading of same or higher level
        let sectionText = headingText + ' ';
        let current = $heading.next();
        
        while (current.length > 0) {
            const tagName = current.prop('tagName')?.toUpperCase() || '';
            
            // Check if we hit another heading
            if (tagName.match(/^H[1-6]$/)) {
                const nextHeadingLevel = parseInt(tagName.replace('H', ''));
                // Stop if we hit a heading of same or higher level
                if (nextHeadingLevel <= headingLevel) {
                    break;
                }
            }
            
            // Add text content
            const text = current.text().trim();
            if (text) {
                sectionText += text + ' ';
            }
            
            current = current.next();
        }
        
        // Count words in this section
        const wordCount = tokenizeWords(sectionText).length;
        if (wordCount > 0) {
            sectionMapping[headingText] = wordCount;
        }
    }
    
    return sectionMapping;
}

/**
 * Calculate section word count breakdown (percentage distribution)
 * Algorithm:
 * 1. Get section word count mapping
 * 2. Calculate total words across all sections
 * 3. Calculate percentage for each section
 */
function calculateSectionWordCountBreakdown(
    sectionMapping: Record<string, number>,
    totalVisibleWords: number
): Record<string, number> {
    if (totalVisibleWords === 0) {
        return {};
    }
    
    const breakdown: Record<string, number> = {};
    
    for (const [section, wordCount] of Object.entries(sectionMapping)) {
        const percentage = (wordCount / totalVisibleWords) * 100;
        breakdown[section] = Math.round(percentage * 100) / 100; // Round to 2 decimal places
    }
    
    return breakdown;
}

/**
 * Extract heading word count mapping
 * Algorithm:
 * 1. Extract all headings (H1-H6)
 * 2. For each heading, collect content until next relevant heading
 * 3. Count words under each heading
 */
function extractHeadingWordCountMapping($: CheerioAPI): Record<string, number> {
    const $clone = $.load($.html());
    
    // Remove hidden elements
    $clone('script, style, noscript').remove();
    $clone('*').each((_i, el) => {
        const $el = $clone(el);
        const style = $el.attr('style') || '';
        const ariaHidden = $el.attr('aria-hidden');
        if (style.includes('display:none') || style.includes('display: none') || 
            style.includes('visibility:hidden') || style.includes('visibility: hidden') ||
            ariaHidden === 'true') {
            $el.remove();
        }
    });
    
    // Remove footer, nav, aside
    $clone('footer, nav, aside').remove();
    
    const headingMapping: Record<string, number> = {};
    const headings = $clone('h1, h2, h3, h4, h5, h6').toArray();
    
    for (let i = 0; i < headings.length; i++) {
        const heading = headings[i];
        const $heading = $clone(heading);
        const headingLevel = parseInt($heading.prop('tagName')?.replace('H', '') || '0');
        const headingText = $heading.text().trim();
        
        if (!headingText) continue;
        
        // Create heading key with level prefix
        const headingKey = `H${headingLevel}: ${headingText}`;
        
        // Collect text from this heading until next heading of same or higher level
        let sectionText = '';
        let current = $heading.next();
        
        while (current.length > 0) {
            const tagName = current.prop('tagName')?.toUpperCase() || '';
            
            // Check if we hit another heading
            if (tagName.match(/^H[1-6]$/)) {
                const nextHeadingLevel = parseInt(tagName.replace('H', ''));
                // Stop if we hit a heading of same or higher level
                if (nextHeadingLevel <= headingLevel) {
                    break;
                }
            }
            
            // Add text content
            const text = current.text().trim();
            if (text) {
                sectionText += text + ' ';
            }
            
            current = current.next();
        }
        
        // Count words under this heading
        const wordCount = tokenizeWords(sectionText).length;
        headingMapping[headingKey] = wordCount;
    }
    
    return headingMapping;
}

/**
 * Extract comprehensive word count analysis from HTML page
 * Implements all wordcount analysis algorithms as specified
 * 
 * @param $ - Cheerio instance with loaded HTML
 * @param targetKeyword - Optional target keyword for density calculation
 * @returns PageWordCountData with all metrics
 */
export function extractWordCount($: CheerioAPI, targetKeyword?: string): PageWordCountData {
    // Extract total word count (all text, excluding script/style/noscript)
    const totalWordCount = extractTotalWordCount($);
    
    // Extract visible word count
    const visibleWordCount = extractVisibleWordCount($);
    
    // Extract unique word count
    const uniqueWordCount = extractUniqueWordCount($);
    
    // Calculate text-to-HTML ratio
    const textToHtmlRatio = calculateTextToHtmlRatio($);
    
    // Extract sentence count
    const sentenceCount = extractSentenceCount($);
    
    // Extract paragraph count
    const paragraphCount = extractParagraphCount($);
    
    // Calculate average sentence length
    const averageSentenceLength = calculateAverageSentenceLength(visibleWordCount, sentenceCount);
    
    // Calculate average paragraph length
    const averageParagraphLength = calculateAverageParagraphLength(visibleWordCount, paragraphCount);
    
    // Calculate keyword density (if target keyword provided)
    const keywordDensity = calculateKeywordDensity($, targetKeyword);
    
    // Detect thin content
    const { thinContent, reason: thinContentReason } = detectThinContent(visibleWordCount, uniqueWordCount);
    
    // Extract section word count mapping
    const sectionWordCountMapping = extractSectionWordCountMapping($);
    
    // Calculate section word count breakdown
    const sectionWordCountBreakdown = calculateSectionWordCountBreakdown(sectionWordCountMapping, visibleWordCount);
    
    // Extract heading word count mapping
    const headingWordCountMapping = extractHeadingWordCountMapping($);
    
    // Duplicate content detection requires session context (will be done separately)
    // For now, set defaults
    const duplicateContent = false;
    const duplicateWithUrls: string[] = [];
    
    // Ensure totalWordCount is at least equal to visibleWordCount (sanity check)
    const finalTotalWordCount = totalWordCount >= visibleWordCount ? totalWordCount : visibleWordCount;
    
    return {
        totalWordCount: finalTotalWordCount,
        visibleWordCount,
        uniqueWordCount,
        textToHtmlRatio,
        sentenceCount,
        paragraphCount,
        averageSentenceLength,
        averageParagraphLength,
        keywordDensity,
        thinContent,
        thinContentReason,
        duplicateContent,
        duplicateWithUrls,
        sectionWordCountMapping,
        sectionWordCountBreakdown,
        headingWordCountMapping
    };
}

/**
 * Generate content hash for duplicate detection
 * This can be used to compare with other pages in the session
 */
export function generateContentHash(visibleText: string): string {
    return generateContentHashForDuplicate(visibleText);
}

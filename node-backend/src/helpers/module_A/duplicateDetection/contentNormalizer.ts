import { CheerioAPI } from 'cheerio';

/**
 * Content Normalizer - Extracts and normalizes page content for comparison
 * 
 * This is CRITICAL for accurate duplicate detection:
 * - Removes boilerplate (nav, footer, sidebar)
 * - Extracts main content only
 * - Normalizes text (lowercase, whitespace, etc.)
 */

/**
 * Extract and normalize main content from a page
 */
export function normalizeContent($: CheerioAPI): string {
    // Remove unwanted elements
    $('script, style, noscript, iframe, svg').remove();
    $('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"]').remove();
    $('.nav, .navigation, .menu, .sidebar, .footer, .header, .ad, .advertisement').remove();
    
    // Try to extract main content area
    let mainContent = '';
    
    // Priority 1: Semantic HTML5 main/article tags
    if ($('main').length > 0) {
        mainContent = $('main').text();
    } else if ($('article').length > 0) {
        mainContent = $('article').text();
    } else if ($('[role="main"]').length > 0) {
        mainContent = $('[role="main"]').text();
    } else if ($('.content, .main-content, #content, #main-content').length > 0) {
        mainContent = $('.content, .main-content, #content, #main-content').first().text();
    } else {
        // Fallback: use body but remove known boilerplate
        mainContent = $('body').text();
    }
    
    // Normalize the text
    return normalizeText(mainContent);
}

/**
 * Normalize text for comparison
 */
export function normalizeText(text: string): string {
    return text
        // Convert to lowercase
        .toLowerCase()
        // Remove extra whitespace
        .replace(/\s+/g, ' ')
        // Remove special characters but keep basic punctuation
        .replace(/[^\w\s.,!?-]/g, '')
        // Remove multiple punctuation
        .replace(/([.,!?])\1+/g, '$1')
        // Trim
        .trim();
}

/**
 * Remove common stopwords (optional, use for more aggressive normalization)
 */
export function removeStopwords(text: string): string {
    const stopwords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
        'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these',
        'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    ]);
    
    return text
        .split(' ')
        .filter(word => word.length > 2 && !stopwords.has(word))
        .join(' ');
}

/**
 * Extract text content only (no HTML)
 */
export function extractTextContent(html: string, $: CheerioAPI): string {
    const normalized = normalizeContent($);
    return normalized;
}

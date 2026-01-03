import type { CheerioAPI } from 'cheerio';
import type { TitleData } from './types.js';

/**
 * Calculate approximate pixel width of text
 * Based on average character widths for common fonts
 */
function calculatePixelWidth(text: string): number {
    if (!text) return 0;
    
    let width = 0;
    for (const char of text) {
        // Approximate character widths (in pixels)
        if (char === ' ') width += 3;
        else if (/[iIl1\.,;:\-']/.test(char)) width += 4;
        else if (/[fjtJ]/.test(char)) width += 5;
        else if (/[a-z]/.test(char)) width += 6;
        else if (/[A-Z]/.test(char)) width += 7;
        else if (/[wWmM]/.test(char)) width += 9;
        else width += 6; // default
    }
    return Math.round(width);
}

/**
 * Extract title information from a page
 */
export function extractTitle($: CheerioAPI): TitleData {
    const titleElement = $('title');
    const title = titleElement.text().trim();
    const titleLength = title.length;
    const hasMissingTitle = titleLength === 0;
    
    // Calculate pixel width
    const titlePixelWidth = calculatePixelWidth(title);
    
    return {
        title: title || 'No title',
        titleLength,
        titlePixelWidth,
        hasMissingTitle
    };
}

/**
 * Validate title length (SEO best practices)
 */
export function validateTitleLength(titleLength: number): {
    isValid: boolean;
    message?: string;
} {
    if (titleLength === 0) {
        return { isValid: false, message: 'Missing title tag' };
    }
    
    if (titleLength < 30) {
        return { isValid: false, message: 'Title is too short (< 30 characters)' };
    }
    
    if (titleLength > 60) {
        return { isValid: false, message: 'Title is too long (> 60 characters)' };
    }
    
    return { isValid: true };
}

/**
 * Calculate approximate pixel width of title
 * Note: This is a rough estimation. Actual pixel width depends on font family, size, and weight
 */
export function estimateTitlePixelWidth(title: string): number {
    // Average character width in pixels (approximate for common fonts at 16px)
    const avgCharWidth = 8;
    return title.length * avgCharWidth;
}

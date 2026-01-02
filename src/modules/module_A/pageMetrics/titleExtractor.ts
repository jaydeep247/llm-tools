import type { CheerioAPI } from 'cheerio';
import type { TitleData } from './types.js';

/**
 * Extract title information from a page
 */
export function extractTitle($: CheerioAPI): TitleData {
    const titleElement = $('title');
    const title = titleElement.text().trim();
    const titleLength = title.length;
    const hasMissingTitle = titleLength === 0;
    
    // TODO: Calculate pixel width based on font metrics
    // This would require font-specific calculations
    const titlePixelWidth = undefined;
    
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

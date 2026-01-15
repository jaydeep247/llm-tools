import type { CheerioAPI } from 'cheerio';

/**
 * Extract AMP HTML link from the page
 */
export function extractAmpHtml($: CheerioAPI): string | undefined {
    // Look for <link rel="amphtml" href="...">
    const ampLink = $('link[rel="amphtml"]').attr('href');
    
    if (ampLink) {
        return ampLink.trim();
    }
    
    return undefined;
}

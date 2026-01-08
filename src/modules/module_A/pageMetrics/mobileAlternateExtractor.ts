import type { CheerioAPI } from 'cheerio';

/**
 * Extract mobile alternate link from the page
 * 
 * Mobile alternate links are used to point to a mobile-specific version of the page.
 * Example: <link rel="alternate" media="only screen and (max-width: 640px)" href="https://m.example.com/page">
 * 
 * Why it matters:
 * - Used for separate mobile URLs (m.example.com)
 * - Helps search engines serve the correct version
 * - Important for legacy mobile setups
 * 
 * Note:
 * - Not required for responsive websites
 * - Missing is not an error unless you use mobile URLs
 */
export function extractMobileAlternate($: CheerioAPI): string | undefined {
    // Look for <link rel="alternate" media="..." href="...">
    // The media attribute should contain mobile/screen width conditions
    const alternateLinks = $('link[rel="alternate"][media]');
    
    for (let i = 0; i < alternateLinks.length; i++) {
        const link = alternateLinks.eq(i);
        const media = link.attr('media')?.toLowerCase() || '';
        const href = link.attr('href')?.trim();
        
        // Check if media query indicates mobile viewport
        // Common patterns: "only screen and (max-width: 640px)", "handheld", etc.
        if (href && (
            media.includes('max-width') || 
            media.includes('handheld') || 
            media.includes('mobile')
        )) {
            return href;
        }
    }
    
    return undefined;
}

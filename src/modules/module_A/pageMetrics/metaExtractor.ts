import type { CheerioAPI } from 'cheerio';
import type { MetaDescriptionData, MetaTagsData, StructuredDataItem } from './types.js';

/**
 * Extract meta description from a page
 */
export function extractMetaDescription($: CheerioAPI): MetaDescriptionData {
    const metaDescElement = $('meta[name="description"]');
    const metaDescription = metaDescElement.attr('content')?.trim() || '';
    const metaDescriptionLength = metaDescription.length;
    const hasMissingMetaDescription = metaDescriptionLength === 0;
    
    // TODO: Calculate pixel width based on font metrics
    const metaDescriptionPixelWidth = undefined;
    
    return {
        metaDescription: metaDescription || 'No description',
        metaDescriptionLength,
        metaDescriptionPixelWidth,
        hasMissingMetaDescription
    };
}

/**
 * Extract all meta tags from a page
 */
export function extractMetaTags($: CheerioAPI, baseUrl: string): MetaTagsData {
    // Meta keywords
    const metaKeywordsElement = $('meta[name="keywords"]');
    const metaKeywords = metaKeywordsElement.attr('content')?.trim();
    const metaKeywordsLength = metaKeywords?.length;
    
    // Meta robots
    const metaRobotsElement = $('meta[name="robots"]');
    const metaRobots = metaRobotsElement.attr('content')?.trim();
    
    // Canonical URL
    const canonicalElement = $('link[rel="canonical"]');
    let canonicalUrl = canonicalElement.attr('href')?.trim();
    
    // Resolve relative canonical URLs
    if (canonicalUrl && !canonicalUrl.startsWith('http')) {
        try {
            canonicalUrl = new URL(canonicalUrl, baseUrl).toString();
        } catch {
            // Keep original if URL resolution fails
        }
    }
    
    // Viewport
    const viewportElement = $('meta[name="viewport"]');
    const viewport = viewportElement.attr('content')?.trim();
    
    // Structured data
    const structuredData = extractStructuredData($);
    
    return {
        metaKeywords,
        metaKeywordsLength,
        metaRobots,
        canonicalUrl,
        viewport,
        structuredData
    };
}

/**
 * Extract structured data (JSON-LD, Microdata)
 */
export function extractStructuredData($: CheerioAPI): StructuredDataItem[] {
    const structuredDataItems: StructuredDataItem[] = [];
    
    // Extract JSON-LD
    $('script[type="application/ld+json"]').each((_i, el) => {
        try {
            const content = $(el).html();
            if (content) {
                const data = JSON.parse(content);
                structuredDataItems.push({
                    type: 'json-ld',
                    schemaType: data['@type'] || data.type,
                    data
                });
            }
        } catch (error) {
            // Invalid JSON, skip
        }
    });
    
    // TODO: Extract Microdata and RDFa
    // This would require more complex parsing
    
    return structuredDataItems;
}

/**
 * Validate meta description length (SEO best practices)
 */
export function validateMetaDescriptionLength(length: number): {
    isValid: boolean;
    message?: string;
} {
    if (length === 0) {
        return { isValid: false, message: 'Missing meta description' };
    }
    
    if (length < 120) {
        return { isValid: false, message: 'Meta description is too short (< 120 characters)' };
    }
    
    if (length > 160) {
        return { isValid: false, message: 'Meta description is too long (> 160 characters)' };
    }
    
    return { isValid: true };
}

/**
 * Check if canonical URL is valid
 */
export function validateCanonical(canonicalUrl: string | undefined, currentUrl: string): {
    isValid: boolean;
    message?: string;
} {
    if (!canonicalUrl) {
        return { isValid: false, message: 'Missing canonical tag' };
    }
    
    try {
        const canonical = new URL(canonicalUrl);
        const current = new URL(currentUrl);
        
        // Check if canonical points to a different domain
        if (canonical.hostname !== current.hostname) {
            return { 
                isValid: false, 
                message: `Canonical points to different domain: ${canonical.hostname}` 
            };
        }
        
        return { isValid: true };
    } catch {
        return { isValid: false, message: 'Invalid canonical URL format' };
    }
}

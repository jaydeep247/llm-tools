import type { CheerioAPI } from 'cheerio';
import type { HeadersData, HeaderStructure } from './types.js';

/**
 * Extract all heading tags from a page
 */
export function extractHeaders($: CheerioAPI): HeadersData {
    // Extract H1 tags
    const h1Tags = $('h1').map((_i: number, el: any) => $(el).text().trim()).get();
    const hasMultipleH1 = h1Tags.length > 1;
    
    // Extract H2-H6 tags
    const h2Tags = $('h2').map((_i: number, el: any) => $(el).text().trim()).get();
    const h3Tags = $('h3').map((_i: number, el: any) => $(el).text().trim()).get();
    const h4Tags = $('h4').map((_i: number, el: any) => $(el).text().trim()).get();
    const h5Tags = $('h5').map((_i: number, el: any) => $(el).text().trim()).get();
    const h6Tags = $('h6').map((_i: number, el: any) => $(el).text().trim()).get();
    
    // Build header structure
    const headerStructure = buildHeaderStructure($);
    
    return {
        h1Tags,
        hasMultipleH1,
        h2Tags,
        h3Tags,
        h4Tags,
        h5Tags,
        h6Tags,
        headerStructure
    };
}

/**
 * Build hierarchical header structure
 */
export function buildHeaderStructure($: CheerioAPI): HeaderStructure[] {
    const structure: HeaderStructure[] = [];
    
    // Find all heading tags in document order
    $('h1, h2, h3, h4, h5, h6').each((i: number, el: any) => {
        const tagName = el.tagName.toLowerCase();
        const level = parseInt(tagName.substring(1));
        const text = $(el).text().trim();
        
        // Generate XPath (simplified version)
        const xpath = generateSimpleXPath(el, $);
        
        structure.push({
            level,
            text,
            xpath
        });
    });
    
    return structure;
}

/**
 * Generate a simple XPath for an element
 * Note: This is a simplified version. Full XPath generation is more complex.
 */
function generateSimpleXPath(element: any, $: CheerioAPI): string {
    const tagName = element.tagName.toLowerCase();
    const parent = $(element).parent();
    
    if (parent.length === 0 || parent[0].tagName === 'html') {
        return `/${tagName}`;
    }
    
    // Count siblings of the same type
    const siblings = parent.children(tagName);
    const index = siblings.index(element) + 1;
    
    if (siblings.length > 1) {
        return `${tagName}[${index}]`;
    }
    
    return tagName;
}

/**
 * Validate header structure (SEO best practices)
 */
export function validateHeaderStructure(structure: HeaderStructure[]): {
    isValid: boolean;
    issues: string[];
} {
    const issues: string[] = [];
    
    if (structure.length === 0) {
        issues.push('No heading tags found on page');
        return { isValid: false, issues };
    }
    
    // Check if first heading is H1
    if (structure[0].level !== 1) {
        issues.push('First heading should be H1');
    }
    
    // Check for skipped heading levels
    for (let i = 1; i < structure.length; i++) {
        const prevLevel = structure[i - 1].level;
        const currLevel = structure[i].level;
        
        if (currLevel > prevLevel + 1) {
            issues.push(
                `Skipped heading level: H${prevLevel} followed by H${currLevel} (line ${i + 1})`
            );
        }
    }
    
    // Check for multiple H1s
    const h1Count = structure.filter(h => h.level === 1).length;
    if (h1Count > 1) {
        issues.push(`Multiple H1 tags found (${h1Count}). Should have only one H1 per page.`);
    }
    
    // Check for empty headings
    const emptyHeadings = structure.filter(h => h.text.length === 0);
    if (emptyHeadings.length > 0) {
        issues.push(`${emptyHeadings.length} empty heading tag(s) found`);
    }
    
    return {
        isValid: issues.length === 0,
        issues
    };
}

/**
 * Get heading statistics
 */
export function getHeaderStats(headers: HeadersData): {
    totalHeadings: number;
    h1Count: number;
    h2Count: number;
    h3Count: number;
    h4Count: number;
    h5Count: number;
    h6Count: number;
    hasMultipleH1: boolean;
} {
    return {
        totalHeadings: headers.headerStructure.length,
        h1Count: headers.h1Tags.length,
        h2Count: headers.h2Tags.length,
        h3Count: headers.h3Tags.length,
        h4Count: headers.h4Tags.length,
        h5Count: headers.h5Tags.length,
        h6Count: headers.h6Tags.length,
        hasMultipleH1: headers.hasMultipleH1
    };
}

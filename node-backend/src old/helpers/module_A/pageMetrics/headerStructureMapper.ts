import type { CheerioAPI, Element } from 'cheerio';
import type { HeaderStructureMapping, HeaderHierarchyNode, HeaderIssue } from './types.js';

/**
 * Enhanced header structure mapping with hierarchy tree and issues detection
 */
export function mapHeaderStructure($: CheerioAPI): HeaderStructureMapping {
    const structure: HeaderHierarchyNode[] = [];
    const issues: HeaderIssue[] = [];
    let index = 0;

    // Extract all headings in DOM order
    $('h1, h2, h3, h4, h5, h6').each((_: number, element: Element) => {
        const tagName = element.tagName.toLowerCase();
        const level = parseInt(tagName.substring(1));
        const text = $(element).text().trim();

        structure.push({
            index: index++,
            level,
            tag: tagName,
            text,
            xpath: generateSimpleXPath(element, $)
        });
    });

    // Build hierarchy tree
    const hierarchy = buildHierarchyTree(structure);

    // Detect issues
    detectHeaderIssues(structure, issues);

    return {
        headings: structure,
        hierarchy,
        h1Count: structure.filter(h => h.level === 1).length,
        totalHeadings: structure.length,
        hasIssues: issues.length > 0,
        issues
    };
}

/**
 * Build hierarchy tree where each node has its children
 */
function buildHierarchyTree(structure: HeaderHierarchyNode[]): HeaderHierarchyNode[] {
    const tree: HeaderHierarchyNode[] = [];
    const stack: HeaderHierarchyNode[] = [];

    structure.forEach((heading) => {
        // Pop stack until we find a parent at a lower level
        while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
            stack.pop();
        }

        // Add children to parent if exists
        if (stack.length > 0) {
            const parent = stack[stack.length - 1];
            if (!parent.children) {
                parent.children = [];
            }
            parent.children.push(heading);
        } else {
            // Top-level heading
            tree.push(heading);
        }

        stack.push(heading);
    });

    return tree;
}

/**
 * Detect header structure issues
 */
function detectHeaderIssues(structure: HeaderHierarchyNode[], issues: HeaderIssue[]): void {
    if (structure.length === 0) {
        issues.push({
            type: 'missing_headings',
            severity: 'warning',
            message: 'No heading tags found on page'
        });
        return;
    }

    // Check for missing H1
    const h1Count = structure.filter(h => h.level === 1).length;
    if (h1Count === 0) {
        issues.push({
            type: 'missing_h1',
            severity: 'warning',
            message: 'No H1 heading found on page'
        });
    }

    // Check for multiple H1s
    if (h1Count > 1) {
        issues.push({
            type: 'multiple_h1',
            severity: 'warning',
            message: `Multiple H1 tags found (${h1Count}). Should have only one H1 per page.`
        });
    }

    // Check for skipped heading levels
    for (let i = 1; i < structure.length; i++) {
        const prevLevel = structure[i - 1].level;
        const currLevel = structure[i].level;

        if (currLevel > prevLevel + 1) {
            issues.push({
                type: 'skipped_level',
                severity: 'warning',
                message: `Skipped heading level: H${prevLevel} followed by H${currLevel} at position ${i + 1}`
            });
        }
    }

    // Check for empty headings
    const emptyHeadings = structure.filter(h => h.text.length === 0);
    if (emptyHeadings.length > 0) {
        issues.push({
            type: 'empty_heading',
            severity: 'warning',
            message: `${emptyHeadings.length} empty heading tag(s) found`
        });
    }

    // Check if first heading is not H1
    if (structure.length > 0 && structure[0].level !== 1) {
        issues.push({
            type: 'first_not_h1',
            severity: 'info',
            message: `First heading is H${structure[0].level}, not H1`
        });
    }
}

/**
 * Generate a simple XPath for an element
 */
function generateSimpleXPath(element: Element, $: CheerioAPI): string {
    const tagName = element.tagName.toLowerCase();
    const parent = $(element).parent();
    
    if (parent.length === 0 || parent[0].tagName === 'html') {
        return `/${tagName}`;
    }
    
    // Count siblings of the same type
    const siblings = parent.children(tagName);
    const index = siblings.toArray().indexOf(element) + 1;
    
    if (siblings.length > 1) {
        return `${tagName}[${index}]`;
    }
    
    return tagName;
}

/**
 * Get header structure summary
 */
export function getHeaderStructureSummary(mapping: HeaderStructureMapping): {
    totalHeadings: number;
    h1Count: number;
    maxLevel: number;
    hasIssues: boolean;
    issueCount: number;
} {
    const maxLevel = mapping.headings.length > 0
        ? Math.max(...mapping.headings.map(h => h.level))
        : 0;

    return {
        totalHeadings: mapping.totalHeadings,
        h1Count: mapping.h1Count,
        maxLevel,
        hasIssues: mapping.hasIssues,
        issueCount: mapping.issues.length
    };
}

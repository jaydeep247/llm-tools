import type { StructuredDataDetection, StructuredDataTypeIdentification } from './types.js';

/**
 * Identify structured data types from detected structured data
 */
export function identifyStructuredDataTypes(detection: StructuredDataDetection): StructuredDataTypeIdentification {
    const types: string[] = [];
    const typeCounts: Record<string, number> = {};
    let priorityType: string | null = null;

    // Extract all schema types
    detection.items.forEach(item => {
        if (item.schemaType) {
            const type = normalizeSchemaType(item.schemaType);
            if (type && !types.includes(type)) {
                types.push(type);
            }
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
    });

    // Determine priority type (most common or first important type)
    if (types.length > 0) {
        // Priority order: FAQPage, Article, Product, Organization, etc.
        const priorityOrder = [
            'FAQPage', 'Article', 'Product', 'BreadcrumbList',
            'Organization', 'Review', 'Event', 'WebPage'
        ];

        for (const priority of priorityOrder) {
            if (types.includes(priority)) {
                priorityType = priority;
                break;
            }
        }

        // If no priority type found, use most common
        if (!priorityType) {
            priorityType = types[0];
        }
    }

    return {
        types,
        typeCount: types.length,
        typeCounts,
        priorityType,
        hasCommonTypes: hasCommonTypes(types)
    };
}

/**
 * Normalize schema type name
 */
function normalizeSchemaType(type: string): string {
    // Remove schema.org URL prefix if present
    let normalized = type.replace(/^https?:\/\/schema\.org\//, '');
    
    // Handle array types (e.g., ["Article", "BlogPosting"])
    if (normalized.includes(',')) {
        normalized = normalized.split(',')[0].trim();
    }

    // Remove quotes and brackets
    normalized = normalized.replace(/["\[\]]/g, '').trim();

    return normalized;
}

/**
 * Check if page has common/important schema types
 */
function hasCommonTypes(types: string[]): boolean {
    const commonTypes = [
        'FAQPage', 'Article', 'Product', 'BreadcrumbList',
        'Organization', 'Review', 'Event', 'WebPage',
        'LocalBusiness', 'Person', 'Recipe', 'VideoObject'
    ];

    return types.some(type => commonTypes.includes(type));
}

/**
 * Get structured data type summary
 */
export function getStructuredDataTypeSummary(identification: StructuredDataTypeIdentification): {
    typeCount: number;
    hasPriorityType: boolean;
    priorityType: string | null;
    commonTypesPresent: boolean;
} {
    return {
        typeCount: identification.typeCount,
        hasPriorityType: identification.priorityType !== null,
        priorityType: identification.priorityType,
        commonTypesPresent: identification.hasCommonTypes
    };
}

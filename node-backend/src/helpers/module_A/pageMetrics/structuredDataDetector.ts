import type { CheerioAPI } from 'cheerio';
import type { StructuredDataDetection, StructuredDataItem } from './types.js';

/**
 * Enhanced structured data detection (JSON-LD + Microdata)
 */
export function detectStructuredData($: CheerioAPI): StructuredDataDetection {
    const items: StructuredDataItem[] = [];
    const formats: string[] = [];

    // Extract JSON-LD
    const jsonLdItems = extractJsonLd($);
    items.push(...jsonLdItems);
    if (jsonLdItems.length > 0 && !formats.includes('json-ld')) {
        formats.push('json-ld');
    }

    // Extract Microdata
    const microdataItems = extractMicrodata($);
    items.push(...microdataItems);
    if (microdataItems.length > 0 && !formats.includes('microdata')) {
        formats.push('microdata');
    }

    return {
        present: items.length > 0,
        format: formats.length > 0 ? formats.join(', ') : 'none',
        formats: formats,
        itemCount: items.length,
        items
    };
}

/**
 * Extract JSON-LD structured data
 */
function extractJsonLd($: CheerioAPI): StructuredDataItem[] {
    const items: StructuredDataItem[] = [];

    $('script[type="application/ld+json"]').each((_: number, element: Element) => {
        try {
            const content = $(element).html();
            if (!content) return;

            const data = JSON.parse(content);
            
            // Handle both single objects and arrays
            const schemas = Array.isArray(data) ? data : [data];

            schemas.forEach((schema: any) => {
                if (schema && typeof schema === 'object') {
                    items.push({
                        type: 'json-ld',
                        schemaType: extractSchemaType(schema),
                        data: schema,
                        isValid: true
                    });
                }
            });
        } catch (error) {
            // Invalid JSON, skip
        }
    });

    return items;
}

/**
 * Extract Microdata structured data
 */
function extractMicrodata($: CheerioAPI): StructuredDataItem[] {
    const items: StructuredDataItem[] = [];

    // Find elements with itemscope
    $('[itemscope]').each((_: number, element: Element) => {
        const $element = $(element);
        const itemtype = $element.attr('itemtype');
        
        if (itemtype) {
            const schemaType = itemtype.split('/').pop() || itemtype;
            const properties: Record<string, any> = {};

            // Extract item properties
            $element.find('[itemprop]').each((_: number, propElement: Element) => {
                const $prop = $(propElement);
                const propName = $prop.attr('itemprop');
                if (propName) {
                    const propValue = $prop.attr('content') || 
                                    $prop.attr('value') || 
                                    $prop.text().trim();
                    properties[propName] = propValue;
                }
            });

            items.push({
                type: 'microdata',
                schemaType: schemaType,
                data: {
                    itemtype: itemtype,
                    properties: properties
                },
                isValid: true
            });
        }
    });

    return items;
}

/**
 * Extract schema type from JSON-LD object
 */
function extractSchemaType(schema: any): string | undefined {
    if (!schema || typeof schema !== 'object') {
        return undefined;
    }

    // Check @type (most common)
    if (schema['@type']) {
        return Array.isArray(schema['@type']) 
            ? schema['@type'][0] 
            : schema['@type'];
    }

    // Check type (fallback)
    if (schema.type) {
        return Array.isArray(schema.type) 
            ? schema.type[0] 
            : schema.type;
    }

    return undefined;
}

/**
 * Get structured data summary
 */
export function getStructuredDataSummary(detection: StructuredDataDetection): {
    present: boolean;
    format: string;
    itemCount: number;
    schemaTypeCount: number;
} {
    const uniqueTypes = new Set(
        detection.items
            .map(item => item.schemaType)
            .filter((type): type is string => type !== undefined)
    );

    return {
        present: detection.present,
        format: detection.format,
        itemCount: detection.itemCount,
        schemaTypeCount: uniqueTypes.size
    };
}

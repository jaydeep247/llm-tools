import type { CheerioAPI } from 'cheerio';
import type { ViewportData } from './types.js';

/**
 * Extract and validate viewport meta tag
 */
export function extractViewport($: CheerioAPI): ViewportData {
    const viewportElement = $('meta[name="viewport"]');
    const viewportContent = viewportElement.attr('content')?.trim() || null;

    if (!viewportContent) {
        return {
            present: false,
            content: null,
            status: 'missing',
            isValid: false,
            hasWidthDeviceWidth: false,
            hasInitialScale: false,
            isUserScalable: null,
            isRestrictive: false,
            issues: ['Viewport meta tag is missing']
        };
    }

    // Parse viewport content
    const params = parseViewportContent(viewportContent);
    const hasWidthDeviceWidth = params.width === 'device-width' || params.width === 'width=device-width';
    const hasInitialScale = params['initial-scale'] !== null;
    const isUserScalable = params['user-scalable'] !== null ? params['user-scalable'] === 'yes' : null;
    const isRestrictive = params['user-scalable'] === 'no' || params['maximum-scale'] !== null;

    // Validate
    const issues: string[] = [];
    let status: 'ok' | 'warning' | 'error' = 'ok';
    let isValid = true;

    if (!hasWidthDeviceWidth) {
        issues.push('Missing width=device-width');
        status = 'warning';
    }

    if (!hasInitialScale) {
        issues.push('Missing initial-scale');
        status = 'warning';
    }

    if (isRestrictive) {
        issues.push('Viewport has restrictive settings (user-scalable=no or maximum-scale)');
        status = 'warning';
        isValid = false;
    }

    if (issues.length === 0) {
        status = 'ok';
        isValid = true;
    }

    return {
        present: true,
        content: viewportContent,
        status,
        isValid,
        hasWidthDeviceWidth,
        hasInitialScale,
        isUserScalable,
        isRestrictive,
        issues: issues.length > 0 ? issues : []
    };
}

/**
 * Parse viewport content string into key-value pairs
 */
function parseViewportContent(content: string): Record<string, string | null> {
    const params: Record<string, string | null> = {};
    
    // Split by comma and parse each parameter
    content.split(',').forEach(param => {
        const trimmed = param.trim();
        const equalIndex = trimmed.indexOf('=');
        
        if (equalIndex > 0) {
            const key = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();
            params[key] = value;
        } else {
            // Handle standalone values like "device-width"
            if (trimmed === 'device-width') {
                params.width = 'device-width';
            }
        }
    });

    return params;
}

/**
 * Get viewport validation summary
 */
export function getViewportSummary(viewportData: ViewportData): {
    present: boolean;
    status: string;
    isValid: boolean;
    issueCount: number;
} {
    return {
        present: viewportData.present,
        status: viewportData.status,
        isValid: viewportData.isValid,
        issueCount: viewportData.issues.length
    };
}

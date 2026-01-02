import type { CheerioAPI } from 'cheerio';
import type { StatusData, CrawlResponse } from './types.js';

/**
 * Extract HTTP status and response information
 */
export function extractStatusData(
    url: string,
    response: CrawlResponse | undefined,
    $: CheerioAPI,
    responseTime: number
): StatusData {
    // Determine content type with fallbacks
    const headerContentType = response?.headers?.['content-type'] || 
                             response?.responseHeaders?.['content-type'];
    const metaContentType = $('meta[http-equiv="Content-Type"]').attr('content');
    const contentType = headerContentType || metaContentType || 'text/html';
    
    // Extract language
    const htmlLang = $('html').attr('lang');
    const metaLang = $('meta[http-equiv="content-language"]').attr('content');
    const language = htmlLang || metaLang;
    
    // Last modified
    const lastModified = response?.headers?.['last-modified'] || 
                        response?.responseHeaders?.['last-modified'];
    
    return {
        statusCode: response?.statusCode || 200,
        finalUrl: url,
        contentType,
        language,
        responseTime,
        lastModified
    };
}

/**
 * Check if status code indicates success
 */
export function isSuccessStatus(statusCode: number): boolean {
    return statusCode >= 200 && statusCode < 300;
}

/**
 * Check if status code indicates redirect
 */
export function isRedirectStatus(statusCode: number): boolean {
    return statusCode >= 300 && statusCode < 400;
}

/**
 * Check if status code indicates client error
 */
export function isClientErrorStatus(statusCode: number): boolean {
    return statusCode >= 400 && statusCode < 500;
}

/**
 * Check if status code indicates server error
 */
export function isServerErrorStatus(statusCode: number): boolean {
    return statusCode >= 500 && statusCode < 600;
}

/**
 * Get status code category
 */
export function getStatusCategory(statusCode: number): string {
    if (isSuccessStatus(statusCode)) return 'success';
    if (isRedirectStatus(statusCode)) return 'redirect';
    if (isClientErrorStatus(statusCode)) return 'client_error';
    if (isServerErrorStatus(statusCode)) return 'server_error';
    return 'unknown';
}

/**
 * Get human-readable status message
 */
export function getStatusMessage(statusCode: number): string {
    const statusMessages: Record<number, string> = {
        200: 'OK',
        201: 'Created',
        204: 'No Content',
        301: 'Moved Permanently',
        302: 'Found',
        303: 'See Other',
        304: 'Not Modified',
        307: 'Temporary Redirect',
        308: 'Permanent Redirect',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        410: 'Gone',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    };
    
    return statusMessages[statusCode] || `HTTP ${statusCode}`;
}

/**
 * Validate response time (performance check)
 */
export function validateResponseTime(responseTime: number): {
    isGood: boolean;
    rating: 'excellent' | 'good' | 'fair' | 'poor';
    message: string;
} {
    if (responseTime < 200) {
        return {
            isGood: true,
            rating: 'excellent',
            message: 'Excellent response time'
        };
    }
    
    if (responseTime < 500) {
        return {
            isGood: true,
            rating: 'good',
            message: 'Good response time'
        };
    }
    
    if (responseTime < 1000) {
        return {
            isGood: false,
            rating: 'fair',
            message: 'Fair response time, could be improved'
        };
    }
    
    return {
        isGood: false,
        rating: 'poor',
        message: 'Poor response time, needs optimization'
    };
}

/**
 * Parse content type to get MIME type and charset
 */
export function parseContentType(contentType: string): {
    mimeType: string;
    charset?: string;
    boundary?: string;
} {
    const parts = contentType.split(';').map(p => p.trim());
    const mimeType = parts[0];
    
    const result: { mimeType: string; charset?: string; boundary?: string } = {
        mimeType
    };
    
    for (let i = 1; i < parts.length; i++) {
        const [key, value] = parts[i].split('=').map(p => p.trim());
        if (key === 'charset') {
            result.charset = value;
        } else if (key === 'boundary') {
            result.boundary = value;
        }
    }
    
    return result;
}

import type { CheerioAPI, Element } from 'cheerio';
import type { MixedContentData, MixedContentResource } from './types.js';

/**
 * Extract mixed content information from a page
 * Detects HTTP resources loaded on HTTPS pages
 */
export function extractMixedContent($: CheerioAPI, pageUrl: string): MixedContentData {
    // Precondition: Only check if page is HTTPS
    try {
        const urlObj = new URL(pageUrl);
        if (urlObj.protocol !== 'https:') {
            return {
                hasMixedContent: false,
                severity: 'none',
                activeMixedContentCount: 0,
                passiveMixedContentCount: 0,
                totalInsecureResources: 0,
                resources: []
            };
        }
    } catch (e) {
        // Invalid URL, skip check
        return {
            hasMixedContent: false,
            severity: 'none',
            activeMixedContentCount: 0,
            passiveMixedContentCount: 0,
            totalInsecureResources: 0,
            resources: []
        };
    }

    const resources: MixedContentResource[] = [];
    const baseUrl = pageUrl;

    // Extract resources from various HTML elements
    extractScriptResources($, baseUrl, resources);
    extractLinkResources($, baseUrl, resources);
    extractImageResources($, baseUrl, resources);
    extractIframeResources($, baseUrl, resources);
    extractMediaResources($, baseUrl, resources);
    extractObjectResources($, baseUrl, resources);
    extractInlineCssResources($, baseUrl, resources);

    // Filter to only HTTP resources (mixed content)
    const mixedContentResources = resources.filter(resource => {
        try {
            const resourceUrl = new URL(resource.url);
            return resourceUrl.protocol === 'http:';
        } catch (e) {
            return false;
        }
    });

    // Classify by severity
    const activeResources = mixedContentResources.filter(r => r.severity === 'critical');
    const passiveResources = mixedContentResources.filter(r => r.severity === 'warning');

    // Determine overall severity
    let severity: 'none' | 'warning' | 'critical' = 'none';
    if (activeResources.length > 0) {
        severity = 'critical';
    } else if (passiveResources.length > 0) {
        severity = 'warning';
    }

    return {
        hasMixedContent: mixedContentResources.length > 0,
        severity,
        activeMixedContentCount: activeResources.length,
        passiveMixedContentCount: passiveResources.length,
        totalInsecureResources: mixedContentResources.length,
        resources: mixedContentResources
    };
}

/**
 * Extract resources from <script> tags
 * Severity: Critical (Active)
 */
function extractScriptResources($: CheerioAPI, baseUrl: string, resources: MixedContentResource[]): void {
    $('script[src]').each((_: number, element: Element) => {
        const src = $(element).attr('src');
        if (src) {
            const absoluteUrl = resolveUrl(src, baseUrl);
            if (absoluteUrl) {
                resources.push({
                    url: absoluteUrl,
                    type: 'script',
                    severity: 'critical',
                    tag: 'script',
                    attribute: 'src'
                });
            }
        }
    });
}

/**
 * Extract resources from <link> tags (CSS)
 * Severity: Critical (Active)
 */
function extractLinkResources($: CheerioAPI, baseUrl: string, resources: MixedContentResource[]): void {
    $('link[href]').each((_: number, element: Element) => {
        const href = $(element).attr('href');
        const rel = $(element).attr('rel') || '';
        
        // Only check stylesheets and preload/prefetch
        if (href && (rel.includes('stylesheet') || rel.includes('preload') || rel.includes('prefetch'))) {
            const absoluteUrl = resolveUrl(href, baseUrl);
            if (absoluteUrl) {
                resources.push({
                    url: absoluteUrl,
                    type: 'stylesheet',
                    severity: 'critical',
                    tag: 'link',
                    attribute: 'href'
                });
            }
        }
    });
}

/**
 * Extract resources from <img> tags
 * Severity: Warning (Passive)
 */
function extractImageResources($: CheerioAPI, baseUrl: string, resources: MixedContentResource[]): void {
    $('img[src]').each((_: number, element: Element) => {
        const src = $(element).attr('src');
        if (src) {
            const absoluteUrl = resolveUrl(src, baseUrl);
            if (absoluteUrl) {
                resources.push({
                    url: absoluteUrl,
                    type: 'image',
                    severity: 'warning',
                    tag: 'img',
                    attribute: 'src'
                });
            }
        }
    });

    // Also check srcset
    $('img[srcset]').each((_: number, element: Element) => {
        const srcset = $(element).attr('srcset');
        if (srcset) {
            // Parse srcset (format: "url1 1x, url2 2x")
            const sources = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
            sources.forEach(src => {
                const absoluteUrl = resolveUrl(src, baseUrl);
                if (absoluteUrl) {
                    resources.push({
                        url: absoluteUrl,
                        type: 'image',
                        severity: 'warning',
                        tag: 'img',
                        attribute: 'srcset'
                    });
                }
            });
        }
    });
}

/**
 * Extract resources from <iframe> tags
 * Severity: Critical (Active)
 */
function extractIframeResources($: CheerioAPI, baseUrl: string, resources: MixedContentResource[]): void {
    $('iframe[src]').each((_: number, element: Element) => {
        const src = $(element).attr('src');
        if (src) {
            const absoluteUrl = resolveUrl(src, baseUrl);
            if (absoluteUrl) {
                resources.push({
                    url: absoluteUrl,
                    type: 'iframe',
                    severity: 'critical',
                    tag: 'iframe',
                    attribute: 'src'
                });
            }
        }
    });
}

/**
 * Extract resources from <video> and <audio> tags
 * Severity: Warning (Passive)
 */
function extractMediaResources($: CheerioAPI, baseUrl: string, resources: MixedContentResource[]): void {
    // Video tags
    $('video[src]').each((_: number, element: Element) => {
        const src = $(element).attr('src');
        if (src) {
            const absoluteUrl = resolveUrl(src, baseUrl);
            if (absoluteUrl) {
                resources.push({
                    url: absoluteUrl,
                    type: 'video',
                    severity: 'warning',
                    tag: 'video',
                    attribute: 'src'
                });
            }
        }
    });

    // Audio tags
    $('audio[src]').each((_: number, element: Element) => {
        const src = $(element).attr('src');
        if (src) {
            const absoluteUrl = resolveUrl(src, baseUrl);
            if (absoluteUrl) {
                resources.push({
                    url: absoluteUrl,
                    type: 'audio',
                    severity: 'warning',
                    tag: 'audio',
                    attribute: 'src'
                });
            }
        }
    });

    // Source tags (used in video/audio)
    $('source[src]').each((_: number, element: Element) => {
        const src = $(element).attr('src');
        if (src) {
            const absoluteUrl = resolveUrl(src, baseUrl);
            if (absoluteUrl) {
                const parentTag = $(element).parent().prop('tagName')?.toLowerCase() || 'source';
                resources.push({
                    url: absoluteUrl,
                    type: parentTag === 'video' ? 'video' : 'audio',
                    severity: 'warning',
                    tag: 'source',
                    attribute: 'src'
                });
            }
        }
    });

    // Source srcset
    $('source[srcset]').each((_: number, element: Element) => {
        const srcset = $(element).attr('srcset');
        if (srcset) {
            const sources = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
            sources.forEach(src => {
                const absoluteUrl = resolveUrl(src, baseUrl);
                if (absoluteUrl) {
                    const parentTag = $(element).parent().prop('tagName')?.toLowerCase() || 'source';
                    resources.push({
                        url: absoluteUrl,
                        type: parentTag === 'video' ? 'video' : 'audio',
                        severity: 'warning',
                        tag: 'source',
                        attribute: 'srcset'
                    });
                }
            });
        }
    });
}

/**
 * Extract resources from <object> tags
 * Severity: Critical (Active)
 */
function extractObjectResources($: CheerioAPI, baseUrl: string, resources: MixedContentResource[]): void {
    $('object[data]').each((_: number, element: Element) => {
        const data = $(element).attr('data');
        if (data) {
            const absoluteUrl = resolveUrl(data, baseUrl);
            if (absoluteUrl) {
                resources.push({
                    url: absoluteUrl,
                    type: 'object',
                    severity: 'critical',
                    tag: 'object',
                    attribute: 'data'
                });
            }
        }
    });
}

/**
 * Extract HTTP URLs from inline CSS (style attributes and <style> tags)
 * Severity: Warning (Passive) for images, Critical (Active) for CSS imports
 */
function extractInlineCssResources($: CheerioAPI, baseUrl: string, resources: MixedContentResource[]): void {
    // Check style attributes
    $('[style]').each((_: number, element: Element) => {
        const style = $(element).attr('style');
        if (style) {
            extractUrlsFromCss(style, baseUrl, resources, 'inline-style');
        }
    });

    // Check <style> tags
    $('style').each((_: number, element: Element) => {
        const styleContent = $(element).html();
        if (styleContent) {
            extractUrlsFromCss(styleContent, baseUrl, resources, 'style-tag');
        }
    });
}

/**
 * Extract HTTP URLs from CSS content
 */
function extractUrlsFromCss(cssContent: string, baseUrl: string, resources: MixedContentResource[], source: string): void {
    // Match url(http://...) patterns in CSS
    const urlPattern = /url\(['"]?(https?:\/\/[^'")]+)['"]?\)/gi;
    let match;
    
    while ((match = urlPattern.exec(cssContent)) !== null) {
        const url = match[1];
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'http:') {
                resources.push({
                    url: url,
                    type: 'css-background',
                    severity: 'warning',
                    tag: source,
                    attribute: 'url()'
                });
            }
        } catch (e) {
            // Invalid URL, skip
        }
    }

    // Also check @import statements
    const importPattern = /@import\s+['"](https?:\/\/[^'"]+)['"]/gi;
    while ((match = importPattern.exec(cssContent)) !== null) {
        const url = match[1];
        try {
            const urlObj = new URL(url);
            if (urlObj.protocol === 'http:') {
                resources.push({
                    url: url,
                    type: 'css-import',
                    severity: 'critical',
                    tag: source,
                    attribute: '@import'
                });
            }
        } catch (e) {
            // Invalid URL, skip
        }
    }
}

/**
 * Resolve relative URLs to absolute URLs
 * Handles protocol-relative URLs (//example.com) as HTTPS if base is HTTPS
 */
function resolveUrl(url: string, baseUrl: string): string | null {
    try {
        // Skip data URIs and javascript: URIs
        if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('mailto:')) {
            return null;
        }

        // Protocol-relative URL (//example.com) - treat as HTTPS if base is HTTPS
        if (url.startsWith('//')) {
            try {
                const baseUrlObj = new URL(baseUrl);
                if (baseUrlObj.protocol === 'https:') {
                    return 'https:' + url;
                }
                return null;
            } catch (e) {
                return null;
            }
        }

        // Already absolute URL
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }

        // Relative URL - resolve against base
        const baseUrlObj = new URL(baseUrl);
        return new URL(url, baseUrl).href;
    } catch (e) {
        return null;
    }
}

/**
 * Get mixed content statistics
 */
export function getMixedContentStats(mixedContentData: MixedContentData): {
    hasMixedContent: boolean;
    severity: string;
    activeCount: number;
    passiveCount: number;
    totalCount: number;
    criticalTypes: string[];
    warningTypes: string[];
} {
    const criticalTypes = [...new Set(mixedContentData.resources.filter(r => r.severity === 'critical').map(r => r.type))];
    const warningTypes = [...new Set(mixedContentData.resources.filter(r => r.severity === 'warning').map(r => r.type))];

    return {
        hasMixedContent: mixedContentData.hasMixedContent,
        severity: mixedContentData.severity,
        activeCount: mixedContentData.activeMixedContentCount,
        passiveCount: mixedContentData.passiveMixedContentCount,
        totalCount: mixedContentData.totalInsecureResources,
        criticalTypes,
        warningTypes
    };
}

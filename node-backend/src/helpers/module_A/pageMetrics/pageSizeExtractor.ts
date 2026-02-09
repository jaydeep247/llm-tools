import type { CheerioAPI } from 'cheerio';
import type { CrawlResponse, PageSizeMeasurement } from './types.js';

/**
 * Calculate HTML size status based on thresholds
 * Good: < 100 KB, Warning: 100-300 KB, Large: > 300 KB
 */
function calculateHtmlSizeStatus(htmlSizeBytes: number): 'Good' | 'Warning' | 'Large' {
    const KB_100 = 100 * 1024;  // 100 KB
    const KB_300 = 300 * 1024;  // 300 KB
    
    if (htmlSizeBytes < KB_100) return 'Good';
    if (htmlSizeBytes < KB_300) return 'Warning';
    return 'Large';
}

/**
 * Calculate page size status based on thresholds
 * Small: < 1 MB, Medium: 1-3 MB, Large: > 3 MB
 */
function calculatePageSizeStatus(pageSizeBytes: number): 'Small' | 'Medium' | 'Large' {
    const MB_1 = 1024 * 1024;    // 1 MB
    const MB_3 = 3 * 1024 * 1024; // 3 MB
    
    if (pageSizeBytes < MB_1) return 'Small';
    if (pageSizeBytes < MB_3) return 'Medium';
    return 'Large';
}

/**
 * Extract all resource URLs from HTML
 */
function extractResourceUrls($: CheerioAPI): {
    css: string[];
    js: string[];
    images: string[];
    fonts: string[];
    media: string[];
    other: string[];
} {
    const resources = {
        css: [] as string[],
        js: [] as string[],
        images: [] as string[],
        fonts: [] as string[],
        media: [] as string[],
        other: [] as string[]
    };

    // CSS files
    $('link[rel="stylesheet"]').each((_: number, el: Element) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http')) {
            resources.css.push(href);
        }
    });

    // JavaScript files
    $('script[src]').each((_: number, el: Element) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http')) {
            resources.js.push(src);
        }
    });

    // Images
    $('img[src]').each((_: number, el: Element) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http')) {
            resources.images.push(src);
        }
    });

    // Additional images from srcset
    $('img[srcset]').each((_: number, el: Element) => {
        const srcset = $(el).attr('srcset');
        if (srcset) {
            // Parse srcset and extract URLs
            const urls: string[] = srcset.split(',').map((s: string): string => s.trim().split(' ')[0]);
            urls.forEach(url => {
                if (url && url.startsWith('http')) {
                    resources.images.push(url);
                }
            });
        }
    });

    // Fonts (from CSS @import or link with font types)
    $('link[rel="preload"][as="font"]').each((_: number, el: Element) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('http')) {
            resources.fonts.push(href);
        }
    });

    // Media files (video, audio)
    $('video source[src], audio source[src], video[src], audio[src]').each((_: number, el: Element) => {
        const src = $(el).attr('src');
        if (src && src.startsWith('http')) {
            resources.media.push(src);
        }
    });

    // Other resources (iframes, objects, etc.)
    $('iframe[src], object[data], embed[src]').each((_: number, el: Element) => {
        const src = $(el).attr('src') || $(el).attr('data');
        if (src && src.startsWith('http')) {
            resources.other.push(src);
        }
    });

    return resources;
}

/**
 * Fetch resource sizes using HEAD requests
 */
async function fetchResourceSizes(urls: string[]): Promise<{ totalBytes: number, results: Map<string, number> }> {
    const results = new Map<string, number>();
    let totalBytes = 0;

    // Use concurrency control to avoid overwhelming servers
    const CHUNK_SIZE = 5;
    const TIMEOUT = 3000; // 3 seconds timeout
    
    for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
        const chunk = urls.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (url) => {
            try {
                // Skip if already processed
                if (results.has(url)) return;
                
                // Skip non-HTTP URLs
                if (!url.startsWith('http')) return;

                // Create abort controller for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

                const response = await fetch(url, { 
                    method: 'HEAD', 
                    signal: controller.signal 
                });
                
                clearTimeout(timeoutId);

                const lengthHeader = response.headers.get('content-length');
                
                if (lengthHeader) {
                    const bytes = parseInt(lengthHeader, 10);
                    if (!isNaN(bytes) && bytes > 0) {
                        results.set(url, bytes);
                        totalBytes += bytes;
                        return;
                    }
                }
                
                // If no content-length, estimate based on content type
                const contentType = response.headers.get('content-type') || '';
                let estimatedSize = 0;
                
                if (contentType.includes('javascript')) {
                    estimatedSize = 50000; // 50KB estimate for JS
                } else if (contentType.includes('css')) {
                    estimatedSize = 20000; // 20KB estimate for CSS
                } else if (contentType.includes('image')) {
                    estimatedSize = 100000; // 100KB estimate for images
                } else if (contentType.includes('font')) {
                    estimatedSize = 200000; // 200KB estimate for fonts
                } else {
                    estimatedSize = 30000; // 30KB default estimate
                }
                
                results.set(url, estimatedSize);
                totalBytes += estimatedSize;
                
            } catch (error) {
                // On error, set size to 0 and continue
                results.set(url, 0);
            }
        }));
    }

    return { totalBytes, results };
}

/**
 * Calculate resource size breakdown by type
 */
async function calculateResourceSizeBreakdown(resources: ReturnType<typeof extractResourceUrls>): Promise<{
    css: number;
    js: number;
    images: number;
    fonts: number;
    media: number;
    other: number;
}> {
    const breakdown = {
        css: 0,
        js: 0,
        images: 0,
        fonts: 0,
        media: 0,
        other: 0
    };

    // Fetch sizes for each resource type
    const cssResult = await fetchResourceSizes(resources.css);
    const jsResult = await fetchResourceSizes(resources.js);
    const imagesResult = await fetchResourceSizes(resources.images);
    const fontsResult = await fetchResourceSizes(resources.fonts);
    const mediaResult = await fetchResourceSizes(resources.media);
    const otherResult = await fetchResourceSizes(resources.other);

    breakdown.css = cssResult.totalBytes;
    breakdown.js = jsResult.totalBytes;
    breakdown.images = imagesResult.totalBytes;
    breakdown.fonts = fontsResult.totalBytes;
    breakdown.media = mediaResult.totalBytes;
    breakdown.other = otherResult.totalBytes;

    return breakdown;
}

/**
 * Extract page size measurements from a crawled page
 */
export async function extractPageSizeMeasurement(
    url: string,
    $: CheerioAPI,
    response: CrawlResponse | undefined
): Promise<PageSizeMeasurement> {
    // Calculate HTML size (raw HTML document size)
    let htmlSizeBytes = 0;
    
    // Try to get HTML size from response body
    if (response?.body) {
        if (typeof response.body === 'string') {
            htmlSizeBytes = Buffer.byteLength(response.body, 'utf8');
        } else if (Buffer.isBuffer(response.body)) {
            htmlSizeBytes = response.body.length;
        }
    }
    
    // Fallback: try to get from Content-Length header (less accurate for HTML)
    if (!htmlSizeBytes) {
        const contentLength = response?.headers?.['content-length'] || 
                             response?.responseHeaders?.['content-length'];
        if (contentLength) {
            htmlSizeBytes = parseInt(contentLength, 10) || 0;
        }
    }
    
    // Final fallback: estimate from current HTML
    if (!htmlSizeBytes) {
        const htmlContent = $.html();
        htmlSizeBytes = Buffer.byteLength(htmlContent, 'utf8');
    }

    // Extract all resource URLs from the page
    const resources = extractResourceUrls($);
    
    // Calculate resource size breakdown
    const resourceSizeBreakdown = await calculateResourceSizeBreakdown(resources);
    
    // Calculate total resource size
    const totalResourceSizeBytes = Object.values(resourceSizeBreakdown).reduce((sum, size) => sum + size, 0);
    
    // Calculate total page size (HTML + resources)
    const pageSizeBytes = htmlSizeBytes + totalResourceSizeBytes;
    
    // Determine status levels
    const htmlSizeStatus = calculateHtmlSizeStatus(htmlSizeBytes);
    const pageSizeStatus = calculatePageSizeStatus(pageSizeBytes);

    return {
        pageSizeBytes,
        pageSizeStatus,
        htmlSizeBytes,
        htmlSizeStatus,
        totalResourceSizeBytes,
        resourceSizeBreakdown
    };
}

/**
 * Format bytes to human-readable format
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get insight about page size measurements
 */
export function getPageSizeInsights(measurement: PageSizeMeasurement): {
    insights: string[];
    recommendations: string[];
} {
    const insights: string[] = [];
    const recommendations: string[] = [];

    // HTML Size insights
    if (measurement.htmlSizeStatus === 'Large') {
        insights.push(`Large HTML size (${formatBytes(measurement.htmlSizeBytes)}) may indicate server-side bloat`);
        recommendations.push('Optimize server-side templates and reduce inline content');
    } else if (measurement.htmlSizeStatus === 'Warning') {
        insights.push(`HTML size (${formatBytes(measurement.htmlSizeBytes)}) is getting large`);
        recommendations.push('Consider reducing inline CSS/JS and optimizing markup');
    }

    // Resource Size insights
    const { resourceSizeBreakdown } = measurement;
    if (resourceSizeBreakdown) {
        if (resourceSizeBreakdown.images > 1024 * 1024) { // > 1MB of images
            insights.push(`High image payload (${formatBytes(resourceSizeBreakdown.images)})`);
            recommendations.push('Optimize images: use WebP/AVIF, compress, implement lazy loading');
        }
        
        if (resourceSizeBreakdown.js > 500 * 1024) { // > 500KB of JS
            insights.push(`Large JavaScript payload (${formatBytes(resourceSizeBreakdown.js)})`);
            recommendations.push('Optimize JavaScript: code splitting, tree shaking, compression');
        }

        if (resourceSizeBreakdown.css > 100 * 1024) { // > 100KB of CSS
            insights.push(`Large CSS payload (${formatBytes(resourceSizeBreakdown.css)})`);
            recommendations.push('Optimize CSS: remove unused styles, use critical CSS');
        }
    }

    // Overall Page Size insights
    if (measurement.pageSizeStatus === 'Large') {
        insights.push(`Large total page size (${formatBytes(measurement.pageSizeBytes)}) impacts Core Web Vitals`);
        recommendations.push('Implement comprehensive optimization: compression, caching, CDN');
    } else if (measurement.pageSizeStatus === 'Medium') {
        insights.push(`Medium page size (${formatBytes(measurement.pageSizeBytes)}) could be optimized`);
        recommendations.push('Consider resource optimization and compression strategies');
    }

    return { insights, recommendations };
}
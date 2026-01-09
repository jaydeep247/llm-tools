/**
 * Calculate folder depth from URL path
 * Example: /folder1/folder2/page.html = depth 2
 * Example: / = depth 0
 */
export function calculateFolderDepth(url: string): number {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        
        // Remove leading/trailing slashes and filter out empty segments
        const segments = pathname.split('/').filter(seg => seg.length > 0);
        
        // Don't count the file itself (last segment if it has an extension)
        const lastSegment = segments[segments.length - 1];
        if (lastSegment && /\.\w+$/.test(lastSegment)) {
            return Math.max(0, segments.length - 1);
        }
        
        return segments.length;
    } catch {
        return 0;
    }
}

/**
 * Calculate crawl depth (number of hops from start URL)
 * This requires tracking the depth during crawling
 * For now, we'll estimate based on URL path depth relative to start URL
 */
export function calculateCrawlDepth(currentUrl: string, startUrl: string): number {
    try {
        const current = new URL(currentUrl);
        const start = new URL(startUrl);
        
        // If different hosts, return 0 (shouldn't happen in same-site crawl)
        if (current.hostname !== start.hostname) {
            return 0;
        }
        
        const currentPath = current.pathname.split('/').filter(seg => seg.length > 0);
        const startPath = start.pathname.split('/').filter(seg => seg.length > 0);
        
        // Find common prefix
        let commonLength = 0;
        for (let i = 0; i < Math.min(currentPath.length, startPath.length); i++) {
            if (currentPath[i] === startPath[i]) {
                commonLength++;
            } else {
                break;
            }
        }
        
        // Depth is the difference in path segments after common prefix
        return Math.max(0, currentPath.length - commonLength);
    } catch {
        return 0;
    }
}

/**
 * Calculate crawl depth using request metadata if available
 * This is a more accurate method when crawl depth is tracked during crawling
 */
export function getCrawlDepthFromRequest(request: { userData?: { depth?: number } }): number {
    return request.userData?.depth ?? 0;
}


import type { CrawlResponse } from './types.js';

/**
 * Fetch Last-Modified header from URL using HTTP HEAD request
 * This is the most reliable method to get the last modified date
 */
export async function fetchLastModified(url: string): Promise<string | undefined> {
    try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        try {
            // Try HEAD request first (faster, doesn't download content)
            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                redirect: 'follow',
            });

            clearTimeout(timeout);

            const lastModified = response.headers.get('last-modified');
            
            if (lastModified) {
                // console.log(`[Last-Modified] Found via HEAD for ${url}: ${lastModified}`);
                return lastModified;
            }

            // If HEAD doesn't provide Last-Modified, return undefined
            return undefined;
        } catch (headError) {
            clearTimeout(timeout);
            
            // If HEAD fails, try GET request as fallback
            // Some servers don't support HEAD
            const getController = new AbortController();
            const getTimeout = setTimeout(() => getController.abort(), 5000);
            
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    signal: getController.signal,
                    redirect: 'follow',
                });

                clearTimeout(getTimeout);

                const lastModified = response.headers.get('last-modified');
                
                if (lastModified) {
                    // console.log(`[Last-Modified] Found via GET for ${url}: ${lastModified}`);
                }
                
                // We don't need the response body, just the headers
                // Abort the request to stop downloading
                getController.abort();
                
                return lastModified || undefined;
            } catch (getError) {
                clearTimeout(getTimeout);
                // console.log(`[Last-Modified] Not available for ${url}`);
                return undefined;
            }
        }
    } catch (error) {
        // Both methods failed, return undefined
        // console.log(`[Last-Modified] Error fetching for ${url}:`, error);
        return undefined;
    }
}

/**
 * Extract Last-Modified from existing response object (fallback)
 * Use this as a secondary method when the direct fetch is not needed
 */
export function extractLastModifiedFromResponse(response?: CrawlResponse): string | undefined {
    return response?.headers?.['last-modified'] || 
           response?.responseHeaders?.['last-modified'];
}

/**
 * Get Last-Modified with fallback strategy
 * First tries the response headers, then makes explicit HTTP request
 */
export async function getLastModified(
    url: string,
    response?: CrawlResponse
): Promise<string | undefined> {
    // First, try to get from existing response
    const fromResponse = extractLastModifiedFromResponse(response);
    
    if (fromResponse) {
        return fromResponse;
    }

    // If not available in response, make explicit HTTP request
    return fetchLastModified(url);
}

/**
 * Resource Sizer
 * Fetches Content-Length of resources using HEAD requests.
 */

export async function fetchResourceSizes(urls: string[]): Promise<{ totalBytes: number, results: Map<string, number> }> {
    const results = new Map<string, number>();
    let totalBytes = 0;

    // Use concurrency control
    const CHUNK_SIZE = 10;
    
    for (let i = 0; i < urls.length; i += CHUNK_SIZE) {
        const chunk = urls.slice(i, i + CHUNK_SIZE);
        
        await Promise.all(chunk.map(async (url) => {
            try {
                // Skip if already processed
                if (results.has(url)) return;
                
                // Skip if not http(s)
                if (!url.startsWith('http')) return;

                const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
                const lengthHeader = response.headers.get('content-length');
                
                if (lengthHeader) {
                    const bytes = parseInt(lengthHeader, 10);
                    if (!isNaN(bytes)) {
                        results.set(url, bytes);
                        totalBytes += bytes;
                        return;
                    }
                }
                
                // If no content-length, we might want to guess or skip.
                // For now, we assume 0 or unmeasurable.
                results.set(url, 0);
            } catch (error) {
                // Ignore errors (timeouts, etc.) and treat as 0 size
                results.set(url, 0);
            }
        }));
    }

    return { totalBytes, results };
}

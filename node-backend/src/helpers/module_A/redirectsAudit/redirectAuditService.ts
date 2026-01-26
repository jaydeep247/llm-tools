/**
 * Comprehensive Redirect Audit Service
 * 
 * Detects and analyzes:
 * - 301, 302, 307 redirects
 * - Redirect chains
 * - Redirect loops
 * - Final URL status
 * - Broken redirects
 * - Canonical URL alignment
 */

export interface RedirectHop {
    url: string;
    statusCode: number;
    redirectType: '301' | '302' | '307' | '308' | null;
    redirectUrl: string | null;
    headers: Record<string, string>;
}

export interface RedirectAuditResult {
    originalUrl: string;
    finalUrl: string;
    finalStatusCode: number;
    
    // Redirect detection
    has301Redirect: boolean;
    has302Redirect: boolean;
    has307Redirect: boolean;
    
    // Redirect chain analysis
    redirectChain: RedirectHop[];
    chainLength: number;
    hasRedirectChain: boolean;
    
    // Redirect loop detection
    hasRedirectLoop: boolean;
    loopDetectedAt?: string;
    
    // Final URL status
    finalUrlStatus: 'ok' | 'broken' | 'server_error' | 'unreachable';
    finalUrlStatusCode: number;
    
    // Broken redirect detection
    isBrokenRedirect: boolean;
    brokenReason?: string;
    
    // Canonical URL alignment
    canonicalUrl?: string;
    canonicalAlignment: 'match' | 'mismatch' | 'not_found' | 'error';
    canonicalMismatchReason?: string;
    
    // Overall status
    overallStatus: 'ok' | 'warning' | 'error';
    issues: string[];
}

const MAX_REDIRECT_HOPS = 10;
const REQUEST_TIMEOUT = 15000; // 15 seconds

/**
 * Simple URL normalization for loop detection
 * Just normalizes basic things to detect if we've seen this URL before
 */
function normalizeUrl(url: string): string {
    try {
        const urlObj = new URL(url);
        urlObj.hostname = urlObj.hostname.toLowerCase();
        urlObj.pathname = urlObj.pathname.replace(/\/$/, '') || '/';
        urlObj.hash = '';
        // Remove default ports
        if (urlObj.port === '80' && urlObj.protocol === 'http:') {
            urlObj.port = '';
        }
        if (urlObj.port === '443' && urlObj.protocol === 'https:') {
            urlObj.port = '';
        }
        return urlObj.href;
    } catch {
        return url.toLowerCase().trim();
    }
}

/**
 * Normalize URL for comparison
 * Handles: trailing slashes, query params, fragments, www, protocol, ports, case
 */
function normalizeUrlForComparison(url: string): {
    protocol: string;
    hostname: string;
    hostnameWithoutWww: string;
    pathname: string;
    search: string;
    hash: string;
} {
    try {
        const urlObj = new URL(url);
        
        // Normalize protocol to lowercase
        const protocol = urlObj.protocol.toLowerCase();
        
        // Lowercase hostname
        const hostname = urlObj.hostname.toLowerCase();
        
        // Hostname without www prefix
        const hostnameWithoutWww = hostname.replace(/^www\./i, '');
        
        // Normalize pathname: remove trailing slash (except root)
        let pathname = urlObj.pathname;
        if (pathname !== '/' && pathname.endsWith('/')) {
            pathname = pathname.slice(0, -1);
        }
        pathname = pathname || '/';
        
        // Remove fragments
        const hash = '';
        
        // Normalize query parameters
        // Remove common tracking parameters
        const trackingParams = [
            'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
            'fbclid', 'gclid', 'ref', 'source', 'campaign',
            'mc_cid', 'mc_eid', '_ga', '_gid',
            'affiliate_id', 'affid', 'partner_id', 'utm_id',
            'gbraid', 'wbraid', 'twclid'
        ];
        
        const params = urlObj.searchParams;
        const keysToDelete: string[] = [];
        params.forEach((_value, key) => {
            const lowerKey = key.toLowerCase();
            // Remove tracking params
            if (trackingParams.some(tp => lowerKey === tp.toLowerCase() || lowerKey.startsWith(tp.toLowerCase() + '_'))) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(k => params.delete(k));
        
        // Sort query parameters for consistent comparison
        const sortedParams = new URLSearchParams();
        const sortedKeys = Array.from(params.keys()).sort();
        sortedKeys.forEach(key => {
            const value = params.get(key);
            if (value !== null) {
                sortedParams.append(key, value);
            }
        });
        const search = sortedParams.toString();
        
        return {
            protocol,
            hostname,
            hostnameWithoutWww,
            pathname,
            search,
            hash
        };
    } catch {
        // Fallback for invalid URLs
        return {
            protocol: '',
            hostname: url.toLowerCase(),
            hostnameWithoutWww: url.toLowerCase().replace(/^www\./i, ''),
            pathname: '/',
            search: '',
            hash: ''
        };
    }
}

/**
 * Compare two URLs with flexible matching
 * Handles: www differences, protocol differences, query param differences, trailing slashes
 */
function compareUrls(url1: string, url2: string): boolean {
    const norm1 = normalizeUrlForComparison(url1);
    const norm2 = normalizeUrlForComparison(url2);
    
    // Compare hostnames (with and without www)
    const hostMatch = norm1.hostnameWithoutWww === norm2.hostnameWithoutWww;
    if (!hostMatch) {
        return false;
    }
    
    // Compare pathnames (case-sensitive, but trailing slash normalized)
    const pathMatch = norm1.pathname === norm2.pathname;
    if (!pathMatch) {
        return false;
    }
    
    // Compare query strings (after removing tracking params)
    const queryMatch = norm1.search === norm2.search;
    if (!queryMatch) {
        // If queries don't match, check if they're both empty or both have only tracking params
        // (both would be empty after normalization if only tracking params existed)
        if ((norm1.search === '' && norm2.search === '') || 
            (norm1.search !== '' && norm2.search !== '')) {
            // Allow query differences if they're both non-empty (might have different non-tracking params)
            // But for canonical matching, we should be strict - canonical should match exactly
            // Actually, let's be lenient: if host and path match, consider it a match
            // Query params in canonical are often omitted or different
            return true;
        }
        return false;
    }
    
    // Protocol differences are acceptable (http vs https)
    // Both should be http or https
    const protocolMatch = (norm1.protocol === 'http:' || norm1.protocol === 'https:') &&
                         (norm2.protocol === 'http:' || norm2.protocol === 'https:');
    
    // If everything else matches, protocol difference is OK
    return protocolMatch;
}

/**
 * Resolve relative URL to absolute
 */
function resolveUrl(url: string, baseUrl: string): string {
    try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        const base = new URL(baseUrl);
        if (url.startsWith('//')) {
            return `${base.protocol}${url}`;
        }
        if (url.startsWith('/')) {
            return `${base.protocol}//${base.host}${url}`;
        }
        return new URL(url, baseUrl).href;
    } catch {
        return url;
    }
}

/**
 * Fetch URL without following redirects
 */
async function fetchWithoutRedirect(url: string): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    finalUrl: string;
}> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
        // Use HEAD first for efficiency
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'manual', // Don't follow redirects
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
            }
        });

        clearTimeout(timeoutId);

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });

        return {
            statusCode: response.status,
            headers,
            finalUrl: response.url || url
        };
    } catch (error: any) {
        clearTimeout(timeoutId);
        
        // If HEAD fails, try GET
        if (error.name === 'AbortError' || error.message?.includes('timeout')) {
            throw new Error('Request timeout');
        }

        try {
            const getResponse = await fetch(url, {
                method: 'GET',
                redirect: 'manual',
                signal: AbortSignal.timeout(REQUEST_TIMEOUT),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                }
            });

            const headers: Record<string, string> = {};
            getResponse.headers.forEach((value, key) => {
                headers[key.toLowerCase()] = value;
            });

            return {
                statusCode: getResponse.status,
                headers,
                finalUrl: getResponse.url || url
            };
        } catch (getError: any) {
            throw new Error(getError.message || 'Failed to fetch URL');
        }
    }
}

/**
 * Check if status code is a redirect
 */
function isRedirect(statusCode: number): boolean {
    return statusCode >= 300 && statusCode < 400;
}

/**
 * Get redirect type from status code
 */
function getRedirectType(statusCode: number): '301' | '302' | '307' | '308' | null {
    if (statusCode === 301) return '301';
    if (statusCode === 302) return '302';
    if (statusCode === 307) return '307';
    if (statusCode === 308) return '308';
    return null;
}

/**
 * Extract canonical URL from HTML
 */
async function extractCanonicalUrl(url: string): Promise<string | null> {
    try {
        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: AbortSignal.timeout(REQUEST_TIMEOUT),
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });

        if (!response.ok) {
            return null;
        }

        const html = await response.text();
        
        // Extract canonical from <link rel="canonical">
        // Handle various formats:
        // <link rel="canonical" href="...">
        // <link href="..." rel="canonical">
        // <link rel='canonical' href='...'>
        // Multiple regex patterns to catch different variations
        const patterns = [
            /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']+)["']/i,
            /<link[^>]+href\s*=\s*["']([^"']+)["'][^>]+rel\s*=\s*["']canonical["']/i,
            /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*[""]([^""]+)[""]/i,
            /<link[^>]+href\s*=\s*[""]([^""]+)[""][^>]+rel\s*=\s*["']canonical["']/i
        ];
        
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
                const canonicalUrl = match[1].trim();
                if (canonicalUrl) {
                    return resolveUrl(canonicalUrl, url);
                }
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Perform comprehensive redirect audit for a single URL
 */
export async function auditRedirect(url: string): Promise<RedirectAuditResult> {
    const result: RedirectAuditResult = {
        originalUrl: url,
        finalUrl: url,
        finalStatusCode: 0,
        has301Redirect: false,
        has302Redirect: false,
        has307Redirect: false,
        redirectChain: [],
        chainLength: 0,
        hasRedirectChain: false,
        hasRedirectLoop: false,
        finalUrlStatus: 'unreachable',
        finalUrlStatusCode: 0,
        isBrokenRedirect: false,
        canonicalAlignment: 'error',
        overallStatus: 'error',
        issues: []
    };

    const visited = new Set<string>();
    const chain: RedirectHop[] = [];
    let currentUrl = url;
    let hopCount = 0;

    // Follow redirect chain
    while (hopCount < MAX_REDIRECT_HOPS) {
        const normalizedCurrent = normalizeUrl(currentUrl);
        
        // Check for redirect loop
        if (visited.has(normalizedCurrent)) {
            result.hasRedirectLoop = true;
            result.loopDetectedAt = currentUrl;
            result.issues.push(`Redirect loop detected: ${currentUrl} was visited before`);
            result.overallStatus = 'error';
            break;
        }

        visited.add(normalizedCurrent);

        try {
            const response = await fetchWithoutRedirect(currentUrl);
            
            const hop: RedirectHop = {
                url: currentUrl,
                statusCode: response.statusCode,
                redirectType: getRedirectType(response.statusCode),
                redirectUrl: null,
                headers: response.headers
            };

            // Check for redirect
            if (isRedirect(response.statusCode)) {
                const redirectType = getRedirectType(response.statusCode);
                
                // Track redirect types
                if (redirectType === '301') result.has301Redirect = true;
                if (redirectType === '302') result.has302Redirect = true;
                if (redirectType === '307') result.has307Redirect = true;

                const location = response.headers['location'];
                if (location) {
                    const redirectUrl = resolveUrl(location, currentUrl);
                    hop.redirectUrl = redirectUrl;
                    chain.push(hop);
                    currentUrl = redirectUrl;
                    hopCount++;
                    continue;
                }
            }

            // Not a redirect or no location header - this is the final URL
            chain.push(hop);
            result.finalUrl = currentUrl;
            result.finalStatusCode = response.statusCode;
            result.finalUrlStatusCode = response.statusCode;
            break;

        } catch (error: any) {
            result.issues.push(`Error fetching ${currentUrl}: ${error.message}`);
            result.finalUrlStatus = 'unreachable';
            result.overallStatus = 'error';
            return result;
        }
    }

    // Analyze redirect chain
    result.redirectChain = chain;
    result.chainLength = chain.length;
    result.hasRedirectChain = chain.length > 1;

    if (result.hasRedirectChain) {
        result.issues.push(`Redirect chain detected: ${chain.length} hop(s)`);
        if (result.overallStatus === 'error') {
            // Keep error status if loop detected
        } else {
            result.overallStatus = 'warning';
        }
    }

    // Check final URL status
    if (result.finalStatusCode === 200) {
        result.finalUrlStatus = 'ok';
    } else if (result.finalStatusCode >= 400 && result.finalStatusCode < 500) {
        result.finalUrlStatus = 'broken';
        result.isBrokenRedirect = true;
        result.brokenReason = `Final URL returns ${result.finalStatusCode}`;
        result.issues.push(`Broken redirect: Final URL returns ${result.finalStatusCode}`);
        result.overallStatus = 'error';
    } else if (result.finalStatusCode >= 500) {
        result.finalUrlStatus = 'server_error';
        result.isBrokenRedirect = true;
        result.brokenReason = `Final URL returns ${result.finalStatusCode}`;
        result.issues.push(`Server error: Final URL returns ${result.finalStatusCode}`);
        result.overallStatus = 'error';
    }

    // Check for temporary redirects (warning)
    if (result.has302Redirect || result.has307Redirect) {
        result.issues.push('Temporary redirect detected (302/307) - SEO value may not fully pass');
        if (result.overallStatus === 'ok') {
            result.overallStatus = 'warning';
        }
    }

    // Verify canonical URL alignment (only if final URL is OK)
    if (result.finalUrlStatus === 'ok' && !result.hasRedirectLoop) {
        try {
            const canonicalUrl = await extractCanonicalUrl(result.finalUrl);
            
            if (canonicalUrl) {
                result.canonicalUrl = canonicalUrl;
                
                // Use flexible comparison that handles www, protocol, query params, trailing slashes
                const urlsMatch = compareUrls(result.finalUrl, canonicalUrl);
                
                if (urlsMatch) {
                    result.canonicalAlignment = 'match';
                } else {
                    // Additional lenient check: if domain and path match (ignoring www, protocol, query params)
                    // consider it a match since canonical URLs often omit query params or use different variants
                    try {
                        const finalNorm = normalizeUrlForComparison(result.finalUrl);
                        const canonicalNorm = normalizeUrlForComparison(canonicalUrl);
                        
                        // Match if same domain (without www) and same path
                        if (finalNorm.hostnameWithoutWww === canonicalNorm.hostnameWithoutWww &&
                            finalNorm.pathname === canonicalNorm.pathname) {
                            // Domain and path match - consider it aligned
                            // (query params and www/protocol differences are acceptable)
                            result.canonicalAlignment = 'match';
                        } else {
                            result.canonicalAlignment = 'mismatch';
                            result.canonicalMismatchReason = `Canonical (${canonicalUrl}) does not match final URL (${result.finalUrl})`;
                            result.issues.push(result.canonicalMismatchReason);
                            if (result.overallStatus === 'ok') {
                                result.overallStatus = 'warning';
                            }
                        }
                    } catch (parseError) {
                        // If URL parsing fails, mark as mismatch
                        result.canonicalAlignment = 'mismatch';
                        result.canonicalMismatchReason = `Canonical (${canonicalUrl}) does not match final URL (${result.finalUrl})`;
                        result.issues.push(result.canonicalMismatchReason);
                        if (result.overallStatus === 'ok') {
                            result.overallStatus = 'warning';
                        }
                    }
                }
            } else {
                result.canonicalAlignment = 'not_found';
            }
        } catch (error: any) {
            result.canonicalAlignment = 'error';
            result.issues.push(`Error checking canonical URL: ${error.message}`);
        }
    }

    // Set overall status if still error
    if (result.overallStatus === 'error' && result.issues.length === 0) {
        result.overallStatus = 'ok';
    }

    return result;
}

/**
 * Audit multiple URLs
 */
export async function auditRedirects(urls: string[]): Promise<RedirectAuditResult[]> {
    const results: RedirectAuditResult[] = [];
    
    // Process with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        const batchResults = await Promise.all(
            batch.map(url => auditRedirect(url).catch(error => {
                return {
                    originalUrl: url,
                    finalUrl: url,
                    finalStatusCode: 0,
                    has301Redirect: false,
                    has302Redirect: false,
                    has307Redirect: false,
                    redirectChain: [],
                    chainLength: 0,
                    hasRedirectChain: false,
                    hasRedirectLoop: false,
                    finalUrlStatus: 'unreachable',
                    finalUrlStatusCode: 0,
                    isBrokenRedirect: true,
                    brokenReason: error.message,
                    canonicalAlignment: 'error',
                    overallStatus: 'error',
                    issues: [`Error: ${error.message}`]
                } as RedirectAuditResult;
            }))
        );
        results.push(...batchResults);
        
        // Small delay between batches
        if (i + concurrency < urls.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    return results;
}

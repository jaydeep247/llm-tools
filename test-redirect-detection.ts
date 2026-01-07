/**
 * Test file for Redirect URL and Redirect Type detection
 * 
 * Tests redirect detection for any website:
 * Usage: npx tsx test-redirect-detection.ts [URL]
 * Example: npx tsx test-redirect-detection.ts https://example.com
 * 
 * Without URL, runs built-in tests
 */

import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import https from 'https';
import http from 'http';

interface RedirectData {
    redirectUrl?: string;
    redirectType?: string;
}

interface MockResponse {
    statusCode: number;
    headers: {
        location?: string;
        [key: string]: string | undefined;
    };
}

/**
 * Fetch a URL and return response with HTML
 */
async function fetchUrl(url: string): Promise<{ statusCode: number; headers: any; html: string; finalUrl: string }> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const client = urlObj.protocol === 'https:' ? https : http;
        
        let redirectCount = 0;
        let currentUrl = url;
        
        const makeRequest = (requestUrl: string) => {
            const options = {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; RedirectTester/1.0)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                // Don't follow redirects automatically - we want to detect them
                agent: false,
                rejectUnauthorized: false
            };
            
            const urlObjReq = new URL(requestUrl);
            const clientReq = urlObjReq.protocol === 'https:' ? https : http;
            
            const req = clientReq.get(requestUrl, options, (res) => {
                let html = '';
                
                res.on('data', (chunk) => {
                    html += chunk;
                });
                
                res.on('end', () => {
                    // If it's a redirect status code
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
                        const location = res.headers.location;
                        if (location && redirectCount < 10) {
                            redirectCount++;
                            // Resolve relative URLs
                            const nextUrl = location.startsWith('http') 
                                ? location 
                                : new URL(location, requestUrl).toString();
                            currentUrl = nextUrl;
                            makeRequest(nextUrl);
                        } else {
                            resolve({
                                statusCode: res.statusCode,
                                headers: res.headers,
                                html,
                                finalUrl: currentUrl
                            });
                        }
                    } else {
                        resolve({
                            statusCode: res.statusCode || 200,
                            headers: res.headers,
                            html,
                            finalUrl: currentUrl
                        });
                    }
                });
            });
            
            req.on('error', (error) => {
                reject(error);
            });
            
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
        };
        
        makeRequest(currentUrl);
    });
}

/**
 * Extract redirect data from response and HTML
 */
function extractRedirectData($: CheerioAPI, response: MockResponse, currentUrl: string): RedirectData {
    const result: RedirectData = {
        redirectUrl: undefined,
        redirectType: undefined
    };

    // Check HTTP redirect status codes
    if (response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location || response.headers.Location;
        if (location) {
            result.redirectUrl = location;
            
            // Determine redirect type based on status code
            switch (response.statusCode) {
                case 301:
                    result.redirectType = '301-permanent';
                    break;
                case 302:
                    result.redirectType = '302-temporary';
                    break;
                case 303:
                    result.redirectType = '303-see-other';
                    break;
                case 307:
                    result.redirectType = '307-temporary';
                    break;
                case 308:
                    result.redirectType = '308-permanent';
                    break;
                default:
                    result.redirectType = `${response.statusCode}-redirect`;
            }
            return result;
        }
    }

    // Check for meta refresh redirect
    const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
    if (metaRefresh) {
        // Extract URL from content attribute (e.g., "5; url=https://example.com")
        const urlMatch = metaRefresh.match(/url=(.+)$/i);
        if (urlMatch) {
            result.redirectUrl = urlMatch[1].trim();
            result.redirectType = 'meta-refresh';
            return result;
        }
    }

    // Check for JavaScript redirects
    const scriptTags = $('script').toArray();
    for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';
        
        // Check for common JavaScript redirect patterns
        if (
            scriptContent.includes('window.location') ||
            scriptContent.includes('location.href') ||
            scriptContent.includes('location.replace') ||
            scriptContent.includes('location.assign')
        ) {
            // Try to extract the URL
            const urlMatch = scriptContent.match(/location(?:\.href|\.replace|\.assign)?\s*=\s*["']([^"']+)["']/);
            if (urlMatch) {
                result.redirectUrl = urlMatch[1];
                result.redirectType = 'javascript';
                return result;
            }
            
            // If we can't extract the URL but detect the redirect
            result.redirectType = 'javascript';
            return result;
        }
    }

    return result;
}

/**
 * Test a real website for redirects
 */
async function testWebsite(url: string) {
    console.log('\n' + '='.repeat(60));
    console.log(`🔍 Testing Website: ${url}`);
    console.log('='.repeat(60) + '\n');
    
    try {
        console.log('📡 Fetching URL...');
        const response = await fetchUrl(url);
        
        console.log(`✅ Response received (Status: ${response.statusCode})`);
        console.log(`📄 Final URL: ${response.finalUrl}`);
        
        // Check if URL changed (HTTP-level redirect occurred)
        const urlChanged = response.finalUrl !== url;
        
        console.log('\n📊 Redirect Detection Results:');
        console.log('─'.repeat(60));
        
        if (urlChanged) {
            // URL changed - HTTP redirect occurred
            console.log(`🔄 HTTP Redirect Detected`);
            console.log(`📍 Original URL: ${url}`);
            console.log(`📍 Final URL: ${response.finalUrl}`);
            
            // Check if it's HTTPS upgrade
            if (url.startsWith('http://') && response.finalUrl.startsWith('https://')) {
                const pathMatch = url.substring(7) === response.finalUrl.substring(8);
                if (pathMatch) {
                    console.log(`🔄 Redirect Type: 301-permanent (HTTPS upgrade)`);
                    console.log('\n🎯 SEO Analysis:');
                    console.log('   ✅ Permanent redirect (HTTPS upgrade) - Excellent for SEO');
                }
            } else {
                console.log(`🔄 Redirect Type: HTTP redirect (likely 301 or 302)`);
                console.log('\n🎯 SEO Analysis:');
                console.log('   ℹ️  HTTP-level redirect detected - Check server config for exact type');
            }
        } else {
            // Check HTML-based redirects
            const $ = load(response.html);
            const redirectData = extractRedirectData($, response, url);
            
            if (redirectData.redirectType) {
                console.log(`🔄 Redirect Type: ${redirectData.redirectType}`);
                console.log(`🔗 Redirect URL: ${redirectData.redirectUrl || 'N/A'}`);
                
                // Provide SEO analysis
                console.log('\n🎯 SEO Analysis:');
                if (redirectData.redirectType === '301-permanent' || redirectData.redirectType === '308-permanent') {
                    console.log('   ✅ Permanent redirect - Good for SEO (passes link equity)');
                } else if (redirectData.redirectType === '302-temporary' || redirectData.redirectType === '307-temporary') {
                    console.log('   ⚠️  Temporary redirect - Warning (doesn\'t pass full link equity)');
                } else if (redirectData.redirectType === 'meta-refresh') {
                    console.log('   ❌ Meta refresh redirect - Not ideal for SEO (slow, not search engine friendly)');
                } else if (redirectData.redirectType === 'javascript') {
                    console.log('   ❌ JavaScript redirect - Bad for SEO (search engines may not follow)');
                }
            } else {
                console.log('✅ No redirect detected - This is a normal page');
            }
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
        
    } catch (error) {
        console.error('\n❌ Error testing website:', error instanceof Error ? error.message : error);
        console.log('\n' + '='.repeat(60) + '\n');
    }
}

/**
 * Run built-in tests with mock data
 */
function runBuiltInTests() {
    console.log('🧪 Testing Redirect Detection\n');
    console.log('='.repeat(60));

// Test 1: 301 Permanent Redirect
console.log('\n📋 Test 1: 301 Permanent Redirect');
const test1Html = '<html><body><h1>Moved Permanently</h1></body></html>';
const test1$ = load(test1Html);
const test1Response: MockResponse = {
    statusCode: 301,
    headers: {
        location: 'https://example.com/new-location'
    }
};
const test1Result = extractRedirectData(test1$, test1Response, 'https://example.com/old');
console.log('Result:', test1Result);
console.log('✅ Expected: redirectType = "301-permanent", redirectUrl = "https://example.com/new-location"');
console.log('✅ Match:', test1Result.redirectType === '301-permanent' && test1Result.redirectUrl === 'https://example.com/new-location');

// Test 2: 302 Temporary Redirect
console.log('\n📋 Test 2: 302 Temporary Redirect');
const test2Html = '<html><body><h1>Found</h1></body></html>';
const test2$ = load(test2Html);
const test2Response: MockResponse = {
    statusCode: 302,
    headers: {
        location: 'https://example.com/temporary'
    }
};
const test2Result = extractRedirectData(test2$, test2Response, 'https://example.com/old');
console.log('Result:', test2Result);
console.log('✅ Expected: redirectType = "302-temporary", redirectUrl = "https://example.com/temporary"');
console.log('✅ Match:', test2Result.redirectType === '302-temporary' && test2Result.redirectUrl === 'https://example.com/temporary');

// Test 3: 307 Temporary Redirect (preserves method)
console.log('\n📋 Test 3: 307 Temporary Redirect');
const test3Html = '<html><body><h1>Temporary Redirect</h1></body></html>';
const test3$ = load(test3Html);
const test3Response: MockResponse = {
    statusCode: 307,
    headers: {
        location: 'https://example.com/temp-preserve-method'
    }
};
const test3Result = extractRedirectData(test3$, test3Response, 'https://example.com/old');
console.log('Result:', test3Result);
console.log('✅ Expected: redirectType = "307-temporary", redirectUrl = "https://example.com/temp-preserve-method"');
console.log('✅ Match:', test3Result.redirectType === '307-temporary' && test3Result.redirectUrl === 'https://example.com/temp-preserve-method');

// Test 4: 308 Permanent Redirect (preserves method)
console.log('\n📋 Test 4: 308 Permanent Redirect');
const test4Html = '<html><body><h1>Permanent Redirect</h1></body></html>';
const test4$ = load(test4Html);
const test4Response: MockResponse = {
    statusCode: 308,
    headers: {
        location: 'https://example.com/perm-preserve-method'
    }
};
const test4Result = extractRedirectData(test4$, test4Response, 'https://example.com/old');
console.log('Result:', test4Result);
console.log('✅ Expected: redirectType = "308-permanent", redirectUrl = "https://example.com/perm-preserve-method"');
console.log('✅ Match:', test4Result.redirectType === '308-permanent' && test4Result.redirectUrl === 'https://example.com/perm-preserve-method');

// Test 5: Meta Refresh Redirect
console.log('\n📋 Test 5: Meta Refresh Redirect');
const test5Html = `
<html>
<head>
    <meta http-equiv="refresh" content="5; url=https://example.com/meta-redirect">
</head>
<body><h1>Redirecting...</h1></body>
</html>
`;
const test5$ = load(test5Html);
const test5Response: MockResponse = {
    statusCode: 200,
    headers: {}
};
const test5Result = extractRedirectData(test5$, test5Response, 'https://example.com/old');
console.log('Result:', test5Result);
console.log('✅ Expected: redirectType = "meta-refresh", redirectUrl = "https://example.com/meta-redirect"');
console.log('✅ Match:', test5Result.redirectType === 'meta-refresh' && test5Result.redirectUrl === 'https://example.com/meta-redirect');

// Test 6: JavaScript Redirect (window.location)
console.log('\n📋 Test 6: JavaScript Redirect (window.location)');
const test6Html = `
<html>
<head>
    <script>
        window.location = "https://example.com/js-redirect";
    </script>
</head>
<body><h1>Redirecting...</h1></body>
</html>
`;
const test6$ = load(test6Html);
const test6Response: MockResponse = {
    statusCode: 200,
    headers: {}
};
const test6Result = extractRedirectData(test6$, test6Response, 'https://example.com/old');
console.log('Result:', test6Result);
console.log('✅ Expected: redirectType = "javascript", redirectUrl = "https://example.com/js-redirect"');
console.log('✅ Match:', test6Result.redirectType === 'javascript' && test6Result.redirectUrl === 'https://example.com/js-redirect');

// Test 7: JavaScript Redirect (location.href)
console.log('\n📋 Test 7: JavaScript Redirect (location.href)');
const test7Html = `
<html>
<head>
    <script>
        location.href = "https://example.com/js-href-redirect";
    </script>
</head>
<body><h1>Redirecting...</h1></body>
</html>
`;
const test7$ = load(test7Html);
const test7Response: MockResponse = {
    statusCode: 200,
    headers: {}
};
const test7Result = extractRedirectData(test7$, test7Response, 'https://example.com/old');
console.log('Result:', test7Result);
console.log('✅ Expected: redirectType = "javascript", redirectUrl = "https://example.com/js-href-redirect"');
console.log('✅ Match:', test7Result.redirectType === 'javascript' && test7Result.redirectUrl === 'https://example.com/js-href-redirect');

// Test 8: No Redirect
console.log('\n📋 Test 8: No Redirect (Normal Page)');
const test8Html = `
<html>
<head><title>Normal Page</title></head>
<body><h1>Hello World</h1></body>
</html>
`;
const test8$ = load(test8Html);
const test8Response: MockResponse = {
    statusCode: 200,
    headers: {}
};
const test8Result = extractRedirectData(test8$, test8Response, 'https://example.com/page');
console.log('Result:', test8Result);
console.log('✅ Expected: redirectType = undefined, redirectUrl = undefined');
console.log('✅ Match:', test8Result.redirectType === undefined && test8Result.redirectUrl === undefined);

// Summary
console.log('\n' + '='.repeat(60));
console.log('📊 Test Summary\n');

const tests = [
    { name: 'Test 1 - 301 Permanent', result: test1Result.redirectType === '301-permanent' && test1Result.redirectUrl === 'https://example.com/new-location' },
    { name: 'Test 2 - 302 Temporary', result: test2Result.redirectType === '302-temporary' && test2Result.redirectUrl === 'https://example.com/temporary' },
    { name: 'Test 3 - 307 Temporary', result: test3Result.redirectType === '307-temporary' && test3Result.redirectUrl === 'https://example.com/temp-preserve-method' },
    { name: 'Test 4 - 308 Permanent', result: test4Result.redirectType === '308-permanent' && test4Result.redirectUrl === 'https://example.com/perm-preserve-method' },
    { name: 'Test 5 - Meta Refresh', result: test5Result.redirectType === 'meta-refresh' && test5Result.redirectUrl === 'https://example.com/meta-redirect' },
    { name: 'Test 6 - JavaScript (window.location)', result: test6Result.redirectType === 'javascript' && test6Result.redirectUrl === 'https://example.com/js-redirect' },
    { name: 'Test 7 - JavaScript (location.href)', result: test7Result.redirectType === 'javascript' && test7Result.redirectUrl === 'https://example.com/js-href-redirect' },
    { name: 'Test 8 - No Redirect', result: test8Result.redirectType === undefined && test8Result.redirectUrl === undefined }
];

const passed = tests.filter(t => t.result).length;
const failed = tests.filter(t => !t.result).length;

tests.forEach(test => {
    console.log(`${test.result ? '✅' : '❌'} ${test.name}`);
});

console.log('\n' + '='.repeat(60));
console.log(`\n🎯 Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);

if (failed === 0) {
    console.log('🎉 All tests passed! Redirect detection is working correctly.\n');
} else {
    console.log('⚠️  Some tests failed. Please review the implementation.\n');
}
}

/**
 * Main execution
 */
async function main() {
    const testUrl = process.argv[2];

    if (testUrl) {
        // Test a specific website
        await testWebsite(testUrl);
    } else {
        // Run built-in tests
        runBuiltInTests();
    }
}

// Run main function
main().catch(console.error);

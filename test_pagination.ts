
import * as cheerio from 'cheerio';
import { extractPagination } from './src/modules/module_A/pageMetrics/paginationExtractor.js';

async function testPaginationExtraction() {
    console.log('Testing Pagination Extraction...');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="canonical" href="https://example.com/page/2" />
        <link rel="next" href="https://example.com/page/3" />
        <link rel="prev" href="https://example.com/page/1" />
    </head>
    <body>
        <h1>Test Page</h1>
    </body>
    </html>
    `;

    const $ = cheerio.load(html);
    const baseUrl = 'https://example.com/page/2';
    
    // Test HTML links
    console.log('--- HTML Link Tag Test ---');
    const resultHtml = extractPagination($, undefined, baseUrl);
    console.log('Result:', JSON.stringify(resultHtml, null, 2));

    // Test HTTP Headers provided via mock response object
    console.log('\n--- HTTP Header Test ---');
    const mockResponse = {
        statusCode: 200,
        headers: {
            'link': '<https://api.github.com/user/repos?page=3&per_page=100>; rel="next", <https://api.github.com/user/repos?page=50>; rel="last"'
        }
    };
    
    const resultHttp = extractPagination($, mockResponse as any, baseUrl);
    console.log('Result:', JSON.stringify(resultHttp, null, 2));
}

testPaginationExtraction();

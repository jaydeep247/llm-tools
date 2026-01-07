/**
 * Test script for Last-Modified header extraction
 * 
 * Run with: tsx test-last-modified.ts
 */

import { fetchLastModified, getLastModified } from './src/modules/module_A/pageMetrics/lastModifiedFetcher.js';

async function testLastModified() {
    console.log('🧪 Testing Last-Modified Header Extraction\n');
    
    // Test URLs - these are commonly available websites
    const testUrls = [
        'https://en.wikipedia.org/wiki/Search_engine_optimization'
    ];

    for (const url of testUrls) {
        console.log(`\n📍 Testing: ${url}`);
        console.log('─'.repeat(60));
        
        try {
            const lastModified = await fetchLastModified(url);
            
            if (lastModified) {
                console.log(`✅ Last-Modified: ${lastModified}`);
                const date = new Date(lastModified);
                console.log(`   Parsed Date: ${date.toLocaleString()}`);
            } else {
                console.log(`⚠️  Last-Modified header not available`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error}`);
        }
    }

    console.log('\n\n✨ Test completed!\n');
}

// Run the test
testLastModified().catch(console.error);

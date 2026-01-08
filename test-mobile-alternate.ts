/**
 * Test script for Mobile Alternate Link detection
 * 
 * This script tests the mobile alternate link extraction functionality
 * by fetching a webpage and detecting mobile-specific alternate URLs.
 * 
 * Usage:
 *   tsx test-mobile-alternate.ts <url>
 *   tsx test-mobile-alternate.ts https://example.com
 */

import { load } from 'cheerio';
import { extractMobileAlternate } from './src/modules/module_A/pageMetrics/mobileAlternateExtractor.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[90m'
};

async function fetchAndTestMobileAlternate(url: string) {
    console.log(`\n${colors.bright}${colors.blue}🔍 Mobile Alternate Link Detector${colors.reset}`);
    console.log(`${colors.gray}${'='.repeat(60)}${colors.reset}\n`);
    
    console.log(`${colors.cyan}Testing URL:${colors.reset} ${url}\n`);
    
    try {
        let html: string;
        
        // Handle local file URLs
        if (url.startsWith('file://')) {
            console.log(`${colors.gray}📁 Reading local file...${colors.reset}`);
            const filePath = fileURLToPath(url);
            html = readFileSync(filePath, 'utf-8');
            console.log(`${colors.green}✓ Successfully read file (${html.length.toLocaleString()} bytes)${colors.reset}\n`);
        } else {
            // Fetch the webpage
            console.log(`${colors.gray}⏳ Fetching webpage...${colors.reset}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            html = await response.text();
            console.log(`${colors.green}✓ Successfully fetched HTML (${html.length.toLocaleString()} bytes)${colors.reset}\n`);
        }
        
        // Parse with cheerio
        const $ = load(html);
        
        // Extract mobile alternate link
        console.log(`${colors.gray}🔎 Searching for mobile alternate links...${colors.reset}\n`);
        const mobileAlternateUrl = extractMobileAlternate($);
        
        // Display results
        console.log(`${colors.bright}${colors.blue}📱 Results:${colors.reset}`);
        console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`);
        
        if (mobileAlternateUrl) {
            console.log(`${colors.green}✓ Mobile Alternate URL Found!${colors.reset}`);
            console.log(`  ${colors.cyan}URL:${colors.reset} ${mobileAlternateUrl}\n`);
            
            // Additional analysis
            console.log(`${colors.bright}${colors.blue}📊 Analysis:${colors.reset}`);
            const isMSubdomain = mobileAlternateUrl.includes('://m.');
            const isMobilePath = mobileAlternateUrl.includes('/mobile');
            
            if (isMSubdomain) {
                console.log(`  ${colors.green}✓${colors.reset} Uses mobile subdomain (m.example.com)`);
            }
            if (isMobilePath) {
                console.log(`  ${colors.green}✓${colors.reset} Uses mobile path (/mobile)`);
            }
            
            console.log(`  ${colors.yellow}ℹ${colors.reset}  This site uses a separate mobile URL (legacy setup)`);
            console.log(`  ${colors.gray}   Modern sites typically use responsive design instead${colors.reset}`);
        } else {
            console.log(`${colors.yellow}⚠ No Mobile Alternate URL Found${colors.reset}`);
            console.log(`  ${colors.gray}This is normal for responsive websites.${colors.reset}`);
            console.log(`  ${colors.gray}Mobile alternate links are only used for separate mobile sites.${colors.reset}`);
        }
        
        // Show raw HTML links for debugging
        console.log(`\n${colors.bright}${colors.blue}🔧 Debug Information:${colors.reset}`);
        console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`);
        
        const allAlternateLinks = $('link[rel="alternate"]');
        console.log(`  Found ${allAlternateLinks.length} alternate link(s) total\n`);
        
        allAlternateLinks.each((i, el) => {
            const $el = $(el);
            const href = $el.attr('href');
            const media = $el.attr('media');
            const type = $el.attr('type');
            const hreflang = $el.attr('hreflang');
            
            console.log(`  ${colors.cyan}Link ${i + 1}:${colors.reset}`);
            if (href) console.log(`    href: ${href}`);
            if (media) console.log(`    media: ${colors.yellow}${media}${colors.reset}`);
            if (type) console.log(`    type: ${type}`);
            if (hreflang) console.log(`    hreflang: ${hreflang}`);
            console.log('');
        });
        
        // Show what our function looks for
        console.log(`${colors.bright}${colors.blue}📖 Detection Criteria:${colors.reset}`);
        console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`);
        console.log(`  The function searches for: <link rel="alternate" media="..." href="...">`);
        console.log(`  Where media attribute contains:`);
        console.log(`    - "max-width" (e.g., "only screen and (max-width: 640px)")`);
        console.log(`    - "handheld"`);
        console.log(`    - "mobile"`);
        
    } catch (error) {
        console.error(`\n${colors.red}❌ Error: ${error instanceof Error ? error.message : String(error)}${colors.reset}\n`);
        process.exit(1);
    }
    
    console.log(`\n${colors.gray}${'='.repeat(60)}${colors.reset}\n`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.log(`${colors.bright}${colors.blue}Mobile Alternate Link Detector${colors.reset}\n`);
    console.log(`${colors.yellow}Usage:${colors.reset}`);
    console.log(`  tsx test-mobile-alternate.ts <url>\n`);
    console.log(`${colors.cyan}Examples:${colors.reset}`);
    console.log(`  tsx test-mobile-alternate.ts https://www.example.com`);
    console.log(`  tsx test-mobile-alternate.ts https://www.wikipedia.org`);
    console.log(`  tsx test-mobile-alternate.ts https://m.facebook.com\n`);
    console.log(`${colors.gray}Note: Most modern websites use responsive design and won't have mobile alternate links.${colors.reset}`);
    console.log(`${colors.gray}      Sites like Facebook, LinkedIn, or older sites may still use separate mobile URLs.${colors.reset}\n`);
    process.exit(0);
}

const testUrl = args[0];

// Validate URL (allow file:// URLs)
if (!testUrl.startsWith('file://')) {
    try {
        new URL(testUrl);
    } catch {
        console.error(`${colors.red}❌ Invalid URL: ${testUrl}${colors.reset}\n`);
        console.log(`${colors.yellow}Please provide a valid URL starting with http://, https://, or file://${colors.reset}\n`);
        process.exit(1);
    }
}

// Run the test
fetchAndTestMobileAlternate(testUrl)
    .then(() => {
        console.log(`${colors.green}✓ Test completed successfully${colors.reset}\n`);
        process.exit(0);
    })
    .catch((error) => {
        console.error(`${colors.red}❌ Test failed: ${error}${colors.reset}\n`);
        process.exit(1);
    });

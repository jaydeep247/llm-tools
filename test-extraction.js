import { load } from 'cheerio';
import { extractTitle } from './src/modules/module_A/pageMetrics/titleExtractor.js';
import { extractMetaDescription } from './src/modules/module_A/pageMetrics/metaExtractor.js';

// Test HTML
const testHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Test Page Title - Example Website</title>
    <meta name="description" content="This is a test meta description for the example website. It should be between 120-160 characters for optimal SEO performance.">
</head>
<body>
    <h1>Welcome to Test Page</h1>
    <p>This is test content.</p>
</body>
</html>
`;

// Load HTML with Cheerio
const $ = load(testHtml);

// Test title extraction
console.log('=== Testing Title Extraction ===');
const titleData = extractTitle($);
console.log('Title:', titleData.title);
console.log('Title Length:', titleData.titleLength);
console.log('Title Pixel Width:', titleData.titlePixelWidth);
console.log('Has Missing Title:', titleData.hasMissingTitle);
console.log('');

// Test meta description extraction
console.log('=== Testing Meta Description Extraction ===');
const metaData = extractMetaDescription($);
console.log('Meta Description:', metaData.metaDescription);
console.log('Meta Description Length:', metaData.metaDescriptionLength);
console.log('Meta Description Pixel Width:', metaData.metaDescriptionPixelWidth);
console.log('Has Missing Meta Description:', metaData.hasMissingMetaDescription);
console.log('');

// Verify all fields are defined
console.log('=== Verification ===');
const allFieldsDefined = 
    titleData.titlePixelWidth !== undefined &&
    titleData.titlePixelWidth !== null &&
    metaData.metaDescriptionPixelWidth !== undefined &&
    metaData.metaDescriptionPixelWidth !== null;

if (allFieldsDefined) {
    console.log('✅ SUCCESS: All fields are properly calculated!');
    console.log(`   - Title Pixel Width: ${titleData.titlePixelWidth}px`);
    console.log(`   - Meta Description Pixel Width: ${metaData.metaDescriptionPixelWidth}px`);
} else {
    console.log('❌ FAILURE: Some fields are undefined or null');
    if (titleData.titlePixelWidth === undefined || titleData.titlePixelWidth === null) {
        console.log('   - Title Pixel Width is missing');
    }
    if (metaData.metaDescriptionPixelWidth === undefined || metaData.metaDescriptionPixelWidth === null) {
        console.log('   - Meta Description Pixel Width is missing');
    }
}

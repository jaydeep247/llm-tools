# Mobile Alternate Link Testing Guide

## Overview

This test script helps you verify the mobile alternate link detection functionality. It fetches any webpage and checks if it declares a mobile-specific alternate URL.

## What is Mobile Alternate Link?

Mobile alternate links are HTML elements that point to a mobile-specific version of a page:

```html
<link rel="alternate" media="only screen and (max-width: 640px)" href="https://m.example.com/page">
```

**Use Cases:**
- Separate mobile URLs (m.example.com)
- Legacy mobile setups
- Sites that haven't migrated to responsive design

**Not Required For:**
- Responsive websites (most modern sites)
- Sites that adapt to screen size using CSS

## Usage

### Quick Test

```bash
npm run test:mobile https://example.com
```

### Direct Usage

```bash
tsx test-mobile-alternate.ts https://example.com
```

### Docker Usage

```bash
docker-compose exec backend npm run test:mobile https://example.com
```

## Example Output

```
🔍 Mobile Alternate Link Detector
============================================================

Testing URL: https://example.com

⏳ Fetching webpage...
✓ Successfully fetched HTML (45,234 bytes)

🔎 Searching for mobile alternate links...

📱 Results:
────────────────────────────────────────────────────────────
✓ Mobile Alternate URL Found!
  URL: https://m.example.com/page

📊 Analysis:
  ✓ Uses mobile subdomain (m.example.com)
  ℹ  This site uses a separate mobile URL (legacy setup)
     Modern sites typically use responsive design instead

🔧 Debug Information:
────────────────────────────────────────────────────────────
  Found 2 alternate link(s) total

  Link 1:
    href: https://m.example.com/page
    media: only screen and (max-width: 640px)

  Link 2:
    href: https://example.com/page
    hreflang: en
```

## Testing Different Sites

### Sites Likely to Have Mobile Alternate Links

```bash
# Facebook (uses m.facebook.com)
npm run test:mobile https://www.facebook.com

# LinkedIn (uses m.linkedin.com)
npm run test:mobile https://www.linkedin.com

# Wikipedia (uses m.wikipedia.org)
npm run test:mobile https://en.wikipedia.org
```

### Sites WITHOUT Mobile Alternate Links (Responsive)

```bash
# Most modern sites use responsive design
npm run test:mobile https://github.com
npm run test:mobile https://twitter.com
npm run test:mobile https://stackoverflow.com
```

## Detection Criteria

The function looks for `<link rel="alternate">` tags where the `media` attribute contains:
- `max-width` (e.g., "only screen and (max-width: 640px)")
- `handheld`
- `mobile`

## Integration with Crawler

When running a full crawl, the mobile alternate URL is automatically:
1. **Extracted** - During page metrics extraction
2. **Stored** - In the `mobile_alternate_url` column
3. **Displayed** - In the DataViewer UI with 📱 icon

## Troubleshooting

### "Invalid URL" Error
- Ensure URL starts with `http://` or `https://`
- Example: `https://example.com` not `example.com`

### "HTTP 403/404" Error
- Some sites block automated requests
- Try a different website

### No Mobile Alternate Found
- This is **normal** for most modern websites
- Only legacy sites or sites with separate mobile domains use this feature

## API Reference

### Function: `extractMobileAlternate($)`

**Location**: `src/modules/module_A/pageMetrics/mobileAlternateExtractor.ts`

**Parameters**:
- `$` - Cheerio instance with loaded HTML

**Returns**:
- `string | undefined` - Mobile alternate URL if found, undefined otherwise

**Example**:
```typescript
import { load } from 'cheerio';
import { extractMobileAlternate } from './src/modules/module_A/pageMetrics/mobileAlternateExtractor.js';

const html = '<link rel="alternate" media="only screen and (max-width: 640px)" href="https://m.example.com">';
const $ = load(html);
const mobileUrl = extractMobileAlternate($);
console.log(mobileUrl); // "https://m.example.com"
```

## Related Documentation

- [Docker Setup Guide](DOCKER_SETUP.md)
- [Database Migrations](src/database/migrations/README.md)
- [Main README](README.md)

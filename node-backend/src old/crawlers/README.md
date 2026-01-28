# Crawlers Module Architecture

## Overview

The `crawlers/` folder contains the modularized web crawler implementation. All business logic has been extracted from the monolithic `crawler.ts` file and organized into focused, single-responsibility modules.

**Old Architecture:** `crawler.ts` (850 lines, monolithic)  
**New Architecture:** `crawler.ts` (438 lines, orchestration only) + 9 modular files

## Directory Structure

```
crawlers/
├── types/
│   └── index.ts              # Shared type definitions (CrawlOptions, CrawlEvents)
├── modules/
│   ├── module_A/             # Audit management and link analysis
│   │   ├── auditManager.ts    # Audit execution, batching, progress tracking
│   │   ├── linkAnalyzer.ts    # Link relationship analysis and scoring
│   │   └── index.ts           # Module exports
│   ├── module_B/             # SEO queue management
│   │   ├── seoQueue.ts        # SEO queue initialization and page enqueuing
│   │   └── index.ts           # Module exports
│   ├── module_D/             # Sitemap discovery and carbon footprint
│   │   ├── sitemapManager.ts  # Sitemap discovery and URL management
│   │   ├── carbonCalculator.ts # Carbon footprint calculation
│   │   └── index.ts           # Module exports
│   └── index.ts              # Aggregates all module exports
└── README.md                 # This file
```

## Module Responsibilities

### `module_A/` - Audit & Link Management

**Purpose:** Handles crawl audits, link analysis, and post-processing

**Files:**
- **auditManager.ts** (170 lines)
  - `cancelAudits()`: Cancel active audit operations
  - `resetAuditCancellation()`: Reset cancellation flag
  - `runAuditProcessing()`: Execute audits after crawl completes
  - Manages audit batching and progress tracking

- **linkAnalyzer.ts** (92 lines)
  - `runLinkAnalysis()`: Analyze links across crawled pages
  - `calculateLinkScores()`: Score links based on relationship metrics
  - `calculateDuplicateMetrics()`: Detect and score duplicate content
  - Uses PostLinkProcessor for detailed analysis

**Imports from:** Core crawler for orchestration

**Exports to:** crawler.ts for post-crawl processing

---

### `module_B/` - SEO Queue Management

**Purpose:** Manages SEO analysis queue for crawled pages

**Files:**
- **seoQueue.ts** (38 lines)
  - `initializeSeoQueue()`: Initialize SEO queue for session
  - `enqueueSeoIfEligible()`: Queue pages for SEO analysis
  - Wrapper around redis-queue service

**Imports from:** redis-queue service

**Exports to:** crawler.ts for queue initialization

---

### `module_D/` - Sitemap & Carbon Metrics

**Purpose:** Manages sitemap discovery and environmental impact calculation

**Files:**
- **sitemapManager.ts** (76 lines)
  - `discoverAndLoadSitemaps()`: Discover and load sitemap URLs
  - `markSitemapUrlAsCrawled()`: Track crawled sitemap URLs
  - Uses SitemapService for discovery logic

- **carbonCalculator.ts** (60 lines)
  - `calculatePageCarbonFootprint()`: Calculate carbon footprint per page
  - Factors: page size, resources, data transfer metrics

**Imports from:** SitemapService, carbon calculation utilities

**Exports to:** crawler.ts for initialization and per-page processing

---

### `types/` - Shared Type Definitions

**Files:**
- **index.ts**
  - `CrawlOptions`: Configuration for crawl session
  - `CrawlEvents`: Event callbacks for progress tracking
  - Used across all modules for type safety

---

## Core Crawler Integration

The main [crawler.ts](../crawler.ts) file orchestrates the entire process:

1. **Initialization** → Sets up session, validates URL
2. **Module Init** → Calls `initializeSeoQueue()` and `discoverAndLoadSitemaps()`
3. **CheerioCrawler Loop** → Per-page processing with callbacks
4. **Post-Processing** → Calls `runLinkAnalysis()`, `calculateLinkScores()`, `calculateDuplicateMetrics()`
5. **Finalization** → Updates session status, runs optional audits
6. **Cleanup** → Drops request queue

## Data Flow

```
crawler.ts (main orchestration)
├─→ module_B: Init SEO queue
├─→ module_D: Discover sitemaps
├─→ Per-page loop:
│   ├─→ Extract metrics (helpers/modules/module_A)
│   ├─→ Collect resources
│   ├─→ Enqueue links
│   └─→ module_D: Calculate carbon footprint
└─→ Post-processing:
    ├─→ module_A: Run link analysis
    ├─→ module_A: Calculate link scores
    ├─→ module_A: Detect duplicates
    └─→ module_A: Run audits (if enabled)
```

## Import Paths

All modules maintain consistent import paths:

```typescript
// From module files to shared dependencies
import { Logger } from '../../../helpers/logging/Logger.js';
import { getDatabase } from '../../../services/DatabaseService.js';

// From module files to other modules
import type { CrawlEvents } from '../../types/index.js';

// From crawler.ts to modules
import { runAuditProcessing, runLinkAnalysis } from './crawlers/modules/module_A/index.js';
import { initializeSeoQueue, enqueueSeoIfEligible } from './crawlers/modules/module_B/index.js';
import { discoverAndLoadSitemaps, markSitemapUrlAsCrawled, calculatePageCarbonFootprint } from './crawlers/modules/module_D/index.js';
```

## Benefits of This Architecture

✅ **Separation of Concerns:** Each module has single, clear responsibility  
✅ **Maintainability:** Logic is organized by feature, easier to locate and modify  
✅ **Testability:** Individual modules can be tested independently  
✅ **Scalability:** New features can be added in new modules without touching core crawler  
✅ **Reduced Complexity:** Main crawler.ts is now 51% smaller (850 → 438 lines)  
✅ **Type Safety:** Shared types ensure consistency across modules  
✅ **Clean Exports:** Each module exports only public functions  

## Build & Compilation

All modules compile to `dist/crawlers/` during build:

```bash
npm run build
```

TypeScript compilation output:
- `dist/crawlers/types/index.js`
- `dist/crawlers/modules/module_A/{auditManager,linkAnalyzer,index}.js`
- `dist/crawlers/modules/module_B/{seoQueue,index}.js`
- `dist/crawlers/modules/module_D/{sitemapManager,carbonCalculator,index}.js`
- `dist/crawlers/modules/index.js`

## Adding New Features

To add a new crawler feature:

1. Determine which module it belongs to (A, B, D, or E)
2. Create new file in that module: `crawlers/modules/module_X/featureName.ts`
3. Implement feature and export public functions
4. Add export to `crawlers/modules/module_X/index.ts`
5. Update `crawler.ts` to call new feature at appropriate lifecycle point
6. Run `npm run build` and test

## Configuration & Dependencies

- **Crawlee:** Core crawler library (CheerioCrawler)
- **Database:** PostgreSQL for storing crawl data
- **Redis:** For SEO queue management
- **Logging:** Custom Logger service for consistent logging
- **Services:** Specialized services in `src/services/` directory

## Status

✅ **Refactoring Complete**  
✅ **TypeScript Build:** 0 errors  
✅ **Backend:** Running and initialized  
✅ **All imports:** Verified and working  

---

**Last Updated:** January 16, 2026  
**Version:** 1.0 (Refactored)

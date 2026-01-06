# Database Migrations

## Overview

This project uses a self-contained migration system. All database migrations are defined directly in the migration script, eliminating the need for separate SQL migration files.

## Running Migrations

To run all migrations and add all fields to the database:

```bash
npm run db:migrate
```

Or directly:

```bash
tsx src/database/scripts/runAllMigrations.ts
```

## What Gets Created

The migration script will add the following columns and indexes to your database:

### Pages Table Columns:
- `link_score` - SEO link score for pages (NUMERIC)
- `canonical_url` - Canonical URL for duplicate content prevention (TEXT)
- `amphtml_url` - AMP HTML version URL (TEXT)
- `indexable` - Whether page is indexable (BOOLEAN)
- `indexability_status` - Detailed indexability status (VARCHAR)
- `meta_robots` - Meta robots tag content (TEXT)
- `x_robots_tag` - X-Robots-Tag HTTP header (TEXT)
- `meta_refresh` - Meta refresh tag content (TEXT)
- `transferred_bytes` - Data transferred for page (BIGINT)
- `total_transferred_bytes` - Total data transferred (BIGINT)
- `co2_mg` - Carbon footprint in mg (DECIMAL)
- `carbon_rating` - Carbon rating grade (VARCHAR)
- `rel_next` - HTML pagination next link (TEXT)
- `rel_prev` - HTML pagination prev link (TEXT)
- `http_rel_next` - HTTP header pagination next (TEXT)
- `http_rel_prev` - HTTP header pagination prev (TEXT)
- `text_to_html_ratio` - Text to HTML size ratio (NUMERIC)
- `title_pixel_width` - Title display width in pixels (INTEGER)
- `description_pixel_width` - Description display width in pixels (INTEGER)
- `flesch_reading_ease_score` - Readability score (NUMERIC)
- `readability_level` - Human-readable readability level (TEXT)
- `meta_keywords` - Meta keywords tag content (TEXT)
- `meta_keywords_length` - Length of meta keywords (INTEGER)
- `heading_tags` - JSON of heading tag counts (TEXT)
- `crawl_depth` - Clicks from homepage (INTEGER)
- `folder_depth` - URL folder depth (INTEGER)
- `average_words_per_sentence` - Avg words per sentence (NUMERIC)
- `sentence_count` - Total sentence count (INTEGER)
- `size_bytes` - Page size in bytes (INTEGER)
- `unique_outlinks` - Count of unique distinct destination URLs this page links to (INTEGER)

### Links Table Columns:
- `is_js_rendered` - Whether link was JavaScript-rendered (BOOLEAN)

## Features

- ✅ **Idempotent**: Safe to run multiple times
- ✅ **Error Handling**: Skips already-existing columns gracefully
- ✅ **Comprehensive Logging**: Detailed status for each migration
- ✅ **Summary Report**: Shows success/skip/fail counts
- ✅ **Verification**: Validates database structure after migrations

## Migration Definition

All migrations are defined in: [`src/database/scripts/runAllMigrations.ts`](../scripts/runAllMigrations.ts)

To add a new migration, simply add a new object to the `migrations` array in that file.

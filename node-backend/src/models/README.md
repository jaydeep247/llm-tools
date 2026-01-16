# Database Initialization System

## Overview

The database initialization system automatically creates and migrates all required database tables and columns when the backend server starts. This ensures the application always has the correct database schema without manual intervention.

## Features

✅ **Automatic Initialization**: Database tables are created automatically on server startup  
✅ **Safe to Run Multiple Times**: Checks for existing tables/columns before creating  
✅ **Migration Support**: Automatically adds new columns and indexes  
✅ **Zero Downtime**: Can run on existing databases without data loss  
✅ **Error Handling**: Continues with other tables even if one fails  

## How It Works

### Automatic Startup Initialization

When the backend server starts, it automatically:

1. Tests the database connection
2. Creates all base tables (if they don't exist)
3. Runs migrations to add new columns
4. Creates performance indexes
5. Logs all actions for debugging

**You don't need to do anything manually!** Just start the server and the database will be initialized.

### Tables Created

The initializer creates the following tables:

- **users** - User accounts and authentication
- **crawl_sessions** - Web crawling sessions
- **pages** - Crawled pages and content
- **links** - Links between pages
- **audit_results** - Performance audit results
- **aeo_results** - AEO analysis results
- **aeo_module_c_metrics** - Module C metrics

### Migrations Applied

The initializer also adds these columns if they're missing:

#### AEO Tables
- `score_consistency`
- `score_entity_coverage`
- `entities_expected`, `entities_observed`, `entities_missing`
- `brand_metrics`

#### Crawler Tables
- `link_score` (pages)
- `is_js_rendered` (links)
- `canonical_url` (pages)
- `meta_description`, `og_title`, `og_description`, `og_image` (pages)
- `max_depth`, `max_pages`, `respect_robots_txt`, etc. (crawl_sessions)

#### Audit Tables
- `fcp`, `ttfb`, `fid`
- `device_type`

## Manual Commands

While automatic initialization runs on startup, you can also run these commands manually:

```bash
# Initialize all tables and run migrations
npm run db:init

# Run crawler-specific migrations
npm run db:migrate
```

## Database Connection

The system uses environment variables for database connection:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=contentlytics
```

## Logs

Database initialization logs are visible during server startup:

```
🚀 Starting Database Initialization...
✅ Database connection successful
📋 Creating 6 base table groups...
✓ Users tables already exist, skipping
✓ Crawls tables already exist, skipping
✅ AEO Results tables created
📋 Running database migrations...
✓ AEO columns migration complete
✓ Crawler columns migration complete
✓ Audit columns migration complete
✓ Database indexes migration complete
✅ Migrations complete: 4 successful, 0 failed
✨ Database initialization complete in 245ms
```

## Troubleshooting

### Database Connection Failed

**Error**: "Cannot connect to database"

**Solution**: Check your database environment variables and ensure PostgreSQL is running.

### Column Already Exists Error

This is **normal** and expected. The system checks for existing columns and will log warnings but continue initialization.

### Migration Failed

Check the logs for specific error messages. The initializer will continue with other migrations even if one fails.

## Architecture

### DatabaseInitializer Class

Located at: `src/config/DatabaseInitializer.ts`

This singleton class handles all database initialization:

```typescript
import { databaseInitializer } from './database/DatabaseInitializer.js';

// Initialize on server startup
await databaseInitializer.initialize();
```

### Schema Files

Table schemas are defined in `src/models/tables/`:

- `userSchema.ts`
- `crawlSchema.ts`
- `pageSchema.ts`
- `auditSchema.ts`
- `aeoSchema.ts`
- `aeoMetricsSchema.ts`

## Development

When adding new tables or columns:

1. Add the schema to the appropriate schema file
2. Update `DatabaseInitializer.ts` if adding a new table group
3. Add migrations in the appropriate migration method
4. The changes will be applied automatically on next server start

## Production Deployment

The database initialization system is production-ready:

- ✅ Safe to run on existing databases
- ✅ No data loss
- ✅ Idempotent (can run multiple times safely)
- ✅ Fast initialization (typically < 500ms)
- ✅ Comprehensive error handling

**No manual database setup required!** Just deploy and start the server.

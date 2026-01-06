import { getPool } from '../dbConnection.js';
import { Logger } from '../../logging/Logger.js';

const logger = Logger.getInstance();

interface MigrationResult {
    name: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
}

// Define all migrations inline
const migrations = [
    {
        name: '001_add_link_score',
        sql: `
-- Migration: Add link_score to pages table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pages' AND column_name = 'link_score'
    ) THEN
        ALTER TABLE pages ADD COLUMN link_score NUMERIC(5,2) DEFAULT NULL;
        RAISE NOTICE 'Added link_score column to pages table';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pages_link_score ON pages (link_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pages_session_link_score ON pages (session_id, link_score DESC NULLS LAST);
`
    },
    {
        name: '002_add_js_rendered_column',
        sql: `
-- Migration: Add is_js_rendered column to links table
ALTER TABLE links ADD COLUMN IF NOT EXISTS is_js_rendered BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_links_js_rendered ON links (is_js_rendered) WHERE is_js_rendered = TRUE;
COMMENT ON COLUMN links.is_js_rendered IS 'TRUE if link was added after JS execution, FALSE if present in raw HTML';
`
    },
    {
        name: '003_add_canonical_url',
        sql: `
-- Add canonical_url column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS canonical_url TEXT;
CREATE INDEX IF NOT EXISTS idx_pages_canonical_url ON pages(canonical_url);
`
    },
    {
        name: '004_add_amphtml_url',
        sql: `
-- Add amphtml_url column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS amphtml_url TEXT;
`
    },
    {
        name: '005_add_indexability_columns',
        sql: `
-- Add indexability columns to pages table
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS indexable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS indexability_status VARCHAR(100) DEFAULT 'indexable';

CREATE INDEX IF NOT EXISTS idx_pages_indexable ON pages(indexable);
CREATE INDEX IF NOT EXISTS idx_pages_indexability_status ON pages(indexability_status);
`
    },
    {
        name: '006_add_meta_robots',
        sql: `
-- Add meta robots column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_robots TEXT;
CREATE INDEX IF NOT EXISTS idx_pages_meta_robots ON pages(meta_robots);
`
    },
    {
        name: '007_add_x_robots_tag',
        sql: `
-- Add X-Robots-Tag column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS x_robots_tag TEXT;
CREATE INDEX IF NOT EXISTS idx_pages_x_robots_tag ON pages(x_robots_tag);
`
    },
    {
        name: '008_add_meta_refresh',
        sql: `
-- Add meta_refresh column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_refresh TEXT;
CREATE INDEX IF NOT EXISTS idx_pages_meta_refresh ON pages(meta_refresh);
`
    },
    {
        name: '009_add_carbon_columns',
        sql: `
-- Add carbon footprint columns to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS transferred_bytes BIGINT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS total_transferred_bytes BIGINT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS co2_mg DECIMAL(10, 4);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS carbon_rating VARCHAR(5);
`
    },
    {
        name: '010_add_pagination_links',
        sql: `
-- Add pagination link columns to pages table
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS rel_next TEXT,
ADD COLUMN IF NOT EXISTS rel_prev TEXT,
ADD COLUMN IF NOT EXISTS http_rel_next TEXT,
ADD COLUMN IF NOT EXISTS http_rel_prev TEXT;

CREATE INDEX IF NOT EXISTS idx_pages_rel_next ON pages(rel_next);
CREATE INDEX IF NOT EXISTS idx_pages_rel_prev ON pages(rel_prev);
CREATE INDEX IF NOT EXISTS idx_pages_http_rel_next ON pages(http_rel_next);
CREATE INDEX IF NOT EXISTS idx_pages_http_rel_prev ON pages(http_rel_prev);
`
    },
    {
        name: '011_add_text_to_html_ratio',
        sql: `
-- Add text_to_html_ratio column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS text_to_html_ratio NUMERIC(5, 2) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_pages_text_to_html_ratio ON pages(text_to_html_ratio);
`
    },
    {
        name: '012_add_title_pixel_width',
        sql: `
-- Add title_pixel_width column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS title_pixel_width INTEGER;
CREATE INDEX IF NOT EXISTS idx_pages_title_pixel_width ON pages(title_pixel_width);
`
    },
    {
        name: '013_add_description_pixel_width',
        sql: `
-- Add description_pixel_width column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS description_pixel_width INTEGER;
CREATE INDEX IF NOT EXISTS idx_pages_description_pixel_width ON pages(description_pixel_width);
`
    },
    {
        name: '014_add_flesch_reading_ease_score',
        sql: `
-- Add flesch_reading_ease_score column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS flesch_reading_ease_score NUMERIC(5, 2) DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_pages_flesch_reading_ease_score ON pages(flesch_reading_ease_score);
`
    },
    {
        name: '015_add_readability_level',
        sql: `
-- Add readability_level column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS readability_level TEXT;
CREATE INDEX IF NOT EXISTS idx_pages_readability_level ON pages(readability_level);
`
    },
    {
        name: '016_add_meta_keywords_columns',
        sql: `
-- Add meta keywords and heading tags columns to pages table
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS meta_keywords TEXT,
ADD COLUMN IF NOT EXISTS meta_keywords_length INTEGER,
ADD COLUMN IF NOT EXISTS heading_tags TEXT;

CREATE INDEX IF NOT EXISTS idx_pages_meta_keywords_length ON pages(meta_keywords_length);
CREATE INDEX IF NOT EXISTS idx_pages_heading_tags ON pages USING gin(to_tsvector('english', heading_tags));
`
    },
    {
        name: '017_add_crawl_depth_and_folder_depth',
        sql: `
-- Add crawl_depth and folder_depth columns to pages table
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS folder_depth INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pages_crawl_depth ON pages(crawl_depth);
CREATE INDEX IF NOT EXISTS idx_pages_folder_depth ON pages(folder_depth);
`
    },
    {
        name: '018_add_average_words_per_sentence',
        sql: `
-- Add average_words_per_sentence column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS average_words_per_sentence NUMERIC(10, 2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pages_average_words_per_sentence ON pages(average_words_per_sentence);
`
    },
    {
        name: '019_add_sentence_count',
        sql: `
-- Add sentence_count column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS sentence_count INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pages_sentence_count ON pages(sentence_count);
`
    },
    {
        name: '020_add_size_bytes',
        sql: `
-- Add size_bytes column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
CREATE INDEX IF NOT EXISTS idx_pages_size_bytes ON pages(size_bytes);
`
    },
    {
        name: '021_add_unique_outlinks',
        sql: `
-- Add unique_outlinks column to pages table
-- Unique Outlinks: Number of distinct destination URLs this page links to
ALTER TABLE pages ADD COLUMN IF NOT EXISTS unique_outlinks INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pages_unique_outlinks ON pages(unique_outlinks);
`
    },
    {
        name: '022_add_unique_js_outlinks',
        sql: `
-- Add unique_js_outlinks column to pages table
-- Unique JS Outlinks: Number of distinct destination URLs that are JavaScript-rendered only (not in raw HTML)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS unique_js_outlinks INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pages_unique_js_outlinks ON pages(unique_js_outlinks);
COMMENT ON COLUMN pages.unique_js_outlinks IS 'Number of unique outbound links created using JavaScript, not present in raw HTML';
`
    },
    {
        name: '023_add_unique_external_outlinks',
        sql: `
-- Add unique_external_outlinks column to pages table
-- Unique External Outlinks: Number of distinct external links (to other domains) on this page
ALTER TABLE pages ADD COLUMN IF NOT EXISTS unique_external_outlinks INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pages_unique_external_outlinks ON pages(unique_external_outlinks);
COMMENT ON COLUMN pages.unique_external_outlinks IS 'Number of distinct external domain links on this page';
`
    },
    {
        name: '024_add_unique_external_js_outlinks',
        sql: `
-- Add unique_external_js_outlinks column to pages table
-- Unique External JS Outlinks: Number of unique external links created/revealed via JavaScript
ALTER TABLE pages ADD COLUMN IF NOT EXISTS unique_external_js_outlinks INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_pages_unique_external_js_outlinks ON pages(unique_external_js_outlinks);
COMMENT ON COLUMN pages.unique_external_js_outlinks IS 'Number of unique external links created or revealed using JavaScript, not visible in raw HTML';
`
    },
    {
        name: '025_create_content_fingerprints_table',
        sql: `
-- Create content_fingerprints table for near-duplicate detection
CREATE TABLE IF NOT EXISTS content_fingerprints (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    simhash TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(page_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_content_fingerprints_session ON content_fingerprints(session_id);
CREATE INDEX IF NOT EXISTS idx_content_fingerprints_page ON content_fingerprints(page_id);
CREATE INDEX IF NOT EXISTS idx_content_fingerprints_simhash ON content_fingerprints(simhash);
CREATE INDEX IF NOT EXISTS idx_content_fingerprints_hash ON content_fingerprints(content_hash);

COMMENT ON TABLE content_fingerprints IS 'Stores content fingerprints (SimHash) for near-duplicate detection';
`
    },
    {
        name: '026_create_similarity_index_table',
        sql: `
-- Create similarity_index table for storing page similarity scores
CREATE TABLE IF NOT EXISTS similarity_index (
    id SERIAL PRIMARY KEY,
    source_page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    target_page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    similarity_score NUMERIC(5,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_page_id, target_page_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_similarity_source ON similarity_index(source_page_id, similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_similarity_target ON similarity_index(target_page_id);
CREATE INDEX IF NOT EXISTS idx_similarity_session ON similarity_index(session_id);
CREATE INDEX IF NOT EXISTS idx_similarity_score ON similarity_index(similarity_score DESC);

COMMENT ON TABLE similarity_index IS 'Stores calculated similarity scores between pages for near-duplicate detection';
`
    },
    {
        name: '027_add_near_duplicate_columns',
        sql: `
-- Add near-duplicate related columns to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS closest_duplicate_url TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS closest_duplicate_similarity NUMERIC(5,4);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS near_duplicate_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_pages_near_duplicate_count ON pages(near_duplicate_count DESC);
CREATE INDEX IF NOT EXISTS idx_pages_closest_duplicate_similarity ON pages(closest_duplicate_similarity DESC);

COMMENT ON COLUMN pages.closest_duplicate_url IS 'URL of the most similar page (closest near-duplicate match)';
COMMENT ON COLUMN pages.closest_duplicate_similarity IS 'Similarity score (0.0-1.0) with the closest match';
COMMENT ON COLUMN pages.near_duplicate_count IS 'Number of pages with similarity >= 0.75 (near-duplicate threshold)';
`
    }
];

async function runAllMigrations() {
    const pool = getPool();
    const results: MigrationResult[] = [];
    
    try {
        logger.info('🚀 Starting all database migrations...');
        logger.info(`Found ${migrations.length} migrations to execute`);
        
        // Run each migration
        for (const migration of migrations) {
            try {
                logger.info(`\n📝 Running migration: ${migration.name}`);
                
                // Execute migration
                await pool.query(migration.sql);
                
                logger.info(`✅ Successfully executed: ${migration.name}`);
                results.push({
                    name: migration.name,
                    status: 'success'
                });
                
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                // Check if error is due to column/constraint already existing
                if (errorMessage.includes('already exists') || 
                    errorMessage.includes('duplicate')) {
                    logger.warn(`⚠️  Skipped (already exists): ${migration.name}`);
                    results.push({
                        name: migration.name,
                        status: 'skipped',
                        error: errorMessage
                    });
                } else {
                    logger.error(`❌ Failed to execute: ${migration.name}`, error as Error);
                    results.push({
                        name: migration.name,
                        status: 'failed',
                        error: errorMessage
                    });
                }
            }
        }
        
        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MIGRATION SUMMARY');
        console.log('='.repeat(60));
        
        const successful = results.filter(r => r.status === 'success').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        const failed = results.filter(r => r.status === 'failed').length;
        
        console.log(`✅ Successful: ${successful}`);
        console.log(`⚠️  Skipped: ${skipped}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📝 Total: ${results.length}`);
        console.log('='.repeat(60));
        
        // Show detailed results
        console.log('\n📋 Detailed Results:');
        results.forEach((result, index) => {
            const icon = result.status === 'success' ? '✅' : 
                        result.status === 'skipped' ? '⚠️' : '❌';
            console.log(`${index + 1}. ${icon} ${result.name} - ${result.status.toUpperCase()}`);
            if (result.error) {
                console.log(`   Error: ${result.error.substring(0, 100)}...`);
            }
        });
        
        // Verify migrations - check pages table structure
        console.log('\n🔍 Verifying pages table structure...');
        const columnsResult = await pool.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns 
            WHERE table_name = 'pages'
            ORDER BY ordinal_position
        `);
        
        console.log(`\n📊 Total columns in pages table: ${columnsResult.rows.length}`);
        console.log('\nColumns added by migrations:');
        columnsResult.rows.forEach(row => {
            console.log(`  - ${row.column_name} (${row.data_type})${row.is_nullable === 'YES' ? ' NULL' : ' NOT NULL'}`);
        });
        
        // Check indexes
        const indexesResult = await pool.query(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'pages'
            ORDER BY indexname
        `);
        
        console.log(`\n📇 Total indexes on pages table: ${indexesResult.rows.length}`);
        
        if (failed > 0) {
            logger.error(`\n⚠️  ${failed} migration(s) failed. Please review errors above.`);
            process.exit(1);
        } else {
            logger.info('\n🎉 All migrations completed successfully!');
        }
        
    } catch (error) {
        logger.error('Failed to run migrations', error as Error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run migrations
runAllMigrations()
    .then(() => {
        console.log('\n✨ Migration process completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Migration process failed:', error);
        process.exit(1);
    });

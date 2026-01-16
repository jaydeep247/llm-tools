/**
 * Crawler Table Migrations
 * Auto-runs on server startup to ensure all database columns exist
 */

import { getPool } from './dbConnection.js';
import { Logger } from '../helpers/logging/Logger.js';

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
        name: '032_add_semantic_analysis_fields',
        sql: `
-- Migration: Add semantic analysis fields to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS closest_semantically_similar_address TEXT;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS semantic_similarity_score NUMERIC(3,2);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS no_semantically_similar INTEGER DEFAULT 0;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS semantic_relevance_score NUMERIC(3,2);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_pages_closest_semantically_similar_address ON pages(closest_semantically_similar_address);
CREATE INDEX IF NOT EXISTS idx_pages_semantic_similarity_score ON pages(semantic_similarity_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pages_no_semantically_similar ON pages(no_semantically_similar DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pages_semantic_relevance_score ON pages(semantic_relevance_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pages_session_semantic_similarity ON pages(session_id, semantic_similarity_score DESC NULLS LAST);

-- Add comments for documentation
COMMENT ON COLUMN pages.closest_semantically_similar_address IS 'The URL of the closest semantically similar page within the same session';
COMMENT ON COLUMN pages.semantic_similarity_score IS 'Semantic similarity score (0.0-1.0) with the closest match';
COMMENT ON COLUMN pages.no_semantically_similar IS 'Count of pages with semantic similarity >= 0.30 threshold';
COMMENT ON COLUMN pages.semantic_relevance_score IS 'Semantic relevance score (0.0-1.0) to the intended topic';
`
    },
    {
        name: '033_add_url_encoded_address',
        sql: `
ALTER TABLE pages ADD COLUMN IF NOT EXISTS url_encoded_address TEXT;
CREATE INDEX IF NOT EXISTS idx_pages_url_encoded_address ON pages(url_encoded_address);
COMMENT ON COLUMN pages.url_encoded_address IS 'The percent-encoded (URL-safe) version of the page URL where special characters are converted to %XX format';
`
    },
    {
        name: '034_add_content_hash',
        sql: `
-- Migration: Add content hash field for change detection and duplicate identification
ALTER TABLE pages ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_pages_content_hash ON pages(content_hash);
CREATE INDEX IF NOT EXISTS idx_pages_session_content_hash ON pages(session_id, content_hash);
COMMENT ON COLUMN pages.content_hash IS 'SHA-256 hash of normalized page content (visible text). Used for exact change detection and duplicate identification.';
`
    }
];

export async function runCrawlerTableMigrations() {
    const pool = getPool();
    const results: MigrationResult[] = [];
    
    try {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 Running Crawler Table Migrations');
        console.log('='.repeat(60));
        
        for (const migration of migrations) {
            try {
                await pool.query(migration.sql);
                results.push({ name: migration.name, status: 'success' });
                console.log(`✅ ${migration.name} - Success`);
            } catch (error: any) {
                // Check if column already exists - that's not an error
                if (error.message?.includes('already exists')) {
                    results.push({ name: migration.name, status: 'skipped' });
                    console.log(`⚠️  ${migration.name} - Skipped (already exists)`);
                } else {
                    results.push({ 
                        name: migration.name, 
                        status: 'failed', 
                        error: error.message || 'Unknown error'
                    });
                    console.log(`❌ ${migration.name} - Failed: ${error.message}`);
                }
            }
        }
        
        // Summary
        const successful = results.filter(r => r.status === 'success').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        const failed = results.filter(r => r.status === 'failed').length;
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 Migration Summary');
        console.log('='.repeat(60));
        
        console.log(`✅ Successful: ${successful}`);
        console.log(`⚠️  Skipped: ${skipped}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📝 Total: ${results.length}`);
        console.log('='.repeat(60) + '\n');
        
        if (failed > 0) {
            logger.warn(`⚠️  ${failed} migration(s) had issues. Check logs above.`);
        } else {
            logger.info('✅ All crawler table migrations completed successfully!');
        }
        
    } catch (error) {
        logger.error('Failed to run migrations', error as Error);
        throw error;
    }
}

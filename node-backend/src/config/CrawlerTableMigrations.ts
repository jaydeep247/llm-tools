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
    },
    {
        name: '035_create_page_metrics_table',
        sql: `
-- Migration: Create page_metrics table for storing page analysis metrics
CREATE TABLE IF NOT EXISTS page_metrics (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    title_status VARCHAR(20) DEFAULT NULL,
    duplicate_title_count INTEGER DEFAULT NULL,
    duplicate_with TEXT DEFAULT NULL,
    meta_description_status VARCHAR(20) DEFAULT NULL,
    duplicate_meta_description_count INTEGER DEFAULT NULL,
    duplicate_meta_description_with TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(page_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_page_metrics_page_id ON page_metrics (page_id);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_id ON page_metrics (session_id);
CREATE INDEX IF NOT EXISTS idx_page_metrics_title_status ON page_metrics (title_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_title_status ON page_metrics (session_id, title_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_duplicate_title_count ON page_metrics (duplicate_title_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_page_metrics_meta_description_status ON page_metrics (meta_description_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_meta_description_status ON page_metrics (session_id, meta_description_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_duplicate_meta_description_count ON page_metrics (duplicate_meta_description_count DESC NULLS LAST);
COMMENT ON TABLE page_metrics IS 'Stores additional metrics and analysis results for crawled pages, including title and meta description detection and duplicate analysis';
`
    },
    {
        name: '036_add_meta_description_fields_to_page_metrics',
        sql: `
-- Migration: Add meta description detection fields to existing page_metrics table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'page_metrics' AND column_name = 'meta_description_status'
    ) THEN
        ALTER TABLE page_metrics 
        ADD COLUMN meta_description_status VARCHAR(20) DEFAULT NULL,
        ADD COLUMN duplicate_meta_description_count INTEGER DEFAULT NULL,
        ADD COLUMN duplicate_meta_description_with TEXT DEFAULT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_page_metrics_meta_description_status ON page_metrics (meta_description_status);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_session_meta_description_status ON page_metrics (session_id, meta_description_status);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_duplicate_meta_description_count ON page_metrics (duplicate_meta_description_count DESC NULLS LAST);
    END IF;
END $$;
`
    },
    {
        name: '037_add_canonical_validation_fields_to_page_metrics',
        sql: `
-- Migration: Add canonical validation fields to existing page_metrics table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'page_metrics' AND column_name = 'canonical_url'
    ) THEN
        ALTER TABLE page_metrics 
        ADD COLUMN canonical_url TEXT DEFAULT NULL,
        ADD COLUMN canonical_validation_status VARCHAR(20) DEFAULT NULL,
        ADD COLUMN canonical_validation_message TEXT DEFAULT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_page_metrics_canonical_validation_status ON page_metrics (canonical_validation_status);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_session_canonical_status ON page_metrics (session_id, canonical_validation_status);
    END IF;
END $$;
`
    },
    {
        name: '038_add_table_extraction_fields_to_page_metrics',
        sql: `
-- Migration: Add table extraction fields to existing page_metrics table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'page_metrics' AND column_name = 'table_count'
    ) THEN
        ALTER TABLE page_metrics 
        ADD COLUMN table_count INTEGER DEFAULT NULL,
        ADD COLUMN table_data TEXT DEFAULT NULL,
        ADD COLUMN has_tables BOOLEAN DEFAULT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_page_metrics_has_tables ON page_metrics (has_tables);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_session_has_tables ON page_metrics (session_id, has_tables);
        
        COMMENT ON COLUMN page_metrics.table_count IS 'Number of HTML tables found on the page';
        COMMENT ON COLUMN page_metrics.table_data IS 'JSON string containing extracted table data (headers, rows, structure)';
        COMMENT ON COLUMN page_metrics.has_tables IS 'Whether the page contains any HTML tables';
    END IF;
END $$;
`
    },
    {
        name: '039_add_faq_extraction_fields_to_page_metrics',
        sql: `
-- Migration: Add FAQ extraction fields to existing page_metrics table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'page_metrics' AND column_name = 'faq_count'
    ) THEN
        ALTER TABLE page_metrics 
        ADD COLUMN faq_count INTEGER DEFAULT NULL,
        ADD COLUMN faq_data TEXT DEFAULT NULL,
        ADD COLUMN has_faqs BOOLEAN DEFAULT NULL,
        ADD COLUMN faq_score INTEGER DEFAULT NULL,
        ADD COLUMN faq_detection_method VARCHAR(50) DEFAULT NULL,
        ADD COLUMN faq_schema_present BOOLEAN DEFAULT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_page_metrics_has_faqs ON page_metrics (has_faqs);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_session_has_faqs ON page_metrics (session_id, has_faqs);
        
        COMMENT ON COLUMN page_metrics.faq_count IS 'Number of FAQs found on the page';
        COMMENT ON COLUMN page_metrics.faq_data IS 'JSON string containing extracted FAQ data (questions, answers, detection method)';
        COMMENT ON COLUMN page_metrics.has_faqs IS 'Whether the page contains any FAQs';
        COMMENT ON COLUMN page_metrics.faq_score IS 'FAQ detection confidence score (0-10) based on multiple signals';
        COMMENT ON COLUMN page_metrics.faq_detection_method IS 'Detection method used: schema, html, heuristic, accordion, or combinations';
        COMMENT ON COLUMN page_metrics.faq_schema_present IS 'Whether FAQ schema markup (JSON-LD) is present on the page';
    END IF;
END $$;
`
    },
    {
        name: '040_add_mixed_content_fields_to_page_metrics',
        sql: `
-- Migration: Add mixed content detection fields to existing page_metrics table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'page_metrics' AND column_name = 'has_mixed_content'
    ) THEN
        ALTER TABLE page_metrics 
        ADD COLUMN has_mixed_content BOOLEAN DEFAULT NULL,
        ADD COLUMN mixed_content_severity VARCHAR(20) DEFAULT NULL,
        ADD COLUMN mixed_content_data TEXT DEFAULT NULL,
        ADD COLUMN active_mixed_content_count INTEGER DEFAULT NULL,
        ADD COLUMN passive_mixed_content_count INTEGER DEFAULT NULL,
        ADD COLUMN total_insecure_resources INTEGER DEFAULT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_page_metrics_has_mixed_content ON page_metrics (has_mixed_content);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_mixed_content_severity ON page_metrics (mixed_content_severity);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_session_mixed_content ON page_metrics (session_id, has_mixed_content);
        
        COMMENT ON COLUMN page_metrics.has_mixed_content IS 'Whether the page has mixed content (HTTP resources loaded on HTTPS page)';
        COMMENT ON COLUMN page_metrics.mixed_content_severity IS 'Severity level: none, warning (passive), or critical (active)';
        COMMENT ON COLUMN page_metrics.mixed_content_data IS 'JSON string containing list of insecure resources with details';
        COMMENT ON COLUMN page_metrics.active_mixed_content_count IS 'Count of critical mixed content (script, CSS, iframe, object)';
        COMMENT ON COLUMN page_metrics.passive_mixed_content_count IS 'Count of warning mixed content (images, video, audio)';
        COMMENT ON COLUMN page_metrics.total_insecure_resources IS 'Total count of HTTP resources found on HTTPS page';
    END IF;
END $$;
`
    },
    {
        name: '041_add_header_viewport_structured_data_fields_to_page_metrics',
        sql: `
-- Migration: Add header structure, viewport, and structured data fields to existing page_metrics table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'page_metrics' AND column_name = 'header_structure_data'
    ) THEN
        ALTER TABLE page_metrics 
        ADD COLUMN header_structure_data TEXT DEFAULT NULL,
        ADD COLUMN header_structure_issues TEXT DEFAULT NULL,
        ADD COLUMN viewport_present BOOLEAN DEFAULT NULL,
        ADD COLUMN viewport_content TEXT DEFAULT NULL,
        ADD COLUMN viewport_status VARCHAR(20) DEFAULT NULL,
        ADD COLUMN structured_data_present BOOLEAN DEFAULT NULL,
        ADD COLUMN structured_data_format VARCHAR(50) DEFAULT NULL,
        ADD COLUMN structured_data_types TEXT DEFAULT NULL,
        ADD COLUMN structured_data_priority_type VARCHAR(100) DEFAULT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_page_metrics_viewport_present ON page_metrics (viewport_present);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_viewport_status ON page_metrics (viewport_status);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_structured_data_present ON page_metrics (structured_data_present);
        
        COMMENT ON COLUMN page_metrics.header_structure_data IS 'JSON string containing header structure mapping with hierarchy tree';
        COMMENT ON COLUMN page_metrics.header_structure_issues IS 'JSON string containing detected header structure issues';
        COMMENT ON COLUMN page_metrics.viewport_present IS 'Whether viewport meta tag is present on the page';
        COMMENT ON COLUMN page_metrics.viewport_content IS 'Content value of viewport meta tag';
        COMMENT ON COLUMN page_metrics.viewport_status IS 'Viewport validation status: ok, warning, error, or missing';
        COMMENT ON COLUMN page_metrics.structured_data_present IS 'Whether structured data (JSON-LD or Microdata) is present';
        COMMENT ON COLUMN page_metrics.structured_data_format IS 'Format of structured data: json-ld, microdata, or combinations';
        COMMENT ON COLUMN page_metrics.structured_data_types IS 'JSON array of schema types found on the page';
        COMMENT ON COLUMN page_metrics.structured_data_priority_type IS 'Primary/priority schema type (e.g., FAQPage, Article, Product)';
    END IF;
END $$;
`
    },
    {
        name: '042_add_page_size_measurement_fields_to_page_metrics',
        sql: `
-- Migration: Add page size measurement fields to existing page_metrics table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'page_metrics' AND column_name = 'page_size_bytes'
    ) THEN
        ALTER TABLE page_metrics 
        ADD COLUMN page_size_bytes INTEGER DEFAULT NULL,
        ADD COLUMN page_size_status VARCHAR(20) DEFAULT NULL,
        ADD COLUMN html_size_bytes INTEGER DEFAULT NULL,
        ADD COLUMN html_size_status VARCHAR(20) DEFAULT NULL,
        ADD COLUMN total_resource_size_bytes INTEGER DEFAULT NULL,
        ADD COLUMN resource_size_breakdown TEXT DEFAULT NULL;
        
        CREATE INDEX IF NOT EXISTS idx_page_metrics_page_size_status ON page_metrics (page_size_status);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_html_size_status ON page_metrics (html_size_status);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_page_size_bytes ON page_metrics (page_size_bytes DESC NULLS LAST);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_html_size_bytes ON page_metrics (html_size_bytes DESC NULLS LAST);
        CREATE INDEX IF NOT EXISTS idx_page_metrics_total_resource_size_bytes ON page_metrics (total_resource_size_bytes DESC NULLS LAST);
        
        COMMENT ON COLUMN page_metrics.page_size_bytes IS 'Total page size including HTML and all external resources in bytes';
        COMMENT ON COLUMN page_metrics.page_size_status IS 'Page size classification: Small (<1MB), Medium (1-3MB), Large (>3MB)';
        COMMENT ON COLUMN page_metrics.html_size_bytes IS 'HTML document size only (excluding external resources) in bytes';
        COMMENT ON COLUMN page_metrics.html_size_status IS 'HTML size classification: Good (<100KB), Warning (100-300KB), Large (>300KB)';
        COMMENT ON COLUMN page_metrics.total_resource_size_bytes IS 'Combined size of all external assets (CSS, JS, images, fonts, etc.) in bytes';
        COMMENT ON COLUMN page_metrics.resource_size_breakdown IS 'JSON breakdown of resource sizes by type: {css, js, images, fonts, media, other}';
    END IF;
END $$;
`
    },
    {
        name: '042_create_wordcount_analysis_table',
        sql: `
-- Migration: Create wordcount_analysis table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'wordcount_analysis'
    ) THEN
        CREATE TABLE wordcount_analysis (
            id SERIAL PRIMARY KEY,
            page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
            session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
            total_word_count INTEGER DEFAULT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(page_id, session_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_page_id ON wordcount_analysis (page_id);
        CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_session_id ON wordcount_analysis (session_id);
        CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_total_word_count ON wordcount_analysis (total_word_count DESC NULLS LAST);
        CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_session_word_count ON wordcount_analysis (session_id, total_word_count DESC NULLS LAST);
        
        COMMENT ON TABLE wordcount_analysis IS 'Stores word count analysis results for crawled pages';
        COMMENT ON COLUMN wordcount_analysis.total_word_count IS 'Total number of words in the page HTML text (excluding script, style, noscript tags)';
        
        RAISE NOTICE 'Created wordcount_analysis table';
    END IF;
END $$;
`
    },
    {
        name: '043_update_wordcount_analysis_table',
        sql: `
-- Migration: Update wordcount_analysis table with new fields
DO $$ 
BEGIN
    -- Add total_word_count if it doesn't exist (keep it, don't rename)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'total_word_count'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN total_word_count INTEGER DEFAULT NULL;
        RAISE NOTICE 'Added total_word_count column';
    END IF;
    
    -- Add visible_word_count if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'visible_word_count'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN visible_word_count INTEGER DEFAULT NULL;
        RAISE NOTICE 'Added visible_word_count column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'unique_word_count'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN unique_word_count INTEGER DEFAULT NULL;
        RAISE NOTICE 'Added unique_word_count column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'text_to_html_ratio'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN text_to_html_ratio NUMERIC(5, 2) DEFAULT NULL;
        RAISE NOTICE 'Added text_to_html_ratio column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'sentence_count'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN sentence_count INTEGER DEFAULT NULL;
        RAISE NOTICE 'Added sentence_count column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'paragraph_count'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN paragraph_count INTEGER DEFAULT NULL;
        RAISE NOTICE 'Added paragraph_count column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'average_sentence_length'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN average_sentence_length NUMERIC(5, 2) DEFAULT NULL;
        RAISE NOTICE 'Added average_sentence_length column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'average_paragraph_length'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN average_paragraph_length NUMERIC(5, 2) DEFAULT NULL;
        RAISE NOTICE 'Added average_paragraph_length column';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'keyword_density'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN keyword_density NUMERIC(5, 2) DEFAULT NULL;
        RAISE NOTICE 'Added keyword_density column';
    END IF;
    
    -- Update indexes
    DROP INDEX IF EXISTS idx_wordcount_analysis_total_word_count;
    CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_visible_word_count ON wordcount_analysis (visible_word_count DESC NULLS LAST);
    CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_session_word_count ON wordcount_analysis (session_id, visible_word_count DESC NULLS LAST);
    
    -- Update comments
    COMMENT ON COLUMN wordcount_analysis.visible_word_count IS 'Number of words actually visible to users (main content)';
    COMMENT ON COLUMN wordcount_analysis.unique_word_count IS 'Number of distinct words used in visible content';
    COMMENT ON COLUMN wordcount_analysis.text_to_html_ratio IS 'Percentage of text content compared to total HTML size';
    COMMENT ON COLUMN wordcount_analysis.sentence_count IS 'Number of sentences in visible text';
    COMMENT ON COLUMN wordcount_analysis.paragraph_count IS 'Number of paragraph-level text blocks';
    COMMENT ON COLUMN wordcount_analysis.average_sentence_length IS 'Average number of words per sentence';
    COMMENT ON COLUMN wordcount_analysis.average_paragraph_length IS 'Average number of words per paragraph';
    COMMENT ON COLUMN wordcount_analysis.keyword_density IS 'Keyword density percentage (optional, for target keyword)';
END $$;
`
    },
    {
        name: '044_add_wordcount_analysis_advanced_fields',
        sql: `
-- Migration: Add advanced wordcount analysis fields
DO $$ 
BEGIN
    -- Add thin_content field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'thin_content'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN thin_content BOOLEAN DEFAULT NULL;
        RAISE NOTICE 'Added thin_content column';
    END IF;
    
    -- Add thin_content_reason field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'thin_content_reason'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN thin_content_reason TEXT DEFAULT NULL;
        RAISE NOTICE 'Added thin_content_reason column';
    END IF;
    
    -- Add duplicate_content field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'duplicate_content'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN duplicate_content BOOLEAN DEFAULT NULL;
        RAISE NOTICE 'Added duplicate_content column';
    END IF;
    
    -- Add duplicate_with_urls field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'duplicate_with_urls'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN duplicate_with_urls JSONB DEFAULT NULL;
        RAISE NOTICE 'Added duplicate_with_urls column';
    END IF;
    
    -- Add section_word_count_mapping field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'section_word_count_mapping'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN section_word_count_mapping JSONB DEFAULT NULL;
        RAISE NOTICE 'Added section_word_count_mapping column';
    END IF;
    
    -- Add section_word_count_breakdown field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'section_word_count_breakdown'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN section_word_count_breakdown JSONB DEFAULT NULL;
        RAISE NOTICE 'Added section_word_count_breakdown column';
    END IF;
    
    -- Add heading_word_count_mapping field
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'wordcount_analysis' AND column_name = 'heading_word_count_mapping'
    ) THEN
        ALTER TABLE wordcount_analysis ADD COLUMN heading_word_count_mapping JSONB DEFAULT NULL;
        RAISE NOTICE 'Added heading_word_count_mapping column';
    END IF;
    
    -- Create indexes for new fields
    CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_thin_content ON wordcount_analysis (thin_content) WHERE thin_content = true;
    CREATE INDEX IF NOT EXISTS idx_wordcount_analysis_duplicate_content ON wordcount_analysis (duplicate_content) WHERE duplicate_content = true;
    
    -- Add comments
    COMMENT ON COLUMN wordcount_analysis.thin_content IS 'Whether page has thin content (low word count or low uniqueness)';
    COMMENT ON COLUMN wordcount_analysis.thin_content_reason IS 'Reason for thin content: Low word count or Low uniqueness';
    COMMENT ON COLUMN wordcount_analysis.duplicate_content IS 'Whether page content is duplicate of another page';
    COMMENT ON COLUMN wordcount_analysis.duplicate_with_urls IS 'Array of URLs that have duplicate content';
    COMMENT ON COLUMN wordcount_analysis.section_word_count_mapping IS 'Mapping of section headings to word counts';
    COMMENT ON COLUMN wordcount_analysis.section_word_count_breakdown IS 'Percentage distribution of words across sections';
    COMMENT ON COLUMN wordcount_analysis.heading_word_count_mapping IS 'Mapping of headings (H1-H6) to word counts under each heading';
END $$;
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

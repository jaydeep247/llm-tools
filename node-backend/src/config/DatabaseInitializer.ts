import { query, getPool } from './dbConnection.js';
import { Logger } from '../helpers/logging/Logger.js';
import { userSchema } from '../models/tables/userSchema.js';
import { crawlSchema } from '../models/tables/crawlSchema.js';
import { pageSchema } from '../models/tables/pageSchema.js';
import { pageMetricsSchema } from '../models/tables/pageMetricsSchema.js';
import { wordcountAnalysisSchema } from '../models/tables/wordcountAnalysisSchema.js';
import { aeoSchema } from '../models/tables/aeoSchema.js';
import { auditSchema } from '../models/tables/auditSchema.js';
import { aeoMetricsSchema } from '../models/tables/aeoMetricsSchema.js';

const logger = Logger.getInstance();

interface MigrationResult {
    name: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
}

/**
 * Database Initializer - Comprehensive Version
 * Automatically creates all required tables, columns, and indexes on server startup
 * Includes ALL migrations from crawlerTableMigration script
 * Safe to run multiple times - checks for existing tables/columns before creating
 */
export class DatabaseInitializer {
    private static instance: DatabaseInitializer;
    private initialized = false;

    private constructor() {}

    static getInstance(): DatabaseInitializer {
        if (!DatabaseInitializer.instance) {
            DatabaseInitializer.instance = new DatabaseInitializer();
        }
        return DatabaseInitializer.instance;
    }

    /**
     * Initialize all database tables and run migrations
     * Safe to call multiple times
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            logger.info('Database already initialized, skipping');
            return;
        }

        const startTime = Date.now();
        logger.info('🚀 Starting Database Initialization...');

        try {
            // Test connection first
            await this.testConnection();

            // Create base tables
            await this.createBaseTables();

            // Run migrations for additional columns
            await this.runMigrations();

            const duration = Date.now() - startTime;
            this.initialized = true;
            logger.info(`✨ Database initialization complete in ${duration}ms`);
        } catch (error) {
            logger.error('❌ Database initialization failed', error as Error);
            throw error;
        }
    }

    /**
     * Test database connection
     */
    private async testConnection(): Promise<void> {
        try {
            const result = await query('SELECT NOW() as time, current_database() as db');
            logger.info('✅ Database connection successful', {
                database: result.rows[0].db,
                time: result.rows[0].time
            });
        } catch (error) {
            logger.error('❌ Database connection failed', error as Error);
            throw new Error('Cannot connect to database. Please check your database configuration.');
        }
    }

    /**
     * Create all base tables if they don't exist
     */
    private async createBaseTables(): Promise<void> {
        const schemas = [
            { name: 'Users', sql: userSchema },
            { name: 'Crawls', sql: crawlSchema },
            { name: 'Pages', sql: pageSchema },
            { name: 'Page Metrics', sql: pageMetricsSchema },
            { name: 'Wordcount Analysis', sql: wordcountAnalysisSchema },
            { name: 'Audits', sql: auditSchema },
            { name: 'AEO Results', sql: aeoSchema },
            { name: 'AEO Metrics', sql: aeoMetricsSchema }
        ];

        logger.info(`📋 Creating ${schemas.length} base table groups...`);

        for (const schema of schemas) {
            try {
                // Check if main table exists (assumes first CREATE TABLE in schema)
                const tableName = this.extractTableName(schema.sql);
                const exists = await this.tableExists(tableName);

                if (exists) {
                    logger.info(`✓ ${schema.name} tables already exist, skipping`);
                } else {
                    await query(schema.sql);
                    logger.info(`✅ ${schema.name} tables created`);
                }
            } catch (error) {
                logger.error(`❌ Failed to create ${schema.name} tables`, error as Error);
                // Continue with other tables even if one fails
            }
        }
    }

    /**
     * Run all database migrations for additional columns and indexes
     * Includes ALL 31 migrations from crawlerTableMigration script
     */
    private async runMigrations(): Promise<void> {
        logger.info('📋 Running comprehensive database migrations...');

        const migrations = [
            {
                name: '001_add_link_score',
                sql: `
                DO $$ 
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'pages' AND column_name = 'link_score'
                    ) THEN
                        ALTER TABLE pages ADD COLUMN link_score NUMERIC(5,2) DEFAULT NULL;
                    END IF;
                END $$;
                CREATE INDEX IF NOT EXISTS idx_pages_link_score ON pages (link_score DESC NULLS LAST);
                CREATE INDEX IF NOT EXISTS idx_pages_session_link_score ON pages (session_id, link_score DESC NULLS LAST);`
            },
            {
                name: '002_add_js_rendered_column',
                sql: `
                ALTER TABLE links ADD COLUMN IF NOT EXISTS is_js_rendered BOOLEAN DEFAULT FALSE;
                CREATE INDEX IF NOT EXISTS idx_links_js_rendered ON links (is_js_rendered) WHERE is_js_rendered = TRUE;`
            },
            {
                name: '003_add_canonical_url',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS canonical_url TEXT;
                CREATE INDEX IF NOT EXISTS idx_pages_canonical_url ON pages(canonical_url);`
            },
            {
                name: '004_add_amphtml_url',
                sql: `ALTER TABLE pages ADD COLUMN IF NOT EXISTS amphtml_url TEXT;`
            },
            {
                name: '005_add_indexability_columns',
                sql: `
                ALTER TABLE pages 
                ADD COLUMN IF NOT EXISTS indexable BOOLEAN DEFAULT true,
                ADD COLUMN IF NOT EXISTS indexability_status VARCHAR(100) DEFAULT 'indexable';
                CREATE INDEX IF NOT EXISTS idx_pages_indexable ON pages(indexable);
                CREATE INDEX IF NOT EXISTS idx_pages_indexability_status ON pages(indexability_status);`
            },
            {
                name: '006_add_meta_robots',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_robots TEXT;
                CREATE INDEX IF NOT EXISTS idx_pages_meta_robots ON pages(meta_robots);`
            },
            {
                name: '007_add_x_robots_tag',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS x_robots_tag TEXT;
                CREATE INDEX IF NOT EXISTS idx_pages_x_robots_tag ON pages(x_robots_tag);`
            },
            {
                name: '008_add_meta_refresh',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_refresh TEXT;
                CREATE INDEX IF NOT EXISTS idx_pages_meta_refresh ON pages(meta_refresh);`
            },
            {
                name: '009_add_carbon_columns',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS transferred_bytes BIGINT;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS total_transferred_bytes BIGINT;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS co2_mg DECIMAL(10, 4);
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS carbon_rating VARCHAR(5);`
            },
            {
                name: '010_add_pagination_links',
                sql: `
                ALTER TABLE pages 
                ADD COLUMN IF NOT EXISTS rel_next TEXT,
                ADD COLUMN IF NOT EXISTS rel_prev TEXT,
                ADD COLUMN IF NOT EXISTS http_rel_next TEXT,
                ADD COLUMN IF NOT EXISTS http_rel_prev TEXT;
                CREATE INDEX IF NOT EXISTS idx_pages_rel_next ON pages(rel_next);
                CREATE INDEX IF NOT EXISTS idx_pages_rel_prev ON pages(rel_prev);
                CREATE INDEX IF NOT EXISTS idx_pages_http_rel_next ON pages(http_rel_next);
                CREATE INDEX IF NOT EXISTS idx_pages_http_rel_prev ON pages(http_rel_prev);`
            },
            {
                name: '011_add_text_to_html_ratio',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS text_to_html_ratio NUMERIC(5, 2) DEFAULT NULL;
                CREATE INDEX IF NOT EXISTS idx_pages_text_to_html_ratio ON pages(text_to_html_ratio);`
            },
            {
                name: '012_add_title_pixel_width',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS title_pixel_width INTEGER;
                CREATE INDEX IF NOT EXISTS idx_pages_title_pixel_width ON pages(title_pixel_width);`
            },
            {
                name: '013_add_description_pixel_width',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS description_pixel_width INTEGER;
                CREATE INDEX IF NOT EXISTS idx_pages_description_pixel_width ON pages(description_pixel_width);`
            },
            {
                name: '014_add_flesch_reading_ease_score',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS flesch_reading_ease_score NUMERIC(5, 2) DEFAULT NULL;
                CREATE INDEX IF NOT EXISTS idx_pages_flesch_reading_ease_score ON pages(flesch_reading_ease_score);`
            },
            {
                name: '015_add_readability_level',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS readability_level TEXT;
                CREATE INDEX IF NOT EXISTS idx_pages_readability_level ON pages(readability_level);`
            },
            {
                name: '016_add_meta_keywords_columns',
                sql: `
                ALTER TABLE pages 
                ADD COLUMN IF NOT EXISTS meta_keywords TEXT,
                ADD COLUMN IF NOT EXISTS meta_keywords_length INTEGER,
                ADD COLUMN IF NOT EXISTS heading_tags TEXT;
                CREATE INDEX IF NOT EXISTS idx_pages_meta_keywords_length ON pages(meta_keywords_length);`
            },
            {
                name: '017_add_crawl_depth_and_folder_depth',
                sql: `
                ALTER TABLE pages 
                ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 0,
                ADD COLUMN IF NOT EXISTS folder_depth INTEGER DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_crawl_depth ON pages(crawl_depth);
                CREATE INDEX IF NOT EXISTS idx_pages_folder_depth ON pages(folder_depth);`
            },
            {
                name: '018_add_average_words_per_sentence',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS average_words_per_sentence NUMERIC(10, 2) DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_average_words_per_sentence ON pages(average_words_per_sentence);`
            },
            {
                name: '019_add_sentence_count',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS sentence_count INTEGER DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_sentence_count ON pages(sentence_count);`
            },
            {
                name: '020_add_size_bytes',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS size_bytes INTEGER;
                CREATE INDEX IF NOT EXISTS idx_pages_size_bytes ON pages(size_bytes);`
            },
            {
                name: '021_add_unique_outlinks',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS unique_outlinks INTEGER DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_unique_outlinks ON pages(unique_outlinks);`
            },
            {
                name: '022_add_unique_js_outlinks',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS unique_js_outlinks INTEGER DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_unique_js_outlinks ON pages(unique_js_outlinks);`
            },
            {
                name: '023_add_unique_external_outlinks',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS unique_external_outlinks INTEGER DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_unique_external_outlinks ON pages(unique_external_outlinks);`
            },
            {
                name: '024_add_unique_external_js_outlinks',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS unique_external_js_outlinks INTEGER DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_unique_external_js_outlinks ON pages(unique_external_js_outlinks);`
            },
            {
                name: '025_create_content_fingerprints_table',
                sql: `
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
                CREATE INDEX IF NOT EXISTS idx_content_fingerprints_hash ON content_fingerprints(content_hash);`
            },
            {
                name: '026_create_similarity_index_table',
                sql: `
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
                CREATE INDEX IF NOT EXISTS idx_similarity_score ON similarity_index(similarity_score DESC);`
            },
            {
                name: '027_add_near_duplicate_columns',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS closest_duplicate_url TEXT;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS closest_duplicate_similarity NUMERIC(5,4);
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS near_duplicate_count INTEGER DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_near_duplicate_count ON pages(near_duplicate_count DESC);
                CREATE INDEX IF NOT EXISTS idx_pages_closest_duplicate_similarity ON pages(closest_duplicate_similarity DESC);`
            },
            {
                name: '028_add_spelling_grammar_errors',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS spelling_errors INTEGER DEFAULT 0;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS grammar_errors INTEGER DEFAULT 0;
                CREATE INDEX IF NOT EXISTS idx_pages_spelling_errors ON pages(spelling_errors DESC);
                CREATE INDEX IF NOT EXISTS idx_pages_grammar_errors ON pages(grammar_errors DESC);`
            },
            {
                name: '029_add_redirect_fields',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS redirect_url TEXT;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS redirect_type VARCHAR(50);
                CREATE INDEX IF NOT EXISTS idx_pages_redirect_url ON pages(redirect_url);
                CREATE INDEX IF NOT EXISTS idx_pages_redirect_type ON pages(redirect_type);`
            },
            {
                name: '030_add_cookies_language_httpversion',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS cookies TEXT;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS language VARCHAR(10);
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS http_version VARCHAR(20);
                CREATE INDEX IF NOT EXISTS idx_pages_language ON pages(language);
                CREATE INDEX IF NOT EXISTS idx_pages_http_version ON pages(http_version);`
            },
            {
                name: '031_add_mobile_alternate_url',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS mobile_alternate_url TEXT;
                CREATE INDEX IF NOT EXISTS idx_pages_mobile_alternate_url ON pages(mobile_alternate_url);`
            },
            {
                name: '032_add_metadata_columns',
                sql: `
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_description TEXT;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS og_title TEXT;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS og_description TEXT;
                ALTER TABLE pages ADD COLUMN IF NOT EXISTS og_image TEXT;`
            },
            {
                name: '033_add_crawl_session_fields',
                sql: `
                ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS max_depth INTEGER DEFAULT 3;
                ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS max_pages INTEGER DEFAULT 100;
                ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS respect_robots_txt BOOLEAN DEFAULT TRUE;
                ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
                ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS error_message TEXT;
                ALTER TABLE crawl_sessions ADD COLUMN IF NOT EXISTS pages_crawled INTEGER DEFAULT 0;`
            },
            {
                name: '034_add_audit_columns',
                sql: `
                ALTER TABLE audit_results ADD COLUMN IF NOT EXISTS fcp NUMERIC(10, 2);
                ALTER TABLE audit_results ADD COLUMN IF NOT EXISTS ttfb NUMERIC(10, 2);
                ALTER TABLE audit_results ADD COLUMN IF NOT EXISTS fid NUMERIC(10, 2);
                ALTER TABLE audit_results ADD COLUMN IF NOT EXISTS device_type VARCHAR(20) DEFAULT 'desktop';`
            },
            {
                name: '035_add_aeo_columns',
                sql: `
                ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS score_consistency INTEGER DEFAULT 0;
                ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS score_entity_coverage INTEGER DEFAULT 0;
                ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS entities_expected JSONB DEFAULT '[]';
                ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS entities_observed JSONB DEFAULT '[]';
                ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS entities_missing JSONB DEFAULT '[]';
                ALTER TABLE aeo_results ADD COLUMN IF NOT EXISTS brand_metrics JSONB DEFAULT NULL;`
            },
            {
                name: '036_create_page_metrics_table',
                sql: `
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
                CREATE INDEX IF NOT EXISTS idx_page_metrics_duplicate_meta_description_count ON page_metrics (duplicate_meta_description_count DESC NULLS LAST);`
            },
            {
                name: '037_add_meta_description_fields_to_page_metrics',
                sql: `
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
                END $$;`
            },
            {
                name: '038_add_canonical_validation_fields_to_page_metrics',
                sql: `
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
                END $$;`
            },
            {
                name: '042_add_page_size_measurement_fields_to_page_metrics',
                sql: `
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
                    END IF;
                END $$;`
            }
        ];

        const results: MigrationResult[] = [];

        for (const migration of migrations) {
            try {
                await query(migration.sql);
                logger.info(`✓ ${migration.name}`);
                results.push({
                    name: migration.name,
                    status: 'success'
                });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
                    results.push({
                        name: migration.name,
                        status: 'skipped'
                    });
                } else {
                    logger.warn(`⚠️ ${migration.name}: ${errorMessage}`);
                    results.push({
                        name: migration.name,
                        status: 'failed',
                        error: errorMessage
                    });
                }
            }
        }

        const successful = results.filter(r => r.status === 'success').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        const failed = results.filter(r => r.status === 'failed').length;
        
        logger.info(`✅ Migrations complete: ${successful} successful, ${skipped} skipped, ${failed} failed`);
    }

    /**
     * Check if a table exists
     */
    private async tableExists(tableName: string): Promise<boolean> {
        try {
            const result = await query(
                `SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = $1
                );`,
                [tableName]
            );
            return result.rows[0].exists;
        } catch (error) {
            return false;
        }
    }

    /**
     * Extract table name from CREATE TABLE statement
     */
    private extractTableName(sql: string): string {
        const match = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?([a-zA-Z_][a-zA-Z0-9_]*)/i);
        return match ? match[1] : '';
    }

    /**
     * Reset initialization state (useful for testing)
     */
    reset(): void {
        this.initialized = false;
    }
}

// Export singleton instance
export const databaseInitializer = DatabaseInitializer.getInstance();

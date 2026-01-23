export const pageMetricsSchema = `
-- Page Metrics table
-- Stores additional metrics and analysis results for pages
CREATE TABLE IF NOT EXISTS page_metrics (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    title_status VARCHAR(20) DEFAULT NULL,
    duplicate_title_count INTEGER DEFAULT NULL,
    duplicate_with TEXT DEFAULT NULL, -- JSON array of URLs with duplicate titles
    meta_description_status VARCHAR(20) DEFAULT NULL,
    duplicate_meta_description_count INTEGER DEFAULT NULL,
    duplicate_meta_description_with TEXT DEFAULT NULL, -- JSON array of URLs with duplicate meta descriptions
    canonical_url TEXT DEFAULT NULL, -- Extracted canonical URL
    canonical_validation_status VARCHAR(20) DEFAULT NULL, -- Valid, Invalid, Missing, Redirect, Error, Not Found, Blocked
    canonical_validation_message TEXT DEFAULT NULL, -- Detailed validation message
    table_count INTEGER DEFAULT NULL, -- Number of tables found on the page
    table_data TEXT DEFAULT NULL, -- JSON string containing extracted table data
    has_tables BOOLEAN DEFAULT NULL, -- Whether the page contains any tables
    faq_count INTEGER DEFAULT NULL, -- Number of FAQs found on the page
    faq_data TEXT DEFAULT NULL, -- JSON string containing extracted FAQ data
    has_faqs BOOLEAN DEFAULT NULL, -- Whether the page contains any FAQs
    faq_score INTEGER DEFAULT NULL, -- FAQ detection confidence score (0-10)
    faq_detection_method VARCHAR(50) DEFAULT NULL, -- Detection method used (schema, html, heuristic, accordion)
    faq_schema_present BOOLEAN DEFAULT NULL, -- Whether FAQ schema markup is present
    has_mixed_content BOOLEAN DEFAULT NULL, -- Whether the page has mixed content (HTTP resources on HTTPS page)
    mixed_content_severity VARCHAR(20) DEFAULT NULL, -- Severity: none, warning, critical
    mixed_content_data TEXT DEFAULT NULL, -- JSON string containing mixed content resources
    active_mixed_content_count INTEGER DEFAULT NULL, -- Count of critical mixed content (script, CSS, iframe)
    passive_mixed_content_count INTEGER DEFAULT NULL, -- Count of warning mixed content (images, video, audio)
    total_insecure_resources INTEGER DEFAULT NULL, -- Total count of HTTP resources
    header_structure_data TEXT DEFAULT NULL, -- JSON string containing header structure mapping
    header_structure_issues TEXT DEFAULT NULL, -- JSON string containing header structure issues
    viewport_present BOOLEAN DEFAULT NULL, -- Whether viewport meta tag is present
    viewport_content TEXT DEFAULT NULL, -- Viewport meta tag content
    viewport_status VARCHAR(20) DEFAULT NULL, -- Viewport status: ok, warning, error, missing
    structured_data_present BOOLEAN DEFAULT NULL, -- Whether structured data is present
    structured_data_format VARCHAR(50) DEFAULT NULL, -- Format: json-ld, microdata, or combinations
    structured_data_types TEXT DEFAULT NULL, -- JSON array of schema types found
    structured_data_priority_type VARCHAR(100) DEFAULT NULL, -- Primary/priority schema type
    page_size_bytes INTEGER DEFAULT NULL, -- Total page size (HTML + all resources) in bytes
    page_size_status VARCHAR(20) DEFAULT NULL, -- Page size status: Small, Medium, Large
    html_size_bytes INTEGER DEFAULT NULL, -- HTML document size only in bytes
    html_size_status VARCHAR(20) DEFAULT NULL, -- HTML size status: Good, Warning, Large
    total_resource_size_bytes INTEGER DEFAULT NULL, -- Total size of all external resources in bytes
    resource_size_breakdown TEXT DEFAULT NULL, -- JSON breakdown of resource sizes by type (CSS, JS, images, etc.)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(page_id, session_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_page_metrics_page_id ON page_metrics (page_id);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_id ON page_metrics (session_id);
CREATE INDEX IF NOT EXISTS idx_page_metrics_title_status ON page_metrics (title_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_title_status ON page_metrics (session_id, title_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_duplicate_title_count ON page_metrics (duplicate_title_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_page_metrics_meta_description_status ON page_metrics (meta_description_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_meta_description_status ON page_metrics (session_id, meta_description_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_duplicate_meta_description_count ON page_metrics (duplicate_meta_description_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_page_metrics_canonical_validation_status ON page_metrics (canonical_validation_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_canonical_status ON page_metrics (session_id, canonical_validation_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_has_tables ON page_metrics (has_tables);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_has_tables ON page_metrics (session_id, has_tables);
CREATE INDEX IF NOT EXISTS idx_page_metrics_has_faqs ON page_metrics (has_faqs);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_has_faqs ON page_metrics (session_id, has_faqs);
CREATE INDEX IF NOT EXISTS idx_page_metrics_has_mixed_content ON page_metrics (has_mixed_content);
CREATE INDEX IF NOT EXISTS idx_page_metrics_mixed_content_severity ON page_metrics (mixed_content_severity);
CREATE INDEX IF NOT EXISTS idx_page_metrics_session_mixed_content ON page_metrics (session_id, has_mixed_content);
CREATE INDEX IF NOT EXISTS idx_page_metrics_viewport_present ON page_metrics (viewport_present);
CREATE INDEX IF NOT EXISTS idx_page_metrics_viewport_status ON page_metrics (viewport_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_structured_data_present ON page_metrics (structured_data_present);
CREATE INDEX IF NOT EXISTS idx_page_metrics_page_size_status ON page_metrics (page_size_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_html_size_status ON page_metrics (html_size_status);
CREATE INDEX IF NOT EXISTS idx_page_metrics_page_size_bytes ON page_metrics (page_size_bytes DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_page_metrics_html_size_bytes ON page_metrics (html_size_bytes DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_page_metrics_total_resource_size_bytes ON page_metrics (total_resource_size_bytes DESC NULLS LAST);

-- Add comments for documentation
COMMENT ON TABLE page_metrics IS 'Stores additional metrics and analysis results for crawled pages, including title and meta description detection and duplicate analysis';
COMMENT ON COLUMN page_metrics.title_status IS 'Status of the page title: OK, Missing, or Duplicate';
COMMENT ON COLUMN page_metrics.duplicate_title_count IS 'Number of pages with the same normalized title in the session';
COMMENT ON COLUMN page_metrics.duplicate_with IS 'JSON array of URLs that share the same title as this page';
COMMENT ON COLUMN page_metrics.meta_description_status IS 'Status of the meta description: OK, Missing, or Duplicate';
COMMENT ON COLUMN page_metrics.duplicate_meta_description_count IS 'Number of pages with the same normalized meta description in the session';
COMMENT ON COLUMN page_metrics.duplicate_meta_description_with IS 'JSON array of URLs that share the same meta description as this page';
COMMENT ON COLUMN page_metrics.canonical_url IS 'Extracted canonical URL from the page';
COMMENT ON COLUMN page_metrics.canonical_validation_status IS 'Validation status: Valid, Invalid, Missing, Redirect, Error, Not Found, or Blocked';
COMMENT ON COLUMN page_metrics.canonical_validation_message IS 'Detailed validation message explaining the canonical status';
COMMENT ON COLUMN page_metrics.table_count IS 'Number of HTML tables found on the page';
COMMENT ON COLUMN page_metrics.table_data IS 'JSON string containing extracted table data (headers, rows, structure)';
COMMENT ON COLUMN page_metrics.has_tables IS 'Whether the page contains any HTML tables';
COMMENT ON COLUMN page_metrics.faq_count IS 'Number of FAQs found on the page';
COMMENT ON COLUMN page_metrics.faq_data IS 'JSON string containing extracted FAQ data (questions, answers, detection method)';
COMMENT ON COLUMN page_metrics.has_faqs IS 'Whether the page contains any FAQs';
COMMENT ON COLUMN page_metrics.faq_score IS 'FAQ detection confidence score (0-10) based on multiple signals';
COMMENT ON COLUMN page_metrics.faq_detection_method IS 'Detection method used: schema, html, heuristic, accordion, or combinations';
COMMENT ON COLUMN page_metrics.faq_schema_present IS 'Whether FAQ schema markup (JSON-LD) is present on the page';
COMMENT ON COLUMN page_metrics.has_mixed_content IS 'Whether the page has mixed content (HTTP resources loaded on HTTPS page)';
COMMENT ON COLUMN page_metrics.mixed_content_severity IS 'Severity level: none, warning (passive), or critical (active)';
COMMENT ON COLUMN page_metrics.mixed_content_data IS 'JSON string containing list of insecure resources with details';
COMMENT ON COLUMN page_metrics.active_mixed_content_count IS 'Count of critical mixed content (script, CSS, iframe, object)';
COMMENT ON COLUMN page_metrics.passive_mixed_content_count IS 'Count of warning mixed content (images, video, audio)';
COMMENT ON COLUMN page_metrics.total_insecure_resources IS 'Total count of HTTP resources found on HTTPS page';
COMMENT ON COLUMN page_metrics.header_structure_data IS 'JSON string containing header structure mapping with hierarchy tree';
COMMENT ON COLUMN page_metrics.header_structure_issues IS 'JSON string containing detected header structure issues';
COMMENT ON COLUMN page_metrics.viewport_present IS 'Whether viewport meta tag is present on the page';
COMMENT ON COLUMN page_metrics.viewport_content IS 'Content value of viewport meta tag';
COMMENT ON COLUMN page_metrics.viewport_status IS 'Viewport validation status: ok, warning, error, or missing';
COMMENT ON COLUMN page_metrics.structured_data_present IS 'Whether structured data (JSON-LD or Microdata) is present';
COMMENT ON COLUMN page_metrics.structured_data_format IS 'Format of structured data: json-ld, microdata, or combinations';
COMMENT ON COLUMN page_metrics.structured_data_types IS 'JSON array of schema types found on the page';
COMMENT ON COLUMN page_metrics.structured_data_priority_type IS 'Primary/priority schema type (e.g., FAQPage, Article, Product)';
COMMENT ON COLUMN page_metrics.page_size_bytes IS 'Total page size including HTML and all external resources in bytes';
COMMENT ON COLUMN page_metrics.page_size_status IS 'Page size classification: Small (<1MB), Medium (1-3MB), Large (>3MB)';
COMMENT ON COLUMN page_metrics.html_size_bytes IS 'HTML document size only (excluding external resources) in bytes';
COMMENT ON COLUMN page_metrics.html_size_status IS 'HTML size classification: Good (<100KB), Warning (100-300KB), Large (>300KB)';
COMMENT ON COLUMN page_metrics.total_resource_size_bytes IS 'Combined size of all external assets (CSS, JS, images, fonts, etc.) in bytes';
COMMENT ON COLUMN page_metrics.resource_size_breakdown IS 'JSON breakdown of resource sizes by type: {css, js, images, fonts, media, other}';
`;

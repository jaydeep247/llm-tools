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
`;

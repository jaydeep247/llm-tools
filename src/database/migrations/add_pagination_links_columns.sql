-- Add pagination link columns to pages table
-- Migration: add_pagination_links_columns.sql
-- Pagination links help search engines understand paginated content series

-- Add HTML pagination link columns (from <link rel="next/prev">)
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS rel_next TEXT,
ADD COLUMN IF NOT EXISTS rel_prev TEXT;

-- Add HTTP header pagination link columns (from Link: header)
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS http_rel_next TEXT,
ADD COLUMN IF NOT EXISTS http_rel_prev TEXT;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_pages_rel_next ON pages(rel_next);
CREATE INDEX IF NOT EXISTS idx_pages_rel_prev ON pages(rel_prev);
CREATE INDEX IF NOT EXISTS idx_pages_http_rel_next ON pages(http_rel_next);
CREATE INDEX IF NOT EXISTS idx_pages_http_rel_prev ON pages(http_rel_prev);

-- Update existing rows with default values
UPDATE pages 
SET rel_next = NULL,
    rel_prev = NULL,
    http_rel_next = NULL,
    http_rel_prev = NULL
WHERE rel_next IS NULL;

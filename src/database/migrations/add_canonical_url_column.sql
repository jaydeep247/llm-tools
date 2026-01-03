-- Add canonical_url column to pages table
-- Migration: add_canonical_url_column.sql
-- Canonical URL is the preferred version of a page to prevent duplicate content issues

-- Add canonical_url column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS canonical_url TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_pages_canonical_url ON pages(canonical_url);

-- Update existing rows with default values
UPDATE pages 
SET canonical_url = NULL
WHERE canonical_url IS NULL;

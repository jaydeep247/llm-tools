-- Add meta_refresh column to pages table
-- Migration: add_meta_refresh_column.sql
-- Meta Refresh is an HTML meta tag that causes automatic page redirects/refreshes

-- Add meta_refresh column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS meta_refresh TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_pages_meta_refresh ON pages(meta_refresh);

-- Update existing rows with default values
UPDATE pages 
SET meta_refresh = NULL
WHERE meta_refresh IS NULL;

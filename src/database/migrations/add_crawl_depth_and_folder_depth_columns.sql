-- Add crawl_depth and folder_depth columns to pages table
-- Migration: add_crawl_depth_and_folder_depth_columns.sql
-- Crawl Depth: The number of clicks needed from the homepage to reach a page
-- Folder Depth: The number of folders in the URL path
-- Used for: SEO optimization, Site structure analysis, Content accessibility assessment

-- Add crawl_depth column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS crawl_depth INTEGER DEFAULT 0;

-- Add folder_depth column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS folder_depth INTEGER DEFAULT 0;

-- Create indexes for faster queries and analytics
CREATE INDEX IF NOT EXISTS idx_pages_crawl_depth ON pages(crawl_depth);
CREATE INDEX IF NOT EXISTS idx_pages_folder_depth ON pages(folder_depth);

-- Update existing rows with default values
UPDATE pages 
SET crawl_depth = 0
WHERE crawl_depth IS NULL;

UPDATE pages 
SET folder_depth = 0
WHERE folder_depth IS NULL;


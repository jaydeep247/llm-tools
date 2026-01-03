-- Add X-Robots-Tag column to pages table
-- Migration: add_x_robots_tag_column.sql
-- X-Robots-Tag is an HTTP header that provides server-level instructions for search engines

-- Add x_robots_tag column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS x_robots_tag TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_pages_x_robots_tag ON pages(x_robots_tag);

-- Update existing rows with default values
UPDATE pages 
SET x_robots_tag = NULL
WHERE x_robots_tag IS NULL;

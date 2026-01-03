-- Add meta robots column to pages table
-- Migration: add_meta_robots_column.sql

-- Add meta_robots column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS meta_robots TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_pages_meta_robots ON pages(meta_robots);

-- Update existing rows with default values
UPDATE pages 
SET meta_robots = NULL
WHERE meta_robots IS NULL;

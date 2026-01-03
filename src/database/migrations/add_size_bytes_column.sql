-- Add size_bytes column to pages table
-- Migration: add_size_bytes_column.sql
-- Size (bytes) tracks the total data size of the downloaded web page

-- Add size_bytes column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS size_bytes INTEGER;

-- Create index for faster queries and analytics
CREATE INDEX IF NOT EXISTS idx_pages_size_bytes ON pages(size_bytes);

-- Update existing rows with default values
UPDATE pages 
SET size_bytes = NULL
WHERE size_bytes IS NULL;

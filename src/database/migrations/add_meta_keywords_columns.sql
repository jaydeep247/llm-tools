-- Add meta keywords and heading tags columns to pages table
-- Migration: add_meta_keywords_columns.sql

-- Add meta_keywords column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS meta_keywords TEXT;

-- Add meta_keywords_length column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS meta_keywords_length INTEGER;

-- Add heading_tags column (stores JSON with heading counts)
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS heading_tags TEXT;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_pages_meta_keywords_length ON pages(meta_keywords_length);
CREATE INDEX IF NOT EXISTS idx_pages_heading_tags ON pages USING gin(to_tsvector('english', heading_tags));

-- Update existing rows with default values
UPDATE pages 
SET meta_keywords = NULL,
    meta_keywords_length = NULL,
    heading_tags = NULL
WHERE meta_keywords IS NULL;

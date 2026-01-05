-- Add text_to_html_ratio column to pages table
-- Migration: add_text_to_html_ratio_column.sql
-- Text Ratio: The percentage of text content compared to total HTML size
-- Formula: Visible text size ÷ Total HTML size
-- Good range: 20%–40%
-- Used for: Content quality assessment, SEO optimization, Thin content detection

-- Add text_to_html_ratio column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS text_to_html_ratio NUMERIC(5, 2) DEFAULT NULL;

-- Create index for faster queries and analytics
CREATE INDEX IF NOT EXISTS idx_pages_text_to_html_ratio ON pages(text_to_html_ratio);

-- Update existing rows with default value
UPDATE pages 
SET text_to_html_ratio = NULL
WHERE text_to_html_ratio IS NULL;


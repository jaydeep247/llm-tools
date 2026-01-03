-- Add title_pixel_width column to pages table
-- Migration: add_title_pixel_width_column.sql

ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS title_pixel_width INTEGER;

-- Create index for faster queries on title pixel width
CREATE INDEX IF NOT EXISTS idx_pages_title_pixel_width ON pages(title_pixel_width);

-- Update existing rows to calculate pixel width from title_length (rough estimate)
-- Average character is ~8px, so title_length * 8 gives approximate pixel width
UPDATE pages 
SET title_pixel_width = title_length * 8
WHERE title_pixel_width IS NULL;

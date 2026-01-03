-- Add description_pixel_width column to pages table
-- Migration: add_description_pixel_width_column.sql

ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS description_pixel_width INTEGER;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_pages_description_pixel_width ON pages(description_pixel_width);

-- Update existing rows with estimated pixel width
-- Average character is ~6px for descriptions (smaller font than titles)
UPDATE pages 
SET description_pixel_width = description_length * 6
WHERE description_pixel_width IS NULL;

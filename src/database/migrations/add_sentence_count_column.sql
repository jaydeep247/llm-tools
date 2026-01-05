-- Add sentence_count column to pages table
-- Migration: add_sentence_count_column.sql
-- Sentence Count: The total number of sentences found in the visible text of a web page.
-- Used for: Content length analysis, Readability evaluation, Thin vs rich content detection

-- Add sentence_count column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS sentence_count INTEGER DEFAULT 0;

-- Create index for faster queries and analytics
CREATE INDEX IF NOT EXISTS idx_pages_sentence_count ON pages(sentence_count);

-- Update existing rows with default value
UPDATE pages 
SET sentence_count = 0
WHERE sentence_count IS NULL;


-- Add readability_level column to pages table
-- Migration: add_readability_level_column.sql
-- Readability Level: human-friendly label derived from readability score (e.g., Flesch Reading Ease)
-- Examples: Easy, Standard, Difficult, Very Difficult

ALTER TABLE pages
ADD COLUMN IF NOT EXISTS readability_level TEXT;

CREATE INDEX IF NOT EXISTS idx_pages_readability_level ON pages(readability_level);

UPDATE pages
SET readability_level = NULL
WHERE readability_level IS NULL;

-- Add flesch_reading_ease_score column to pages table
-- Migration: add_flesch_reading_ease_score_column.sql
-- Flesch Reading Ease Score: A readability test indicating how easy a text is to read.
-- Score range: 0-100
-- 90-100: Very Easy (5th grade)
-- 80-89: Easy (6th grade)
-- 70-79: Fairly Easy (7th grade)
-- 60-69: Standard (8th-9th grade)
-- 50-59: Fairly Difficult (10th-12th grade)
-- 30-49: Difficult (College)
-- 0-29: Very Difficult (College graduate)
-- Used for: Content readability analysis, SEO content optimization, Writing quality assessment

-- Add flesch_reading_ease_score column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS flesch_reading_ease_score NUMERIC(5, 2) DEFAULT NULL;

-- Create index for faster queries and analytics
CREATE INDEX IF NOT EXISTS idx_pages_flesch_reading_ease_score ON pages(flesch_reading_ease_score);

-- Update existing rows with NULL (cannot calculate retroactively without text)
UPDATE pages 
SET flesch_reading_ease_score = NULL
WHERE flesch_reading_ease_score IS NULL;


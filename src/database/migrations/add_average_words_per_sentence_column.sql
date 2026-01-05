-- Add average_words_per_sentence column to pages table
-- Migration: add_average_words_per_sentence_column.sql
-- Average Words Per Sentence: The average number of words per sentence in the visible text of a web page.
-- Used for: Content readability analysis, Writing quality assessment, SEO content optimization

-- Add average_words_per_sentence column
ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS average_words_per_sentence NUMERIC(10, 2) DEFAULT 0;

-- Create index for faster queries and analytics
CREATE INDEX IF NOT EXISTS idx_pages_average_words_per_sentence ON pages(average_words_per_sentence);

-- Update existing rows with default value
UPDATE pages 
SET average_words_per_sentence = 0
WHERE average_words_per_sentence IS NULL;


-- Add indexability columns to pages table
-- Migration: add_indexability_columns.sql

ALTER TABLE pages 
ADD COLUMN IF NOT EXISTS indexable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS indexability_status VARCHAR(100) DEFAULT 'indexable';

-- Create index for faster queries on indexability
CREATE INDEX IF NOT EXISTS idx_pages_indexable ON pages(indexable);
CREATE INDEX IF NOT EXISTS idx_pages_indexability_status ON pages(indexability_status);

-- Update existing rows to have default values
UPDATE pages 
SET indexable = true, 
    indexability_status = 'indexable' 
WHERE indexable IS NULL;

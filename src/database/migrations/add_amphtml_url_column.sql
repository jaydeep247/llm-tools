-- Add amphtml_url column to pages table
ALTER TABLE pages ADD COLUMN IF NOT EXISTS amphtml_url TEXT;

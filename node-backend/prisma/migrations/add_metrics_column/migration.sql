-- AlterTable: Add metrics column to aeo_analysis_results table
-- This column stores JSON data containing entity_presence_ratio, structured_data_completeness, and readability_score

ALTER TABLE "aeo_analysis_results" ADD COLUMN IF NOT EXISTS "metrics" TEXT;

-- Add comment for documentation
COMMENT ON COLUMN "aeo_analysis_results"."metrics" IS 'JSON string containing metrics like entity_presence_ratio, structured_data_completeness, readability_score';

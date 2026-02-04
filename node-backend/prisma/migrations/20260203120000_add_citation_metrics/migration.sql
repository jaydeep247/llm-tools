-- AlterTable: Add citation_metrics to aeo_results (Module E - citations, diversity, credibility)
ALTER TABLE "aeo_results" ADD COLUMN IF NOT EXISTS "citation_metrics" JSONB;

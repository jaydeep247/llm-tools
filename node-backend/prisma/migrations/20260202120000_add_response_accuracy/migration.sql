-- AlterTable: Add response_accuracy to aeo_results (Module E - Accuracy of Generated Responses)
ALTER TABLE "aeo_results" ADD COLUMN IF NOT EXISTS "response_accuracy" JSONB;

-- AlterTable
ALTER TABLE "aeo_results" ADD COLUMN     "ranking_metrics" JSONB,
ADD COLUMN     "sentiment_metrics" JSONB,
ADD COLUMN     "share_of_voice" JSONB,
ADD COLUMN     "visibility_metrics" JSONB;

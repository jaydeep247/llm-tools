-- AlterTable: Add missing fields to crawl_sessions
ALTER TABLE "crawl_sessions" ADD COLUMN IF NOT EXISTS "max_depth" INTEGER DEFAULT 3;
ALTER TABLE "crawl_sessions" ADD COLUMN IF NOT EXISTS "max_pages" INTEGER DEFAULT 100;
ALTER TABLE "crawl_sessions" ADD COLUMN IF NOT EXISTS "respect_robots_txt" BOOLEAN DEFAULT true;
ALTER TABLE "crawl_sessions" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "crawl_sessions" ADD COLUMN IF NOT EXISTS "error_message" TEXT;
ALTER TABLE "crawl_sessions" ADD COLUMN IF NOT EXISTS "pages_crawled" INTEGER DEFAULT 0;

-- AlterTable: Add missing fields to pages
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "unique_outlinks" INTEGER DEFAULT 0;
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "unique_js_outlinks" INTEGER DEFAULT 0;
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "meta_description" TEXT;
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "og_title" TEXT;
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "og_description" TEXT;
ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "og_image" TEXT;

-- AlterTable: Add missing fields to audit_results
ALTER TABLE "audit_results" ADD COLUMN IF NOT EXISTS "fcp" DECIMAL(10,2);
ALTER TABLE "audit_results" ADD COLUMN IF NOT EXISTS "ttfb" DECIMAL(10,2);
ALTER TABLE "audit_results" ADD COLUMN IF NOT EXISTS "fid" DECIMAL(10,2);
ALTER TABLE "audit_results" ADD COLUMN IF NOT EXISTS "device_type" VARCHAR(20) DEFAULT 'desktop';

-- CreateIndex: Add missing indexes for pages
CREATE INDEX IF NOT EXISTS "idx_pages_indexable" ON "pages"("indexable");
CREATE INDEX IF NOT EXISTS "idx_pages_indexability_status" ON "pages"("indexability_status");
CREATE INDEX IF NOT EXISTS "idx_pages_meta_robots" ON "pages"("meta_robots");
CREATE INDEX IF NOT EXISTS "idx_pages_x_robots_tag" ON "pages"("x_robots_tag");
CREATE INDEX IF NOT EXISTS "idx_pages_meta_refresh" ON "pages"("meta_refresh");
CREATE INDEX IF NOT EXISTS "idx_pages_rel_next" ON "pages"("rel_next");
CREATE INDEX IF NOT EXISTS "idx_pages_rel_prev" ON "pages"("rel_prev");
CREATE INDEX IF NOT EXISTS "idx_pages_http_rel_next" ON "pages"("http_rel_next");
CREATE INDEX IF NOT EXISTS "idx_pages_http_rel_prev" ON "pages"("http_rel_prev");
CREATE INDEX IF NOT EXISTS "idx_pages_text_to_html_ratio" ON "pages"("text_to_html_ratio");
CREATE INDEX IF NOT EXISTS "idx_pages_title_pixel_width" ON "pages"("title_pixel_width");
CREATE INDEX IF NOT EXISTS "idx_pages_description_pixel_width" ON "pages"("description_pixel_width");
CREATE INDEX IF NOT EXISTS "idx_pages_flesch_reading_ease_score" ON "pages"("flesch_reading_ease_score" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_readability_level" ON "pages"("readability_level");
CREATE INDEX IF NOT EXISTS "idx_pages_meta_keywords_length" ON "pages"("meta_keywords_length");
CREATE INDEX IF NOT EXISTS "idx_pages_crawl_depth" ON "pages"("crawl_depth");
CREATE INDEX IF NOT EXISTS "idx_pages_folder_depth" ON "pages"("folder_depth");
CREATE INDEX IF NOT EXISTS "idx_pages_average_words_per_sentence" ON "pages"("average_words_per_sentence" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_sentence_count" ON "pages"("sentence_count" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_size_bytes" ON "pages"("size_bytes" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_spelling_errors" ON "pages"("spelling_errors" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_grammar_errors" ON "pages"("grammar_errors" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_redirect_url" ON "pages"("redirect_url");
CREATE INDEX IF NOT EXISTS "idx_pages_redirect_type" ON "pages"("redirect_type");
CREATE INDEX IF NOT EXISTS "idx_pages_language" ON "pages"("language");
CREATE INDEX IF NOT EXISTS "idx_pages_http_version" ON "pages"("http_version");
CREATE INDEX IF NOT EXISTS "idx_pages_mobile_alternate_url" ON "pages"("mobile_alternate_url");
CREATE INDEX IF NOT EXISTS "idx_pages_unique_outlinks" ON "pages"("unique_outlinks" DESC);
CREATE INDEX IF NOT EXISTS "idx_pages_unique_js_outlinks" ON "pages"("unique_js_outlinks" DESC);

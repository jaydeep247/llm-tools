/*
  Warnings:

  - You are about to alter the column `redirect_type` on the `pages` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(50)`.
  - You are about to alter the column `language` on the `pages` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(10)`.
  - You are about to alter the column `http_version` on the `pages` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.

*/
-- AlterTable
ALTER TABLE "audit_results" ADD COLUMN     "device_type" VARCHAR(20) DEFAULT 'desktop',
ADD COLUMN     "fcp" DECIMAL(10,2),
ADD COLUMN     "fid" DECIMAL(10,2),
ADD COLUMN     "ttfb" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "crawl_sessions" ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "max_depth" INTEGER DEFAULT 3,
ADD COLUMN     "max_pages" INTEGER DEFAULT 100,
ADD COLUMN     "pages_crawled" INTEGER DEFAULT 0,
ADD COLUMN     "respect_robots_txt" BOOLEAN DEFAULT true,
ADD COLUMN     "user_agent" TEXT;

-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "meta_description" TEXT,
ADD COLUMN     "og_description" TEXT,
ADD COLUMN     "og_image" TEXT,
ADD COLUMN     "og_title" TEXT,
ADD COLUMN     "unique_js_outlinks" INTEGER DEFAULT 0,
ADD COLUMN     "unique_outlinks" INTEGER DEFAULT 0,
ALTER COLUMN "indexability_status" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "redirect_type" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "language" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "http_version" SET DATA TYPE VARCHAR(20);

-- CreateIndex
CREATE INDEX "idx_pages_unique_outlinks" ON "pages"("unique_outlinks" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_unique_js_outlinks" ON "pages"("unique_js_outlinks" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_indexable" ON "pages"("indexable");

-- CreateIndex
CREATE INDEX "idx_pages_indexability_status" ON "pages"("indexability_status");

-- CreateIndex
CREATE INDEX "idx_pages_meta_robots" ON "pages"("meta_robots");

-- CreateIndex
CREATE INDEX "idx_pages_x_robots_tag" ON "pages"("x_robots_tag");

-- CreateIndex
CREATE INDEX "idx_pages_meta_refresh" ON "pages"("meta_refresh");

-- CreateIndex
CREATE INDEX "idx_pages_rel_next" ON "pages"("rel_next");

-- CreateIndex
CREATE INDEX "idx_pages_rel_prev" ON "pages"("rel_prev");

-- CreateIndex
CREATE INDEX "idx_pages_http_rel_next" ON "pages"("http_rel_next");

-- CreateIndex
CREATE INDEX "idx_pages_http_rel_prev" ON "pages"("http_rel_prev");

-- CreateIndex
CREATE INDEX "idx_pages_text_to_html_ratio" ON "pages"("text_to_html_ratio");

-- CreateIndex
CREATE INDEX "idx_pages_title_pixel_width" ON "pages"("title_pixel_width");

-- CreateIndex
CREATE INDEX "idx_pages_description_pixel_width" ON "pages"("description_pixel_width");

-- CreateIndex
CREATE INDEX "idx_pages_flesch_reading_ease_score" ON "pages"("flesch_reading_ease_score" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_readability_level" ON "pages"("readability_level");

-- CreateIndex
CREATE INDEX "idx_pages_meta_keywords_length" ON "pages"("meta_keywords_length");

-- CreateIndex
CREATE INDEX "idx_pages_crawl_depth" ON "pages"("crawl_depth");

-- CreateIndex
CREATE INDEX "idx_pages_folder_depth" ON "pages"("folder_depth");

-- CreateIndex
CREATE INDEX "idx_pages_average_words_per_sentence" ON "pages"("average_words_per_sentence" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_sentence_count" ON "pages"("sentence_count" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_size_bytes" ON "pages"("size_bytes" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_spelling_errors" ON "pages"("spelling_errors" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_grammar_errors" ON "pages"("grammar_errors" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_redirect_url" ON "pages"("redirect_url");

-- CreateIndex
CREATE INDEX "idx_pages_redirect_type" ON "pages"("redirect_type");

-- CreateIndex
CREATE INDEX "idx_pages_language" ON "pages"("language");

-- CreateIndex
CREATE INDEX "idx_pages_http_version" ON "pages"("http_version");

-- CreateIndex
CREATE INDEX "idx_pages_mobile_alternate_url" ON "pages"("mobile_alternate_url");

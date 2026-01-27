-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "unique_external_js_outlinks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unique_external_outlinks" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "idx_pages_unique_external_outlinks" ON "pages"("unique_external_outlinks" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_unique_external_js_outlinks" ON "pages"("unique_external_js_outlinks" DESC);

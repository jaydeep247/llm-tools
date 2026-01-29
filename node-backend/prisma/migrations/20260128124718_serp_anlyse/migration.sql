-- CreateTable
CREATE TABLE "serp_snapshots" (
    "id" SERIAL NOT NULL,
    "keyword" TEXT NOT NULL,
    "target_domain" TEXT NOT NULL,
    "normalized_domain" TEXT NOT NULL,
    "search_engine" TEXT NOT NULL DEFAULT 'google',
    "location" TEXT NOT NULL,
    "device" VARCHAR(20) NOT NULL,
    "max_results" INTEGER NOT NULL,
    "run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER,
    "ranking_url" TEXT,
    "rank_status" VARCHAR(20) NOT NULL DEFAULT 'ranked',
    "change" INTEGER,
    "change_label" VARCHAR(16),
    "intent" VARCHAR(50) NOT NULL,
    "top_competitors" JSONB NOT NULL,
    "serp_features" JSONB NOT NULL,
    "serp" JSONB NOT NULL,
    "session_id" INTEGER,

    CONSTRAINT "serp_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_serp_keyword_domain_time" ON "serp_snapshots"("keyword", "normalized_domain", "location", "device", "run_at");

-- AddForeignKey
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

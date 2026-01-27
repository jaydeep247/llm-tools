-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role" TEXT NOT NULL DEFAULT 'user',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" INTEGER NOT NULL,
    "openai_api_key" TEXT,
    "psi_api_key" TEXT,
    "max_crawls_per_day" INTEGER NOT NULL DEFAULT 100,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_usage" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credits_used" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "user_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_sessions" (
    "id" SERIAL NOT NULL,
    "start_url" TEXT NOT NULL,
    "allow_subdomains" BOOLEAN NOT NULL DEFAULT true,
    "max_concurrency" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "schedule_id" INTEGER,
    "user_id" INTEGER,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "total_pages" INTEGER NOT NULL DEFAULT 0,
    "total_resources" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'running',

    CONSTRAINT "crawl_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_shares" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "accessed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_schedules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "start_url" TEXT NOT NULL,
    "allow_subdomains" BOOLEAN NOT NULL DEFAULT true,
    "max_concurrency" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "cron_expression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_run" TIMESTAMPTZ,
    "next_run" TIMESTAMPTZ,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "successful_runs" INTEGER NOT NULL DEFAULT 0,
    "failed_runs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "crawl_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_executions" (
    "id" SERIAL NOT NULL,
    "schedule_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_message" TEXT,
    "pages_crawled" INTEGER NOT NULL DEFAULT 0,
    "resources_found" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "schedule_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_logs" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crawl_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "title_length" INTEGER NOT NULL DEFAULT 0,
    "title_pixel_width" INTEGER,
    "description" TEXT NOT NULL,
    "description_length" INTEGER NOT NULL DEFAULT 0,
    "description_pixel_width" INTEGER,
    "content_type" TEXT NOT NULL,
    "last_modified" TEXT,
    "status_code" INTEGER NOT NULL,
    "response_time" INTEGER NOT NULL,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "sentence_count" INTEGER,
    "average_words_per_sentence" DECIMAL(10,2),
    "flesch_reading_ease_score" DECIMAL(10,2),
    "readability_level" TEXT,
    "text_to_html_ratio" DECIMAL(5,2),
    "crawl_depth" INTEGER NOT NULL DEFAULT 0,
    "folder_depth" INTEGER NOT NULL DEFAULT 0,
    "size_bytes" INTEGER,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "link_score" DECIMAL(5,2),
    "canonical_url" TEXT,
    "amphtml_url" TEXT,
    "mobile_alternate_url" TEXT,
    "indexable" BOOLEAN DEFAULT true,
    "indexability_status" VARCHAR(50),
    "meta_robots" TEXT,
    "x_robots_tag" TEXT,
    "meta_refresh" TEXT,
    "transferred_bytes" BIGINT,
    "total_transferred_bytes" BIGINT,
    "co2_mg" DECIMAL(10,4),
    "carbon_rating" VARCHAR(5),
    "rel_next" TEXT,
    "rel_prev" TEXT,
    "http_rel_next" TEXT,
    "http_rel_prev" TEXT,
    "meta_keywords" TEXT,
    "meta_keywords_length" INTEGER,
    "heading_tags" TEXT,
    "spelling_errors" INTEGER NOT NULL DEFAULT 0,
    "grammar_errors" INTEGER NOT NULL DEFAULT 0,
    "redirect_url" TEXT,
    "redirect_type" TEXT,
    "cookies" TEXT,
    "language" TEXT,
    "http_version" TEXT,
    "closest_semantically_similar_address" TEXT,
    "semantic_similarity_score" DECIMAL(3,2),
    "no_semantically_similar" INTEGER NOT NULL DEFAULT 0,
    "semantic_relevance_score" DECIMAL(3,2),
    "url_encoded_address" TEXT,
    "content_hash" VARCHAR(64),
    "closest_duplicate_url" TEXT,
    "closest_duplicate_similarity" DECIMAL(5,4),
    "near_duplicate_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "page_id" INTEGER,
    "url" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "statusCode" INTEGER,
    "responseTime" INTEGER,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "links" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "source_page_id" INTEGER NOT NULL,
    "source_url" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "target_page_id" INTEGER,
    "is_internal" BOOLEAN NOT NULL,
    "anchor_text" TEXT,
    "xpath" TEXT,
    "position" TEXT,
    "rel" TEXT,
    "nofollow" BOOLEAN NOT NULL DEFAULT false,
    "is_js_rendered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemap_discoveries" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "sitemap_url" TEXT NOT NULL,
    "discovered_urls" INTEGER NOT NULL,
    "last_modified" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,

    CONSTRAINT "sitemap_discoveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sitemap_urls" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "last_modified" TEXT,
    "change_frequency" TEXT,
    "priority" TEXT,
    "discovered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crawled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sitemap_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seo_cache" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "parent_text" TEXT,
    "keywords" TEXT NOT NULL,
    "language" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "seo_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_metrics" (
    "id" SERIAL NOT NULL,
    "page_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "title_status" VARCHAR(20),
    "duplicate_title_count" INTEGER,
    "duplicate_with" TEXT,
    "meta_description_status" VARCHAR(20),
    "duplicate_meta_description_count" INTEGER,
    "duplicate_meta_description_with" TEXT,
    "canonical_url" TEXT,
    "canonical_validation_status" VARCHAR(20),
    "canonical_validation_message" TEXT,
    "table_count" INTEGER,
    "table_data" TEXT,
    "has_tables" BOOLEAN,
    "faq_count" INTEGER,
    "faq_data" TEXT,
    "has_faqs" BOOLEAN,
    "faq_score" INTEGER,
    "faq_detection_method" VARCHAR(50),
    "faq_schema_present" BOOLEAN,
    "has_mixed_content" BOOLEAN,
    "mixed_content_severity" VARCHAR(20),
    "mixed_content_data" TEXT,
    "active_mixed_content_count" INTEGER,
    "passive_mixed_content_count" INTEGER,
    "total_insecure_resources" INTEGER,
    "header_structure_data" TEXT,
    "header_structure_issues" TEXT,
    "viewport_present" BOOLEAN,
    "viewport_content" TEXT,
    "viewport_status" VARCHAR(20),
    "structured_data_present" BOOLEAN,
    "structured_data_format" VARCHAR(50),
    "structured_data_types" TEXT,
    "structured_data_priority_type" VARCHAR(100),
    "page_size_bytes" INTEGER,
    "page_size_status" VARCHAR(20),
    "html_size_bytes" INTEGER,
    "html_size_status" VARCHAR(20),
    "total_resource_size_bytes" INTEGER,
    "resource_size_breakdown" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wordcount_analysis" (
    "id" SERIAL NOT NULL,
    "page_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "total_word_count" INTEGER,
    "visible_word_count" INTEGER,
    "unique_word_count" INTEGER,
    "text_to_html_ratio" DECIMAL(5,2),
    "sentence_count" INTEGER,
    "paragraph_count" INTEGER,
    "average_sentence_length" DECIMAL(5,2),
    "average_paragraph_length" DECIMAL(5,2),
    "keyword_density" DECIMAL(5,2),
    "thin_content" BOOLEAN,
    "thin_content_reason" TEXT,
    "duplicate_content" BOOLEAN,
    "duplicate_with_urls" JSONB,
    "section_word_count_mapping" JSONB,
    "section_word_count_breakdown" JSONB,
    "heading_word_count_mapping" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wordcount_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_fingerprints" (
    "id" SERIAL NOT NULL,
    "page_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "simhash" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_fingerprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "similarity_index" (
    "id" SERIAL NOT NULL,
    "source_page_id" INTEGER NOT NULL,
    "target_page_id" INTEGER NOT NULL,
    "session_id" INTEGER NOT NULL,
    "similarity_score" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "similarity_index_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_schedules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "urls" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "cron_expression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_run" TIMESTAMPTZ,
    "next_run" TIMESTAMPTZ,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "successful_runs" INTEGER NOT NULL DEFAULT 0,
    "failed_runs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "audit_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_executions" (
    "id" SERIAL NOT NULL,
    "schedule_id" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'running',
    "error_message" TEXT,
    "urls_processed" INTEGER NOT NULL DEFAULT 0,
    "urls_successful" INTEGER NOT NULL DEFAULT 0,
    "urls_failed" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "audit_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_results" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "run_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lcp_ms" INTEGER,
    "tbt_ms" INTEGER,
    "cls" DOUBLE PRECISION,
    "fcp_ms" INTEGER,
    "ttfb_ms" INTEGER,
    "performance_score" INTEGER,
    "psi_report_url" TEXT,
    "metrics_json" TEXT,
    "raw_json" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "audit_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo_results" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "session_id" INTEGER,
    "score_openai" INTEGER NOT NULL DEFAULT 0,
    "score_claude" INTEGER NOT NULL DEFAULT 0,
    "score_gemini" INTEGER NOT NULL DEFAULT 0,
    "consistency" INTEGER NOT NULL DEFAULT 0,
    "score_entity_coverage" INTEGER NOT NULL DEFAULT 0,
    "entities_expected" JSONB NOT NULL DEFAULT '[]',
    "entities_observed" JSONB NOT NULL DEFAULT '[]',
    "entities_missing" JSONB NOT NULL DEFAULT '[]',
    "brand_metrics" JSONB,
    "analyzed_pages_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,
    "error_message" TEXT,

    CONSTRAINT "aeo_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo_schedules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "start_url" TEXT NOT NULL,
    "allow_subdomains" BOOLEAN NOT NULL DEFAULT true,
    "run_audits" BOOLEAN NOT NULL DEFAULT false,
    "audit_device" TEXT NOT NULL DEFAULT 'desktop',
    "capture_link_details" BOOLEAN NOT NULL DEFAULT false,
    "cron_expression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "user_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_run" TIMESTAMPTZ,
    "next_run" TIMESTAMPTZ,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "successful_runs" INTEGER NOT NULL DEFAULT 0,
    "failed_runs" INTEGER NOT NULL DEFAULT 0,
    "last_aeo_score" DOUBLE PRECISION,
    "average_aeo_score" DOUBLE PRECISION,

    CONSTRAINT "aeo_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo_executions" (
    "id" SERIAL NOT NULL,
    "schedule_id" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'running',
    "pages_analyzed" INTEGER NOT NULL DEFAULT 0,
    "average_aeo_score" DOUBLE PRECISION,
    "duration" INTEGER,
    "error_message" TEXT,

    CONSTRAINT "aeo_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo_analysis_results" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER,
    "user_id" INTEGER,
    "url" TEXT NOT NULL,
    "grade" TEXT,
    "grade_color" TEXT,
    "overall_score" DOUBLE PRECISION,
    "module_scores" TEXT,
    "module_weights" TEXT,
    "detailed_analysis" TEXT,
    "structured_data" TEXT,
    "recommendations" TEXT,
    "errors" TEXT,
    "warnings" TEXT,
    "analysis_timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "run_id" TEXT,

    CONSTRAINT "aeo_analysis_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aeo_module_c_metrics" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "session_id" INTEGER,
    "difficulty_score" DECIMAL(5,2),
    "complexity_level" TEXT DEFAULT 'Low',
    "ai_feasibility_score" DECIMAL(5,2),
    "entity_coverage_score" DECIMAL(5,2),
    "found_entities" TEXT,
    "missing_entities" TEXT,
    "consistency_score" DECIMAL(5,2),
    "main_topics" TEXT,
    "llm_friendliness_score" DECIMAL(5,2),
    "readability_score" DECIMAL(5,2),
    "fact_density" DECIMAL(5,2),
    "content_type_accuracy" DECIMAL(5,2),
    "prompt_intent_match" DECIMAL(5,2),
    "visibility_impact" DECIMAL(5,2),
    "suggested_content_type" TEXT,
    "prompt_intent_details" TEXT,
    "visibility_factors" TEXT,
    "entities_detected_count" INTEGER NOT NULL DEFAULT 0,
    "entity_relevance_score" DECIMAL(5,2),
    "entity_relevance_details" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aeo_module_c_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_usage_user_id" ON "user_usage"("user_id");

-- CreateIndex
CREATE INDEX "idx_crawl_sessions_user_id" ON "crawl_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_shares_session_id_user_id_key" ON "session_shares"("session_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_crawl_schedules_user_id" ON "crawl_schedules"("user_id");

-- CreateIndex
CREATE INDEX "idx_crawl_logs_session_id" ON "crawl_logs"("session_id");

-- CreateIndex
CREATE INDEX "idx_pages_session_id" ON "pages"("session_id");

-- CreateIndex
CREATE INDEX "idx_pages_url" ON "pages"("url");

-- CreateIndex
CREATE INDEX "idx_pages_link_score" ON "pages"("link_score" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_session_link_score" ON "pages"("session_id", "link_score" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_canonical_url" ON "pages"("canonical_url");

-- CreateIndex
CREATE INDEX "idx_pages_closest_semantically_similar_address" ON "pages"("closest_semantically_similar_address");

-- CreateIndex
CREATE INDEX "idx_pages_semantic_similarity_score" ON "pages"("semantic_similarity_score" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_no_semantically_similar" ON "pages"("no_semantically_similar" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_semantic_relevance_score" ON "pages"("semantic_relevance_score" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_session_semantic_similarity" ON "pages"("session_id", "semantic_similarity_score" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_url_encoded_address" ON "pages"("url_encoded_address");

-- CreateIndex
CREATE INDEX "idx_pages_content_hash" ON "pages"("content_hash");

-- CreateIndex
CREATE INDEX "idx_pages_session_content_hash" ON "pages"("session_id", "content_hash");

-- CreateIndex
CREATE INDEX "idx_pages_near_duplicate_count" ON "pages"("near_duplicate_count" DESC);

-- CreateIndex
CREATE INDEX "idx_pages_closest_duplicate_similarity" ON "pages"("closest_duplicate_similarity" DESC);

-- CreateIndex
CREATE INDEX "idx_resources_session_id" ON "resources"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "resources_session_id_url_key" ON "resources"("session_id", "url");

-- CreateIndex
CREATE INDEX "idx_links_session_id" ON "links"("session_id");

-- CreateIndex
CREATE INDEX "idx_links_js_rendered" ON "links"("is_js_rendered");

-- CreateIndex
CREATE INDEX "idx_sitemap_urls_session_id" ON "sitemap_urls"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "seo_cache_url_key" ON "seo_cache"("url");

-- CreateIndex
CREATE INDEX "idx_page_metrics_page_id" ON "page_metrics"("page_id");

-- CreateIndex
CREATE INDEX "idx_page_metrics_session_id" ON "page_metrics"("session_id");

-- CreateIndex
CREATE INDEX "idx_page_metrics_title_status" ON "page_metrics"("title_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_session_title_status" ON "page_metrics"("session_id", "title_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_duplicate_title_count" ON "page_metrics"("duplicate_title_count" DESC);

-- CreateIndex
CREATE INDEX "idx_page_metrics_meta_description_status" ON "page_metrics"("meta_description_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_session_meta_description_status" ON "page_metrics"("session_id", "meta_description_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_duplicate_meta_description_count" ON "page_metrics"("duplicate_meta_description_count" DESC);

-- CreateIndex
CREATE INDEX "idx_page_metrics_canonical_validation_status" ON "page_metrics"("canonical_validation_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_session_canonical_status" ON "page_metrics"("session_id", "canonical_validation_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_has_tables" ON "page_metrics"("has_tables");

-- CreateIndex
CREATE INDEX "idx_page_metrics_session_has_tables" ON "page_metrics"("session_id", "has_tables");

-- CreateIndex
CREATE INDEX "idx_page_metrics_has_faqs" ON "page_metrics"("has_faqs");

-- CreateIndex
CREATE INDEX "idx_page_metrics_session_has_faqs" ON "page_metrics"("session_id", "has_faqs");

-- CreateIndex
CREATE INDEX "idx_page_metrics_has_mixed_content" ON "page_metrics"("has_mixed_content");

-- CreateIndex
CREATE INDEX "idx_page_metrics_mixed_content_severity" ON "page_metrics"("mixed_content_severity");

-- CreateIndex
CREATE INDEX "idx_page_metrics_session_mixed_content" ON "page_metrics"("session_id", "has_mixed_content");

-- CreateIndex
CREATE INDEX "idx_page_metrics_viewport_present" ON "page_metrics"("viewport_present");

-- CreateIndex
CREATE INDEX "idx_page_metrics_viewport_status" ON "page_metrics"("viewport_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_structured_data_present" ON "page_metrics"("structured_data_present");

-- CreateIndex
CREATE INDEX "idx_page_metrics_page_size_status" ON "page_metrics"("page_size_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_html_size_status" ON "page_metrics"("html_size_status");

-- CreateIndex
CREATE INDEX "idx_page_metrics_page_size_bytes" ON "page_metrics"("page_size_bytes" DESC);

-- CreateIndex
CREATE INDEX "idx_page_metrics_html_size_bytes" ON "page_metrics"("html_size_bytes" DESC);

-- CreateIndex
CREATE INDEX "idx_page_metrics_total_resource_size_bytes" ON "page_metrics"("total_resource_size_bytes" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "page_metrics_page_id_session_id_key" ON "page_metrics"("page_id", "session_id");

-- CreateIndex
CREATE INDEX "idx_wordcount_analysis_page_id" ON "wordcount_analysis"("page_id");

-- CreateIndex
CREATE INDEX "idx_wordcount_analysis_session_id" ON "wordcount_analysis"("session_id");

-- CreateIndex
CREATE INDEX "idx_wordcount_analysis_total_word_count" ON "wordcount_analysis"("total_word_count" DESC);

-- CreateIndex
CREATE INDEX "idx_wordcount_analysis_visible_word_count" ON "wordcount_analysis"("visible_word_count" DESC);

-- CreateIndex
CREATE INDEX "idx_wordcount_analysis_session_word_count" ON "wordcount_analysis"("session_id", "visible_word_count" DESC);

-- CreateIndex
CREATE INDEX "idx_wordcount_analysis_thin_content" ON "wordcount_analysis"("thin_content");

-- CreateIndex
CREATE INDEX "idx_wordcount_analysis_duplicate_content" ON "wordcount_analysis"("duplicate_content");

-- CreateIndex
CREATE UNIQUE INDEX "wordcount_analysis_page_id_session_id_key" ON "wordcount_analysis"("page_id", "session_id");

-- CreateIndex
CREATE INDEX "idx_content_fingerprints_session" ON "content_fingerprints"("session_id");

-- CreateIndex
CREATE INDEX "idx_content_fingerprints_page" ON "content_fingerprints"("page_id");

-- CreateIndex
CREATE INDEX "idx_content_fingerprints_simhash" ON "content_fingerprints"("simhash");

-- CreateIndex
CREATE INDEX "idx_content_fingerprints_hash" ON "content_fingerprints"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "content_fingerprints_page_id_session_id_key" ON "content_fingerprints"("page_id", "session_id");

-- CreateIndex
CREATE INDEX "idx_similarity_source" ON "similarity_index"("source_page_id", "similarity_score" DESC);

-- CreateIndex
CREATE INDEX "idx_similarity_target" ON "similarity_index"("target_page_id");

-- CreateIndex
CREATE INDEX "idx_similarity_session" ON "similarity_index"("session_id");

-- CreateIndex
CREATE INDEX "idx_similarity_score" ON "similarity_index"("similarity_score" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "similarity_index_source_page_id_target_page_id_session_id_key" ON "similarity_index"("source_page_id", "target_page_id", "session_id");

-- CreateIndex
CREATE INDEX "idx_audit_results_url" ON "audit_results"("url");

-- CreateIndex
CREATE UNIQUE INDEX "aeo_results_session_id_key" ON "aeo_results"("session_id");

-- CreateIndex
CREATE INDEX "idx_aeo_results_url" ON "aeo_results"("url");

-- CreateIndex
CREATE INDEX "idx_aeo_analysis_results_session_id" ON "aeo_analysis_results"("session_id");

-- CreateIndex
CREATE INDEX "idx_aeo_module_c_url" ON "aeo_module_c_metrics"("url");

-- CreateIndex
CREATE INDEX "idx_aeo_module_c_created" ON "aeo_module_c_metrics"("created_at");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_sessions" ADD CONSTRAINT "crawl_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_shares" ADD CONSTRAINT "session_shares_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_shares" ADD CONSTRAINT "session_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_schedules" ADD CONSTRAINT "crawl_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_executions" ADD CONSTRAINT "schedule_executions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "crawl_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_executions" ADD CONSTRAINT "schedule_executions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crawl_logs" ADD CONSTRAINT "crawl_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links" ADD CONSTRAINT "links_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links" ADD CONSTRAINT "links_source_page_id_fkey" FOREIGN KEY ("source_page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links" ADD CONSTRAINT "links_target_page_id_fkey" FOREIGN KEY ("target_page_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_discoveries" ADD CONSTRAINT "sitemap_discoveries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sitemap_urls" ADD CONSTRAINT "sitemap_urls_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_metrics" ADD CONSTRAINT "page_metrics_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_metrics" ADD CONSTRAINT "page_metrics_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wordcount_analysis" ADD CONSTRAINT "wordcount_analysis_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wordcount_analysis" ADD CONSTRAINT "wordcount_analysis_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_fingerprints" ADD CONSTRAINT "content_fingerprints_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_fingerprints" ADD CONSTRAINT "content_fingerprints_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similarity_index" ADD CONSTRAINT "similarity_index_source_page_id_fkey" FOREIGN KEY ("source_page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similarity_index" ADD CONSTRAINT "similarity_index_target_page_id_fkey" FOREIGN KEY ("target_page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similarity_index" ADD CONSTRAINT "similarity_index_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_schedules" ADD CONSTRAINT "audit_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_executions" ADD CONSTRAINT "audit_executions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "audit_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo_results" ADD CONSTRAINT "aeo_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo_schedules" ADD CONSTRAINT "aeo_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo_executions" ADD CONSTRAINT "aeo_executions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "aeo_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo_analysis_results" ADD CONSTRAINT "aeo_analysis_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "crawl_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aeo_analysis_results" ADD CONSTRAINT "aeo_analysis_results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

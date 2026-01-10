export const aeoMetricsSchema = `
-- Module C: Dedicated Metrics Table
CREATE TABLE IF NOT EXISTS aeo_module_c_metrics (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    session_id INTEGER, -- Optional: Link to a crawl session if available
    
    -- Knowledge Base Metrics
    difficulty_score NUMERIC(5,2) DEFAULT 0,
    complexity_level TEXT DEFAULT 'Low',
    ai_feasibility_score NUMERIC(5,2) DEFAULT 0,
    
    -- Entity Coverage
    entity_coverage_score NUMERIC(5,2) DEFAULT 0,
    found_entities TEXT,   -- Stored as JSON string
    missing_entities TEXT, -- Stored as JSON string
    
    -- Content Consistency
    consistency_score NUMERIC(5,2) DEFAULT 0,
    main_topics TEXT,      -- Stored as JSON string
    
    -- Overall Scores
    llm_friendliness_score NUMERIC(5,2) DEFAULT 0,
    readability_score NUMERIC(5,2) DEFAULT 0,
    fact_density NUMERIC(5,2) DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_aeo_module_c_url ON aeo_module_c_metrics (url);
CREATE INDEX IF NOT EXISTS idx_aeo_module_c_created ON aeo_module_c_metrics (created_at);
`;
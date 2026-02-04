export const aeoSchema = `
-- AEO Results table
CREATE TABLE IF NOT EXISTS aeo_results (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    session_id INTEGER,
    score_openai INTEGER DEFAULT 0,
    score_claude INTEGER DEFAULT 0,
    score_gemini INTEGER DEFAULT 0,
    consistency INTEGER DEFAULT 0,
    score_entity_coverage INTEGER DEFAULT 0,
    entities_expected JSONB DEFAULT '[]',
    entities_observed JSONB DEFAULT '[]',
    entities_missing JSONB DEFAULT '[]',
    brand_metrics JSONB,
    analyzed_pages_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    error_message TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_aeo_results_url ON aeo_results (url);
-- UNIQUE constraint is required for ON CONFLICT to work
CREATE UNIQUE INDEX IF NOT EXISTS idx_aeo_results_session_id ON aeo_results (session_id);

-- Migrations (Ensure columns exist if table already exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aeo_results' AND column_name='consistency') THEN
        ALTER TABLE aeo_results ADD COLUMN consistency INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aeo_results' AND column_name='score_entity_coverage') THEN
        ALTER TABLE aeo_results ADD COLUMN score_entity_coverage INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aeo_results' AND column_name='brand_metrics') THEN
        ALTER TABLE aeo_results ADD COLUMN brand_metrics JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aeo_results' AND column_name='response_accuracy') THEN
        ALTER TABLE aeo_results ADD COLUMN response_accuracy JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aeo_results' AND column_name='citation_metrics') THEN
        ALTER TABLE aeo_results ADD COLUMN citation_metrics JSONB;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='aeo_results' AND column_name='updated_at') THEN
        ALTER TABLE aeo_results ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    -- Ensure UNIQUE constraint exists for ON CONFLICT support
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'aeo_results_session_id_key'
    ) THEN
        -- Check if a unique index already exists (might be named differently)
        -- If idx_aeo_results_session_id is not unique, drop it first
        DROP INDEX IF EXISTS idx_aeo_results_session_id;
        
        ALTER TABLE aeo_results ADD CONSTRAINT aeo_results_session_id_key UNIQUE (session_id);
    END IF;
END
$$;
`;

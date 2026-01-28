export const auditSchema = `
-- Performance Audit Schedules
CREATE TABLE IF NOT EXISTS audit_schedules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    urls TEXT NOT NULL, -- JSON string
    device TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0
);

-- Performance Audit Executions
CREATE TABLE IF NOT EXISTS audit_executions (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES audit_schedules(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    error_message TEXT,
    urls_processed INTEGER DEFAULT 0,
    urls_successful INTEGER DEFAULT 0,
    urls_failed INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0
);

-- Audit results details
CREATE TABLE IF NOT EXISTS audit_results (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    device TEXT NOT NULL,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lcp_ms INTEGER,
    tbt_ms INTEGER,
    cls DOUBLE PRECISION,
    fcp_ms INTEGER,
    ttfb_ms INTEGER,
    performance_score INTEGER,
    psi_report_url TEXT,
    metrics_json TEXT, -- JSON structure
    raw_json TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id INTEGER,
    status TEXT DEFAULT 'pending',
    progress INTEGER DEFAULT 0
);

-- AEO Schedules
CREATE TABLE IF NOT EXISTS aeo_schedules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    start_url TEXT NOT NULL,
    allow_subdomains BOOLEAN NOT NULL DEFAULT TRUE,
    run_audits BOOLEAN NOT NULL DEFAULT FALSE,
    audit_device TEXT NOT NULL DEFAULT 'desktop',
    capture_link_details BOOLEAN NOT NULL DEFAULT FALSE,
    cron_expression TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    last_aeo_score DOUBLE PRECISION,
    average_aeo_score DOUBLE PRECISION
);

-- AEO Executions
CREATE TABLE IF NOT EXISTS aeo_executions (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES aeo_schedules(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    pages_analyzed INTEGER DEFAULT 0,
    average_aeo_score DOUBLE PRECISION,
    duration INTEGER,
    error_message TEXT
);

-- AEO Detailed Analysis Results
CREATE TABLE IF NOT EXISTS aeo_analysis_results (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    url TEXT NOT NULL,
    grade TEXT,
    grade_color TEXT,
    overall_score DOUBLE PRECISION,
    module_scores TEXT, -- JSON string
    module_weights TEXT, -- JSON string
    detailed_analysis TEXT, -- JSON string
    structured_data TEXT, -- JSON string
    recommendations TEXT, -- JSON string
    errors TEXT,
    warnings TEXT,
    analysis_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_audit_results_url ON audit_results (url);
CREATE INDEX IF NOT EXISTS idx_aeo_analysis_results_session_id ON aeo_analysis_results (session_id);
`;

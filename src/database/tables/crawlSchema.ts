export const crawlSchema = `
-- Crawl sessions
CREATE TABLE IF NOT EXISTS crawl_sessions (
    id SERIAL PRIMARY KEY,
    start_url TEXT NOT NULL,
    allow_subdomains BOOLEAN NOT NULL DEFAULT TRUE,
    max_concurrency INTEGER NOT NULL,
    mode TEXT NOT NULL,
    schedule_id INTEGER, -- Calculated later
    user_id INTEGER REFERENCES users(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    total_pages INTEGER DEFAULT 0,
    total_resources INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0, -- in milliseconds
    status TEXT DEFAULT 'running'
);

-- Session shares (multi-user access)
CREATE TABLE IF NOT EXISTS session_shares (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, user_id)
);

-- Crawl schedules
CREATE TABLE IF NOT EXISTS crawl_schedules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    start_url TEXT NOT NULL,
    allow_subdomains BOOLEAN NOT NULL DEFAULT TRUE,
    max_concurrency INTEGER NOT NULL,
    mode TEXT NOT NULL,
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

-- Schedule execution history
CREATE TABLE IF NOT EXISTS schedule_executions (
    id SERIAL PRIMARY KEY,
    schedule_id INTEGER NOT NULL REFERENCES crawl_schedules(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'running',
    error_message TEXT,
    pages_crawled INTEGER DEFAULT 0,
    resources_found INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0
);

-- Crawl logs
CREATE TABLE IF NOT EXISTS crawl_logs (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    level TEXT DEFAULT 'info',
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_user_id ON crawl_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_crawl_schedules_user_id ON crawl_schedules (user_id);
CREATE INDEX IF NOT EXISTS idx_crawl_logs_session_id ON crawl_logs (session_id);
`;

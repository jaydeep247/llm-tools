export const userSchema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    role TEXT NOT NULL DEFAULT 'user'
);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    openai_api_key TEXT,
    psi_api_key TEXT,
    max_crawls_per_day INTEGER DEFAULT 100,
    email_notifications BOOLEAN DEFAULT TRUE
);

-- User usage tracking
CREATE TABLE IF NOT EXISTS user_usage (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    credits_used INTEGER DEFAULT 1
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_user_usage_user_id ON user_usage (user_id);
`;

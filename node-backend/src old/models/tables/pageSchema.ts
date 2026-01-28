export const pageSchema = `
-- Pages table
CREATE TABLE IF NOT EXISTS pages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    title_length INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    description_length INTEGER NOT NULL DEFAULT 0,
    content_type TEXT NOT NULL,
    last_modified TEXT,
    status_code INTEGER NOT NULL,
    response_time INTEGER NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL,
    error_message TEXT,
    link_score NUMERIC(5,2) DEFAULT NULL,
    -- Semantic Analysis Fields for Module A
    closest_semantically_similar_address TEXT,
    semantic_similarity_score NUMERIC(3,2) DEFAULT NULL,
    no_semantically_similar INTEGER DEFAULT 0,
    semantic_relevance_score NUMERIC(3,2) DEFAULT NULL
);

-- Resources table (CSS, JS, Images)
CREATE TABLE IF NOT EXISTS resources (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    content_type TEXT NOT NULL,
    status_code INTEGER,
    response_time INTEGER,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, url)
);

-- Links table
CREATE TABLE IF NOT EXISTS links (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    source_page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    target_page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
    is_internal BOOLEAN NOT NULL,
    anchor_text TEXT,
    xpath TEXT,
    position TEXT,
    rel TEXT,
    nofollow BOOLEAN DEFAULT FALSE,
    is_js_rendered BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sitemap discovery
CREATE TABLE IF NOT EXISTS sitemap_discoveries (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    sitemap_url TEXT NOT NULL,
    discovered_urls INTEGER NOT NULL,
    last_modified TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT
);

-- Sitemap URLs
CREATE TABLE IF NOT EXISTS sitemap_urls (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    last_modified TEXT,
    change_frequency TEXT,
    priority TEXT,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    crawled BOOLEAN NOT NULL DEFAULT FALSE
);

-- SEO Cache
CREATE TABLE IF NOT EXISTS seo_cache (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    parent_text TEXT,
    keywords TEXT NOT NULL,
    language TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pages_session_id ON pages (session_id);
CREATE INDEX IF NOT EXISTS idx_pages_url ON pages (url);
CREATE INDEX IF NOT EXISTS idx_resources_session_id ON resources (session_id);
CREATE INDEX IF NOT EXISTS idx_links_session_id ON links (session_id);
CREATE INDEX IF NOT EXISTS idx_links_js_rendered ON links (is_js_rendered) WHERE is_js_rendered = TRUE;
CREATE INDEX IF NOT EXISTS idx_sitemap_urls_session_id ON sitemap_urls (session_id);
`;

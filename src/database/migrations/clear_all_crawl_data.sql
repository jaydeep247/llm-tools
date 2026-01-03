-- Clear all crawl sessions and related data
-- This will delete all crawl data including pages, resources, links, sessions, etc.

-- Disable foreign key checks temporarily (if needed)
-- SET session_replication_role = 'replica';

-- Delete in order to respect foreign key constraints
DELETE FROM links;
DELETE FROM resources;
DELETE FROM pages;
DELETE FROM sitemap_urls;
DELETE FROM sitemap_discoveries;
DELETE FROM schedule_executions;
DELETE FROM crawl_sessions;
DELETE FROM crawl_logs;

-- Re-enable foreign key checks (if disabled)
-- SET session_replication_role = 'origin';

-- Reset sequences (optional - uncomment if you want to reset IDs)
-- ALTER SEQUENCE crawl_sessions_id_seq RESTART WITH 1;
-- ALTER SEQUENCE pages_id_seq RESTART WITH 1;
-- ALTER SEQUENCE resources_id_seq RESTART WITH 1;
-- ALTER SEQUENCE links_id_seq RESTART WITH 1;

SELECT 'All crawl sessions and related data have been deleted.' as status;

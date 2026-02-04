-- CreateTable
CREATE TABLE IF NOT EXISTS "projects" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_projects_user_id" ON "projects"("user_id");
CREATE INDEX "idx_projects_user_active" ON "projects"("user_id", "is_active");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add project_id column to crawl_sessions
ALTER TABLE "crawl_sessions" ADD COLUMN IF NOT EXISTS "project_id" INTEGER;

-- Create a default project for each user
INSERT INTO "projects" (name, description, user_id, created_at, updated_at, is_active)
SELECT 
    'Default Project' as name,
    'Auto-created project for existing sessions' as description,
    id as user_id,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at,
    true as is_active
FROM "users"
WHERE id IN (SELECT DISTINCT user_id FROM "crawl_sessions" WHERE user_id IS NOT NULL);

-- Update existing sessions to link to the default project
UPDATE "crawl_sessions" cs
SET project_id = p.id
FROM "projects" p
WHERE cs.user_id = p.user_id
AND p.name = 'Default Project'
AND cs.project_id IS NULL;

-- For sessions without a user, create a fallback project
INSERT INTO "projects" (name, description, user_id, created_at, updated_at, is_active)
SELECT 
    'Anonymous Sessions' as name,
    'Project for sessions without user' as description,
    (SELECT id FROM "users" ORDER BY id LIMIT 1) as user_id,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at,
    true as is_active
WHERE EXISTS (SELECT 1 FROM "crawl_sessions" WHERE user_id IS NULL AND project_id IS NULL)
AND NOT EXISTS (SELECT 1 FROM "projects" WHERE name = 'Anonymous Sessions');

-- Update sessions without user_id
UPDATE "crawl_sessions" cs
SET project_id = p.id
FROM "projects" p
WHERE cs.user_id IS NULL
AND p.name = 'Anonymous Sessions'
AND cs.project_id IS NULL;

-- Make project_id NOT NULL after data migration
ALTER TABLE "crawl_sessions" ALTER COLUMN "project_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idx_crawl_sessions_project_id" ON "crawl_sessions"("project_id");
CREATE INDEX "idx_crawl_sessions_project_status" ON "crawl_sessions"("project_id", "status");

-- AddForeignKey
ALTER TABLE "crawl_sessions" ADD CONSTRAINT "crawl_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

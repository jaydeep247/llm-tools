-- AlterTable: Change Project.id from Int to UUID
-- AlterTable: Change CrawlSession.projectId from Int to UUID

BEGIN;

-- Step 1: Add new UUID columns
ALTER TABLE "projects" ADD COLUMN "id_new" UUID DEFAULT gen_random_uuid();
ALTER TABLE "crawl_sessions" ADD COLUMN "project_id_new" UUID;

-- Step 2: Populate new UUID columns
-- For projects, we'll generate new UUIDs
UPDATE "projects" SET "id_new" = gen_random_uuid();

-- For crawl_sessions, we need to map old integer IDs to new UUIDs
UPDATE "crawl_sessions" cs
SET "project_id_new" = p."id_new"
FROM "projects" p
WHERE cs."project_id" = p."id";

-- Step 3: Drop old foreign key constraint
ALTER TABLE "crawl_sessions" DROP CONSTRAINT "crawl_sessions_project_id_fkey";

-- Step 4: Drop old columns
ALTER TABLE "projects" DROP COLUMN "id";
ALTER TABLE "crawl_sessions" DROP COLUMN "project_id";

-- Step 5: Rename new columns to original names
ALTER TABLE "projects" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "crawl_sessions" RENAME COLUMN "project_id_new" TO "project_id";

-- Step 6: Make id NOT NULL and set as primary key
ALTER TABLE "projects" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "projects" ADD PRIMARY KEY ("id");

-- Step 7: Make projectId NOT NULL and add foreign key
ALTER TABLE "crawl_sessions" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "crawl_sessions" ADD CONSTRAINT "crawl_sessions_project_id_fkey" 
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 8: Recreate indexes
DROP INDEX IF EXISTS "idx_projects_user_id";
DROP INDEX IF EXISTS "idx_projects_user_active";
CREATE INDEX "idx_projects_user_id" ON "projects"("user_id");
CREATE INDEX "idx_projects_user_active" ON "projects"("user_id", "is_active");

COMMIT;

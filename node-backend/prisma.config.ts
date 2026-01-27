import { defineConfig, env } from "prisma/config";
import "dotenv/config";

// For Prisma Client generation, we don't need a real DATABASE_URL
// Use a dummy URL during build if DATABASE_URL is not available
// The real DATABASE_URL is only needed for migrations and runtime connections
const getDatabaseUrl = () => {
  // Check process.env first (available during build)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  
  // Try to construct from individual env vars
  if (process.env.DB_USER || process.env.DB_HOST) {
    return `postgresql://${process.env.DB_USER || "postgres"}:${process.env.DB_PASSWORD || ""}@${process.env.DB_HOST || "localhost"}:${process.env.DB_PORT || "5432"}/${process.env.DB_NAME || "contentlytics"}`;
  }
  
  // Fallback: Try Prisma's env() function (may throw if not set)
  try {
    return env("DATABASE_URL");
  } catch (error) {
    // DATABASE_URL not set - this is OK during build time
    // Prisma Client generation doesn't actually connect to the database
    // Use dummy URL that will be replaced at runtime
    return "postgresql://dummy:dummy@localhost:5432/dummy";
  }
};

const databaseUrl = getDatabaseUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});

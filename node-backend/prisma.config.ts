/* eslint-disable @typescript-eslint/no-var-requires */
import { defineConfig, env } from "prisma/config";
import "dotenv/config";

// Prisma should only ever use DATABASE_URL from the environment.
// If it is missing, fail fast so the misconfiguration is obvious.
// Use globalThis.process to avoid depending on Node typings in this config file.
const databaseUrl =
  (globalThis as any).process?.env?.DATABASE_URL ?? env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});

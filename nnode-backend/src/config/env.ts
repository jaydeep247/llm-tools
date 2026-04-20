import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Environment variable schema
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3004'),
  API_PREFIX: z.string().default('/api/v1'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Cookie
  COOKIE_SECRET: z.string().min(32),
  COOKIE_MAX_AGE: z.string().transform(Number).pipe(z.number().positive()).default('604800000'),

  // CORS (comma-separated list of allowed origins)
  // Override via CORS_ORIGINS env var in production: e.g. "https://app.example.com"
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((val) => val.split(',').map((origin) => origin.trim())),

  // MongoDB
  MONGO_URI: z.string().default('mongodb://localhost:27017'),
  MONGO_DB_NAME: z.string().default('seo_crawler'),
  MONGO_MAX_POOL_SIZE: z.string().transform(Number).pipe(z.number().int().positive()).default('50'),
  MONGO_MIN_POOL_SIZE: z.string().transform(Number).pipe(z.number().int().nonnegative()).default('5'),
  MONGO_MAX_IDLE_TIME_MS: z.string().transform(Number).pipe(z.number().int().nonnegative()).default('30000'),
  MONGO_WAIT_QUEUE_TIMEOUT_MS: z.string().transform(Number).pipe(z.number().int().nonnegative()).default('5000'),

  // Messaging
  RABBITMQ_URL: z.string().default('amqp://admin:admin@localhost:5672'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ALLOW_LOCAL_INFRA_IN_PROD: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .default('false'),

  // Python backend (npy-backend) HTTP API URL — for synchronous endpoints such as brand description
  NPY_BACKEND_URL: z.string().default('http://localhost:8001'),

  // Google OAuth 2.0
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Google Analytics OAuth redirect
  GOOGLE_ANALYTICS_REDIRECT_URI: z
    .string()
    .optional()
    .default('http://localhost:3004/api/v1/auth/google/analytics/callback'),

  // Frontend URL for post-OAuth redirects
  FRONTEND_URL: z.string().optional().default('http://localhost:3000'),

  // URL-level result cache TTL.
  // Applies to both the root crawl entry and each per-module result slot.
  // Set to 0 to disable caching entirely.
  URL_CACHE_TTL_DAYS: z.coerce.number().int().nonnegative().default(7),

  // Brand Mentions — SerpAPI (https://serpapi.com)
  SERPAPI_KEY: z.string().optional().default(''),

  // GEO Content Generator — Anthropic Claude
  ANTHROPIC_API_KEY: z.string().optional().default(''),
});

const isLocalInfraUrl = (value: string): boolean => {
  const v = value.toLowerCase();
  return (
    v.includes('localhost') ||
    v.includes('127.0.0.1') ||
    v.includes('@rabbitmq:') ||
    v.startsWith('redis://redis:')
  );
};

// Validate and export environment variables
const parseEnv = () => {
  try {
    const parsed = envSchema.parse(process.env);

    // Prevent accidental production deploys tied to local Docker infra.
    if (
      parsed.NODE_ENV === 'production' &&
      !parsed.ALLOW_LOCAL_INFRA_IN_PROD &&
      (isLocalInfraUrl(parsed.RABBITMQ_URL) || isLocalInfraUrl(parsed.REDIS_URL))
    ) {
      console.error('❌ Unsafe production infra configuration detected:');
      console.error('  - RABBITMQ_URL/REDIS_URL point to local/container endpoints.');
      console.error('  - Set external service URLs for production deployment.');
      console.error('  - If intentional, set ALLOW_LOCAL_INFRA_IN_PROD=true.');
      process.exit(1);
    }

    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const env = parseEnv();
